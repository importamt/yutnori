import { ALL_NODE_IDS } from '../game/board';
import { currentTeam, movableOptions, type AdminDest, type GameState, type MoveOption, type Team } from '../game/engine';
import { YUT_INFO, YUT_ORDER, type YutResult } from '../game/yut';
import type { MusicSource } from '../audio/engine';
import type { ViewPreset } from '../render/scene';
import { clear, el } from './dom';

export type Mode = 'play' | 'teams' | 'admin' | 'music';

export interface PanelActions {
  throw: (r: YutResult) => void;
  applyOption: (pendingIndex: number, opt: MoveOption) => void;
  undo: () => void;
  endTurn: () => void;
  adminMove: (pieceId: string, dest: AdminDest) => void;
  adminSetTurn: (teamIndex: number) => void;
  adminExtraThrow: () => void;
  adminClearPending: () => void;
  adminQuiz: (pieceId: string, questionId?: string) => void;
  adminFinish: () => void;
  adminResume: () => void;
  updateTeam: (teamId: string, patch: Partial<Pick<Team, 'name' | 'color'>>) => void;
  loadQuestions: (file: File) => void;
  resetQuestions: () => void;
  exportState: () => void;
  importState: (file: File) => void;
  newGame: () => void;
  setView: (v: ViewPreset) => void;
  setAdminMode: (on: boolean) => void;
  togglePanel: () => void;
  music: {
    toggle: () => void;
    setSource: (s: MusicSource) => void;
    loadFile: (f: File) => void;
    setMusicVolume: (v: number) => void;
    setSfxVolume: (v: number) => void;
    toggleSfx: () => void;
  };
}

export interface MusicView {
  playing: boolean;
  source: MusicSource;
  fileName: string | null;
  musicVolume: number;
  sfxVolume: number;
  sfxEnabled: boolean;
}

/**
 * 오퍼레이터 패널 (RPG 대화창 스타일).
 * 기본 화면은 "윷 입력 → 말 선택" 만 보이고, 팀/관리/음악은 하단 아이콘으로 열어 본다.
 */
export class Panel {
  readonly root: HTMLElement;
  mode: Mode = 'play';
  pendingIndex = 0;
  adminMode = false;
  adminPiece: string | null = null;
  private adminDest: AdminDest = 'HOME';
  private adminQuizQ = '';
  private adminTeam = 0;
  private state: GameState | null = null;
  private music: MusicView | null = null;
  private canUndo = false;
  private busy = false;

  constructor(parent: HTMLElement, private actions: PanelActions) {
    this.root = el('aside', { class: 'panel rpg' });
    parent.appendChild(this.root);
  }

  update(state: GameState, music: MusicView, canUndo: boolean, busy: boolean): void {
    this.state = state;
    this.music = music;
    this.canUndo = canUndo;
    this.busy = busy;
    if (this.pendingIndex >= state.pending.length) this.pendingIndex = 0;
    this.render();
  }

  setAdminPiece(id: string | null): void {
    this.adminPiece = id;
    this.render();
  }

  currentOptions(): { result: YutResult; options: MoveOption[] } | null {
    const s = this.state;
    if (!s || s.phase !== 'move' || !s.pending.length) return null;
    const result = s.pending[this.pendingIndex] ?? s.pending[0];
    return { result, options: movableOptions(s, result) };
  }

  private go(mode: Mode): void {
    this.mode = mode;
    this.render();
  }

  private render(): void {
    const s = this.state;
    if (!s) return;
    clear(this.root);
    const body = el('div', { class: 'panel-body' });
    if (this.mode === 'play') this.renderPlay(body, s);
    else {
      const titles: Record<Mode, string> = { play: '', teams: '팀 현황', admin: '관리자', music: '음악' };
      body.append(el('div', { class: 'sub-head' }, el('button', { class: 'pbtn small', onClick: () => this.go('play') }, '◀ 돌아가기'), el('span', {}, titles[this.mode])));
      if (this.mode === 'teams') this.renderTeams(body, s);
      else if (this.mode === 'admin') this.renderAdmin(body, s);
      else this.renderMusic(body);
    }
    this.root.append(body);
    this.root.append(
      el(
        'footer',
        { class: 'toolbar' },
        el('button', { class: `tbtn ${this.mode === 'teams' ? 'on' : ''}`, title: '팀 현황', onClick: () => this.go(this.mode === 'teams' ? 'play' : 'teams') }, '👥', el('small', {}, '팀')),
        el('button', { class: `tbtn ${this.mode === 'admin' ? 'on' : ''}`, title: '관리자', onClick: () => this.go(this.mode === 'admin' ? 'play' : 'admin') }, '🛠', el('small', {}, '관리')),
        el('button', { class: `tbtn ${this.mode === 'music' ? 'on' : ''} ${this.music?.playing ? 'playing' : ''}`, title: '음악', onClick: () => this.go(this.mode === 'music' ? 'play' : 'music') }, '🎵', el('small', {}, '음악')),
        el('button', { class: 'tbtn', title: '패널 숨기기 (Tab)', onClick: () => this.actions.togglePanel() }, '⛶', el('small', {}, '숨김')),
      ),
    );
  }

