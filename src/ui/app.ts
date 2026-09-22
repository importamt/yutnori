import { AudioEngine } from '../audio/engine';
import type { NodeId } from '../game/board';
import {
  adminClearPending,
  adminEndTurn,
  adminFinishGame,
  adminGrantExtraThrow,
  adminMovePiece,
  adminOpenQuiz,
  adminResume,
  adminSetTurn,
  adminUpdateTeam,
  answerQuiz,
  applyMove,
  createGame,
  inputThrow,
  setQuestions,
  skipQuiz,
  type GameEvent,
  type GameState,
} from '../game/engine';
import { validateQuestions, type Question } from '../game/quiz';
import { GameStore } from '../game/store';
import { YUT_INFO, type YutResult } from '../game/yut';
import { BoardScene } from '../render/scene';
import { SAMPLE_QUESTIONS } from '../data/sampleQuestions';
import { append, clear, downloadText, el, pouchIcon, readFileText } from './dom';
import { Panel, type AdminTool } from './panel';
import { QuizModal } from './quiz';
import { SetupScreen } from './setup';

export class App {
  private store = new GameStore();
  private audio = new AudioEngine();
  private scene: BoardScene;
  private panel: Panel;
  private quiz: QuizModal;
  private setup: SetupScreen;
  private banner: HTMLElement;
  private toastBox: HTMLElement;
  private questions: Question[] = SAMPLE_QUESTIONS;
  private busy = false;
  private panelHidden = false;

  constructor(private root: HTMLElement) {
    const stage = el('div', { class: 'stage' });
    root.append(stage);
    this.scene = new BoardScene(stage);
    // 틸트시프트 느낌의 상/하단 흐림
    stage.append(el('div', { class: 'tilt top' }), el('div', { class: 'tilt bottom' }));

    this.banner = el('header', { class: 'banner rpg' });
    root.append(this.banner);
    this.toastBox = el('div', { class: 'toasts' });
    root.append(this.toastBox);

    this.panel = new Panel(root, this.actions());
    root.append(el('button', { class: 'panel-toggle rpg', title: '패널 펼치기 (Tab)', onClick: () => this.togglePanel() }, '▶ MENU'));

    this.quiz = new QuizModal(root, {
      onReveal: (_c, correct) => (correct ? this.audio.sfxCorrect() : this.audio.sfxWrong()),
      onApply: (choice) => this.store.dispatch((s) => answerQuiz(s, choice)),
      onSkip: () => this.store.dispatch(skipQuiz),
    });

    const saved = GameStore.loadSaved();
    this.setup = new SetupScreen(root, {
      hasSave: !!saved,
      savedSummary: saved ? summarize(saved.state, saved.savedAt) : null,
      onStart: ({ teams, piecesPerTeam }) => {
        this.setup.hide();
        this.store.start(createGame({ teams, piecesPerTeam, questions: this.questions }));
        this.audio.resume();
      },
      onResume: () => {
        const file = GameStore.loadSaved();
        if (!file) return;
        this.setup.hide();
        this.store.restore(file);
        this.audio.resume();
      },
    });

    this.store.subscribe((s, ev) => this.onState(s, ev));
    this.audio.onChange = () => this.refreshPanel();
    this.bindScene();
    this.bindKeys();
    this.loadQuestionFile();
  }

  // ───────────── 상태 → 화면 ─────────────