  // ───────────── 진행 ─────────────

  private renderPlay(body: HTMLElement, s: GameState): void {
    const team = currentTeam(s);
    const canThrow = s.phase === 'throw' && !this.busy;
    const msg =
      s.phase === 'finished' ? '게임 종료' : s.phase === 'quiz' ? '퀴즈 진행 중…' : s.phase === 'move' ? '움직일 말을 고르세요' : s.extraThrow ? '한 번 더!' : '윷을 던지세요';

    body.append(
      el(
        'div',
        { class: 'turn-box', style: `--team:${team.color}` },
        el('span', { class: 'sq' }),
        el('b', {}, team.name),
        el('span', { class: 'msg' }, msg),
      ),
    );

    body.append(
      el(
        'div',
        { class: 'yut-grid' },
        ...YUT_ORDER.map((r) => {
          const info = YUT_INFO[r];
          return el(
            'button',
            { class: `yut ${r}`, disabled: !canThrow, title: `${info.description} (단축키 ${info.hotkey})`, onClick: () => this.actions.throw(r) },
            el('b', {}, info.label),
            el('small', {}, r === 'nak' ? '무효' : r === 'backdo' ? '-1' : `${info.steps}${info.again ? ' +1턴' : ''}`),
          );
        }),
      ),
    );

    if (s.pending.length) {
      const opts = this.currentOptions();
      body.append(
        el(
          'div',
          { class: 'box' },
          el(
            'div',
            { class: 'pending' },
            ...s.pending.map((r, i) =>
              el('button', { class: `pend ${i === this.pendingIndex ? 'active' : ''}`, onClick: () => { this.pendingIndex = i; this.render(); } }, YUT_INFO[r].label),
            ),
          ),
          el(
            'div',
            { class: 'options' },
            ...(opts && s.phase === 'move'
              ? opts.options.map((o) => {
                  const dest = o.dest === 'DONE' ? '완주 🏁' : o.dest;
                  const label = o.kind === 'enter' ? `새 말 출발 ▶ ${dest}` : `${o.from} 칸 말${o.pieceIds.length > 1 ? `×${o.pieceIds.length}` : ''} ▶ ${dest}`;
                  return el('button', { class: 'pbtn option', disabled: this.busy, onClick: () => this.actions.applyOption(this.pendingIndex, o) }, label);
                })
              : []),
          ),
        ),
      );
    }

    body.append(
      el(
        'div',
        { class: 'row2' },
        el('button', { class: 'pbtn', disabled: !this.canUndo || this.busy, onClick: () => this.actions.undo() }, '↶ 되돌리기'),
        el('button', { class: 'pbtn', disabled: this.busy || s.phase === 'finished', onClick: () => this.actions.endTurn() }, '차례 넘기기 ▶'),
      ),
    );

    body.append(el('ul', { class: 'log' }, ...[...s.log].slice(-4).reverse().map((l) => el('li', {}, l.text))));
  }

  // ───────────── 팀 ─────────────