  private async onState(state: GameState, events: GameEvent[]): Promise<void> {
    this.busy = true;
    this.refreshPanel();
    this.renderBanner(state);
    if (this.quiz.isOpen && state.phase !== 'quiz') this.quiz.close();

    for (const ev of events) {
      if (ev.type === 'throw') {
        this.audio.sfxThrow(ev.result);
        this.toast(YUT_INFO[ev.result].label, YUT_INFO[ev.result].description, `yut-${ev.result}`);
      }
      if (ev.type === 'catch') {
        this.audio.sfxCatch();
        this.toast('잡았다!', `${this.teamName(state, ev.byTeamId)} · 한 번 더`, 'catch');
      }
      if (ev.type === 'quizResult') this.toast(ev.correct ? '정답!' : '오답', ev.correct ? '앞으로 2칸' : '뒤로 2칸', ev.correct ? 'ok' : 'no');
      if (ev.type === 'teamFinished') {
        this.audio.sfxFinish();
        this.toast(`${['🥇', '🥈', '🥉'][ev.rank - 1] ?? `${ev.rank}위`} ${this.teamName(state, ev.teamId)}`, '모든 말 완주!', 'finish');
      }
      if (ev.type === 'turn' && ev.extra) this.toast('한 번 더!', this.teamName(state, ev.teamId), 'extra');
    }

    const animated = events.some((e) => e.type === 'move' || e.type === 'catch' || e.type === 'quiz' || e.type === 'teamFinished');
    if (animated) await this.scene.playEvents(state, events);
    else this.scene.sync(state);

    this.busy = false;
    this.afterState(state, events);
  }

  private afterState(state: GameState, events: GameEvent[]): void {
    this.refreshPanel();
    this.scene.clearHighlights();
    if (state.phase === 'move') {
      const cur = this.panel.currentOptions();
      if (cur) {
        this.scene.showOptions(cur.options);
        if (cur.options.length === 1 && cur.options[0].kind === 'enter' && state.pending.length === 1) {
          // 선택지가 하나뿐이면 오퍼레이터가 클릭 한 번 아끼도록 자동 이동
          setTimeout(() => this.store.dispatch((s) => (s.phase === 'move' ? applyMove(s, 0, cur.options[0]) : s)), 350);
        }
      }
    }
    if (state.phase === 'quiz' && state.quiz) {
      const q = state.questions.find((x) => x.id === state.quiz!.questionId);
      const team = state.teams.find((t) => t.id === state.quiz!.teamId)!;
      if (q && !this.quiz.isOpen) {
        if (events.some((e) => e.type === 'quiz')) this.audio.sfxQuizOpen();
        this.quiz.open(q, team.name, team.color);
      }
    }
    if (events.some((e) => e.type === 'turn' && !e.extra) && state.phase === 'throw') this.audio.sfxTurn();
  }

  private refreshPanel(): void {
    const s = this.store.current;
    if (!s) return;
    this.panel.update(
      s,
      {
        playing: this.audio.isPlaying,
        source: this.audio.musicSource,
        fileName: this.audio.fileName,
        musicVolume: this.audio.musicVolume,
        sfxVolume: this.audio.sfxVolume,
        sfxEnabled: this.audio.sfxEnabled,
      },
      this.store.canUndo,
      this.busy,
    );
  }

  private renderBanner(s: GameState): void {
    clear(this.banner);
    const team = s.teams[s.turnIndex];
    const phaseText =
      s.phase === 'finished'
        ? '게임 종료'
        : s.phase === 'quiz'
          ? '퀴즈 진행 중'
          : s.phase === 'move'
            ? `말을 움직이세요 (${summarizePending(s.pending)})`
            : s.extraThrow
              ? '한 번 더 던지세요!'
              : '윷을 던지세요';
    const ranks = s.finishOrder.map((tid, i) => el('span', { class: 'rank' }, `${['🥇', '🥈', '🥉'][i] ?? `${i + 1}위`} ${this.teamName(s, tid)}`));
    append(
      this.banner,
      [el('div', { class: 'brand' }, pouchIcon(), el('h1', {}, '한가위 윷놀이')),
      el(
        'div',
        { class: 'turn', style: `--team:${team?.color ?? '#999'}` },
        el('span', { class: 'turn-label' }, 'TURN'),
        el('span', { class: 'turn-team' }, el('i', { class: 'sq', style: `background:${team?.color ?? '#999'}` }), team?.name ?? '-'),
        el('span', { class: 'turn-phase' }, phaseText),
      ),
      ranks.length ? el('div', { class: 'ranks' }, ...ranks) : null],
    );
  }

  private teamName(s: GameState, id: string): string {
    return s.teams.find((t) => t.id === id)?.name ?? id;
  }