  private renderTeams(body: HTMLElement, s: GameState): void {
    const list = el('div', { class: 'team-list' });
    s.teams.forEach((t, i) => {
      const ps = s.pieces.filter((p) => p.teamId === t.id);
      const rank = s.finishOrder.indexOf(t.id);
      list.append(
        el(
          'div',
          { class: `team-item ${i === s.turnIndex ? 'current' : ''}` },
          el('input', { type: 'color', value: t.color, onInput: (e) => this.actions.updateTeam(t.id, { color: (e.target as HTMLInputElement).value }) }),
          el('input', { type: 'text', value: t.name, maxlength: '12', onChange: (e) => this.actions.updateTeam(t.id, { name: (e.target as HTMLInputElement).value.trim() || t.name }) }),
          el('span', { class: 'stat' }, `집 ${ps.filter((p) => p.node === null && !p.done).length}`),
          el('span', { class: 'stat' }, `판 ${ps.filter((p) => p.node !== null).length}`),
          el('span', { class: 'stat' }, `완 ${ps.filter((p) => p.done).length}`),
          el('span', { class: 'rank' }, rank >= 0 ? ['🥇', '🥈', '🥉'][rank] ?? `${rank + 1}위` : ''),
        ),
      );
    });
    body.append(list);
  }

  // ───────────── 관리 ─────────────

  private renderAdmin(body: HTMLElement, s: GameState): void {
    const pieceSel = el('select', { onChange: (e) => { this.adminPiece = (e.target as HTMLSelectElement).value || null; this.actions.setAdminMode(this.adminMode); this.render(); } });
    pieceSel.append(el('option', { value: '' }, '말 선택…'));
    for (const t of s.teams) {
      const group = el('optgroup', { label: t.name });
      for (const p of s.pieces.filter((x) => x.teamId === t.id)) {
        group.append(el('option', { value: p.id, selected: this.adminPiece === p.id }, `${t.name} ${p.id.split('-')[1]} (${p.done ? '완주' : p.node ?? '집'})`));
      }
      pieceSel.append(group);
    }
    const destSel = el('select', { onChange: (e) => (this.adminDest = (e.target as HTMLSelectElement).value as AdminDest) });
    destSel.append(el('option', { value: 'HOME', selected: this.adminDest === 'HOME' }, '집(대기)'));
    destSel.append(el('option', { value: 'DONE', selected: this.adminDest === 'DONE' }, '완주'));
    for (const n of ALL_NODE_IDS) destSel.append(el('option', { value: n, selected: this.adminDest === n }, n));

    body.append(
      el(
        'div',
        { class: 'box' },
        el('div', { class: 'box-title' }, '말 이동', el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: this.adminMode, onChange: (e) => { this.adminMode = (e.target as HTMLInputElement).checked; this.actions.setAdminMode(this.adminMode); this.render(); } }), '판 클릭')),
        el('div', { class: 'row2' }, pieceSel, destSel),
        el('button', { class: 'pbtn primary', disabled: !this.adminPiece, onClick: () => this.adminPiece && this.actions.adminMove(this.adminPiece, this.adminDest) }, '이동'),
        el('p', { class: 'hint' }, '판 클릭: 말 클릭 → 칸 클릭. 잡기·퀴즈 발동 없음.'),
      ),
    );

    const teamSel = el('select', { onChange: (e) => (this.adminTeam = Number((e.target as HTMLSelectElement).value)) });
    s.teams.forEach((t, i) => teamSel.append(el('option', { value: String(i), selected: i === this.adminTeam }, t.name)));
    body.append(
      el(
        'div',
        { class: 'box' },
        el('div', { class: 'box-title' }, '차례'),
        el('div', { class: 'row2' }, teamSel, el('button', { class: 'pbtn', onClick: () => this.actions.adminSetTurn(this.adminTeam) }, '이 팀 차례로')),
        el(
          'div',
          { class: 'row2' },
          el('button', { class: 'pbtn', onClick: () => this.actions.adminExtraThrow() }, '한 번 더 부여'),
          el('button', { class: 'pbtn', onClick: () => this.actions.adminClearPending() }, '대기 결과 삭제'),
        ),
        s.phase === 'finished'
          ? el('button', { class: 'pbtn', onClick: () => this.actions.adminResume() }, '게임 재개')
          : el('button', { class: 'pbtn danger', onClick: () => this.actions.adminFinish() }, '게임 종료 (순위 확정)'),
      ),
    );

    const qSel = el('select', { onChange: (e) => (this.adminQuizQ = (e.target as HTMLSelectElement).value) });
    qSel.append(el('option', { value: '' }, '무작위 (미출제 우선)'));
    for (const q of s.questions) qSel.append(el('option', { value: q.id, selected: this.adminQuizQ === q.id }, `${s.usedQuestionIds.includes(q.id) ? '✓ ' : ''}${q.id}: ${q.text.slice(0, 18)}…`));
    const onBoard = this.adminPiece ? s.pieces.find((p) => p.id === this.adminPiece)?.node : null;
    body.append(
      el(
        'div',
        { class: 'box' },
        el('div', { class: 'box-title' }, `퀴즈 수동 출제 (${s.usedQuestionIds.length}/${s.questions.length})`),
        qSel,
        el('button', { class: 'pbtn primary', disabled: !onBoard, onClick: () => this.adminPiece && this.actions.adminQuiz(this.adminPiece, this.adminQuizQ || undefined) }, onBoard ? `${onBoard} 칸 말에 출제` : '위에서 판 위의 말을 선택'),
      ),
    );

    body.append(
      el(
        'div',
        { class: 'box' },
        el('div', { class: 'box-title' }, '데이터 · 화면'),
        el(
          'div',
          { class: 'row2' },
          fileButton('문제 JSON', '.json,application/json', (f) => this.actions.loadQuestions(f)),
          el('button', { class: 'pbtn', onClick: () => this.actions.resetQuestions() }, '출제 기록 초기화'),
        ),
        el(
          'div',
          { class: 'row2' },
          el('button', { class: 'pbtn', onClick: () => this.actions.exportState() }, '상태 저장'),
          fileButton('상태 불러오기', '.json,application/json', (f) => this.actions.importState(f)),
        ),
        el(
          'div',
          { class: 'row2' },
          el('button', { class: 'pbtn', onClick: () => this.actions.setView('default') }, '기본 시점'),
          el('button', { class: 'pbtn', onClick: () => this.actions.setView('top') }, '위에서 보기'),
        ),
        el('button', { class: 'pbtn danger', onClick: () => { if (confirm('현재 게임을 버리고 새 게임을 시작할까요?')) this.actions.newGame(); } }, '새 게임'),
        el('details', { class: 'hint' }, el('summary', {}, '문제 JSON 형식'), el('pre', {}, QUESTION_FORMAT)),
      ),
    );
  }

  // ───────────── 음악 ─────────────

  private renderMusic(body: HTMLElement): void {
    const m = this.music!;
    body.append(
      el(
        'div',
        { class: 'box' },
        el('button', { class: `pbtn primary big ${m.playing ? 'playing' : ''}`, onClick: () => this.actions.music.toggle() }, m.playing ? '❚❚ 정지' : '▶ 재생'),
        el(
          'div',
          { class: 'radio-row' },
          el('label', {}, el('input', { type: 'radio', name: 'src', checked: m.source === 'builtin', onChange: () => this.actions.music.setSource('builtin') }), ' 내장 연주 (가야금·장구)'),
          el('label', {}, el('input', { type: 'radio', name: 'src', checked: m.source === 'file', disabled: !m.fileName, onChange: () => this.actions.music.setSource('file') }), ` 파일${m.fileName ? ` · ${m.fileName}` : ''}`),
        ),
        fileButton('mp3 불러오기', 'audio/*', (f) => this.actions.music.loadFile(f)),
        el('label', { class: 'slider' }, el('span', {}, `음악 ${Math.round(m.musicVolume * 100)}`), el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(m.musicVolume), onInput: (e) => this.actions.music.setMusicVolume(Number((e.target as HTMLInputElement).value)) })),
        el('label', { class: 'slider' }, el('span', {}, `효과음 ${Math.round(m.sfxVolume * 100)}`), el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(m.sfxVolume), onInput: (e) => this.actions.music.setSfxVolume(Number((e.target as HTMLInputElement).value)) })),
        el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: m.sfxEnabled, onChange: () => this.actions.music.toggleSfx() }), '효과음 사용'),
      ),
    );
  }
}

function fileButton(label: string, accept: string, onFile: (f: File) => void): HTMLElement {
  const input = el('input', { type: 'file', accept, class: 'hidden', onChange: (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) onFile(f); (e.target as HTMLInputElement).value = ''; } });
  return el('label', { class: 'pbtn file' }, label, input);
}

const QUESTION_FORMAT = `[
  {
    "id": "q1",
    "text": "문제 내용",
    "image": "quiz/photo.jpg",
    "choices": ["보기1", "보기2", "보기3"],
    "answer": 0,
    "explanation": "해설 (선택)"
  }
]`;