  private toast(title: string, sub: string, kind: string): void {
    const t = el('div', { class: `toast ${kind}` }, el('b', {}, title), el('span', {}, sub));
    while (this.toastBox.children.length >= 2) this.toastBox.firstElementChild?.remove();
    this.toastBox.append(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 400);
    }, 1500);
  }

  // ───────────── 액션 ─────────────

  private actions() {
    const d = (fn: (s: GameState) => GameState) => this.store.dispatch(fn);
    return {
      throw: (r: YutResult) => {
        if (this.busy) return;
        d((s) => inputThrow(s, r));
      },
      applyOption: (i: number, opt: Parameters<typeof applyMove>[2]) => {
        if (this.busy) return;
        d((s) => applyMove(s, i, opt));
      },
      undo: () => {
        if (this.busy) return;
        this.quiz.close();
        this.store.undo();
      },
      endTurn: () => d(adminEndTurn),
      adminMove: (pieceId: string, dest: Parameters<typeof adminMovePiece>[2]) => {
        d((s) => adminMovePiece(s, pieceId, dest));
        this.setAdminTool('none', null);
      },
      adminSetTurn: (i: number) => d((s) => adminSetTurn(s, i)),
      adminExtraThrow: () => d(adminGrantExtraThrow),
      adminClearPending: () => d(adminClearPending),
      adminQuiz: (qid?: string) => d((s) => adminOpenQuiz(s, qid)),
      adminFinish: () => d(adminFinishGame),
      adminResume: () => d(adminResume),
      updateTeam: (id: string, patch: { name?: string; color?: string }) => d((s) => adminUpdateTeam(s, id, patch)),
      loadQuestions: async (file: File) => {
        try {
          const qs = validateQuestions(JSON.parse(await readFileText(file)));
          this.questions = qs;
          d((s) => setQuestions(s, qs));
          this.toast('문제 불러옴', `${qs.length}개`, 'ok');
        } catch (e) {
          alert(`문제 파일 오류: ${(e as Error).message}`);
        }
      },
      resetQuestions: () => d((s) => ({ ...s, usedQuestionIds: [], events: [], seq: s.seq + 1 })),
      exportState: () => downloadText(`yutnori-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, this.store.exportJson()),
      importState: async (file: File) => {
        try {
          this.store.importJson(await readFileText(file));
          this.setup.hide();
        } catch (e) {
          alert(`불러오기 실패: ${(e as Error).message}`);
        }
      },
      newGame: () => {
        this.store.clear();
        this.quiz.close();
        this.setup.show(false, null);
      },
      setView: (v: Parameters<BoardScene['setView']>[0]) => this.scene.setView(v),
      setAdminTool: (tool: AdminTool) => this.setAdminTool(tool, tool === 'moveDest' ? this.panel.adminPiece : null),
      togglePanel: () => this.togglePanel(),
      music: {
        toggle: () => this.audio.toggle(),
        setSource: (src: 'builtin' | 'file') => this.audio.setSource(src),
        loadFile: (f: File) => this.audio.loadFile(f).catch((e) => alert(`음악 파일을 열 수 없습니다: ${(e as Error).message}`)),
        setMusicVolume: (v: number) => this.audio.setMusicVolume(v),
        setSfxVolume: (v: number) => this.audio.setSfxVolume(v),
        toggleSfx: () => {
          this.audio.sfxEnabled = !this.audio.sfxEnabled;
          this.refreshPanel();
        },
      },
    };
  }

  // ───────────── 판 클릭 ─────────────

  private bindScene(): void {
    this.scene.callbacks = {
      onHop: () => this.audio.sfxHop(),
      onOptionClick: (i) => {
        const cur = this.panel.currentOptions();
        if (cur && cur.options[i] && !this.busy) this.store.dispatch((s) => applyMove(s, this.panel.pendingIndex, cur.options[i]));
      },
      onPieceClick: (pieceId) => {
        const s = this.store.current;
        if (!s) return;
        if (this.panel.adminTool === 'movePick' || this.panel.adminTool === 'moveDest') {
          this.setAdminTool('moveDest', pieceId);
          return;
        }
        if (this.panel.adminTool === 'teamPick') {
          const piece = s.pieces.find((p) => p.id === pieceId);
          if (piece) this.pickTeam(piece.teamId);
          return;
        }
        const cur = this.panel.currentOptions();
        if (!cur || this.busy) return;
        const opt = cur.options.find((o) => o.pieceIds.includes(pieceId));
        if (opt) this.store.dispatch((st) => applyMove(st, this.panel.pendingIndex, opt));
      },
      onNodeClick: (nodeId: NodeId) => {
        if (this.panel.adminTool !== 'moveDest' || !this.panel.adminPiece || this.busy) return;
        const id = this.panel.adminPiece;
        this.store.dispatch((s) => adminMovePiece(s, id, nodeId));
        this.setAdminTool('none', null);
      },
      onTeamClick: (teamId: string) => {
        if (this.panel.adminTool === 'teamPick') this.pickTeam(teamId);
      },
    };
  }

  private setAdminTool(tool: AdminTool, pieceId: string | null): void {
    this.panel.setAdminState(tool, pieceId);
    this.scene.adminMode = tool !== 'none';
    this.scene.markSelected(pieceId);
  }

  private pickTeam(teamId: string): void {
    const s = this.store.current;
    if (!s) return;
    const idx = s.teams.findIndex((t) => t.id === teamId);
    if (idx >= 0) this.store.dispatch((st) => adminSetTurn(st, idx));
    this.setAdminTool('none', null);
  }

  private heldKeys = new Set<string>();
  private lastHotkeyAt = 0;

  private bindKeys(): void {
    window.addEventListener('keyup', (e) => this.heldKeys.delete(e.key));
    window.addEventListener('blur', () => this.heldKeys.clear());
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (!this.store.current) return;
      const map: Record<string, YutResult> = { '1': 'do', '2': 'gae', '3': 'geol', '4': 'yut', '5': 'mo', b: 'backdo', B: 'backdo', '0': 'nak' };
      if (map[e.key]) {
        // 키를 누르고 있는 동안의 반복 입력과 200ms 내 중복 입력은 한 번으로 취급 (실제 던지기는 1회씩)
        const now = performance.now();
        if (this.heldKeys.has(e.key) || now - this.lastHotkeyAt < 200) return;
        this.heldKeys.add(e.key);
        this.lastHotkeyAt = now;
        if (this.store.current.phase === 'throw') this.actions().throw(map[e.key]);
        return;
      }
      if ((e.key === 'z' || e.key === 'Z') && !this.quiz.isOpen) {
        e.preventDefault();
        this.actions().undo();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.togglePanel();
      } else if (e.key === 'm' || e.key === 'M') {
        this.audio.toggle();
      }
    });
  }

  private togglePanel(): void {
    this.panelHidden = !this.panelHidden;
    this.root.classList.toggle('panel-hidden', this.panelHidden);
  }

  /** public/questions.json 이 있으면 샘플 대신 사용 */
  private async loadQuestionFile(): Promise<void> {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}questions.json`, { cache: 'no-store' });
      if (!res.ok) return;
      const qs = validateQuestions(await res.json());
      if (qs.length) {
        this.questions = qs;
        const cur = this.store.current;
        if (cur && cur.questions === SAMPLE_QUESTIONS) this.store.dispatch((s) => setQuestions(s, qs));
      }
    } catch {
      /* 파일 없음 → 샘플 사용 */
    }
  }
}

function summarizePending(pending: YutResult[]): string {
  const counts = new Map<YutResult, number>();
  for (const r of pending) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.entries()].map(([r, n]) => (n > 1 ? `${YUT_INFO[r].label}×${n}` : YUT_INFO[r].label)).join(' · ');
}

function summarize(state: GameState, savedAt: number): string {
  const d = new Date(savedAt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${state.teams.length}팀 · 팀당 말 ${state.piecesPerTeam}개 · ${state.teams[state.turnIndex]?.name ?? ''} 차례 · ${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm} 저장`;
}
