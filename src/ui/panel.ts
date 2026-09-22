import { currentTeam, movableOptions, type AdminDest, type GameState, type MoveOption, type Team } from '../game/engine';
import { YUT_INFO, YUT_ORDER, type YutResult } from '../game/yut';
import type { MusicSource } from '../audio/engine';
import type { ViewPreset } from '../render/scene';
import { clear, el } from './dom';

export type Mode = 'play' | 'teams' | 'admin' | 'music';
/** none: 없음 · movePick: 이동할 말 클릭 대기 · moveDest: 목적지 칸 클릭 대기 · teamPick: 팻말 클릭 대기 */
export type AdminTool = 'none' | 'movePick' | 'moveDest' | 'teamPick';

export interface PanelActions {
  throw: (r: YutResult) => void;
  applyOption: (pendingIndex: number, opt: MoveOption) => void;
  undo: () => void;
  endTurn: () => void;
  adminMove: (pieceId: string, dest: AdminDest) => void;
  adminSetTurn: (teamIndex: number) => void;
  adminExtraThrow: () => void;
  adminClearPending: () => void;
  adminQuiz: (questionId?: string) => void;
  adminFinish: () => void;
  adminResume: () => void;
  updateTeam: (teamId: string, patch: Partial<Pick<Team, 'name' | 'color'>>) => void;
  loadQuestions: (file: File) => void;
  resetQuestions: () => void;
  exportState: () => void;
  importState: (file: File) => void;
  newGame: () => void;
  setView: (v: ViewPreset) => void;
  /** 관리자 클릭 도구 변경 (판에서 말/칸/팻말을 클릭해 조작) */
  setAdminTool: (tool: AdminTool) => void;
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
  adminTool: AdminTool = 'none';
  adminPiece: string | null = null;
  private adminQuizQ = '';
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

  setAdminState(tool: AdminTool, pieceId: string | null): void {
    this.adminTool = tool;
    this.adminPiece = pieceId;
    if (tool !== 'none') this.mode = 'admin';
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
    const tool = this.adminTool;
    const pieceLabel = (id: string) => {
      const p = s.pieces.find((x) => x.id === id);
      const t = p && s.teams.find((x) => x.id === p.teamId);
      return p && t ? `${t.name} ${id.split('-')[1]}번 (${p.done ? '완주' : p.node ?? '집'})` : id;
    };

    // 말 이동: 버튼 → 판에서 말 클릭 → 목적지 칸 클릭 (집/완주는 버튼)
    const moveBox = el('div', { class: `box ${tool === 'movePick' || tool === 'moveDest' ? 'active' : ''}` }, el('div', { class: 'box-title' }, '말 이동'));
    if (tool === 'movePick') {
      moveBox.append(
        el('p', { class: 'guide' }, '① 판이나 마당에서 이동할 말을 클릭하세요'),
        el('button', { class: 'pbtn', onClick: () => this.actions.setAdminTool('none') }, '취소'),
      );
    } else if (tool === 'moveDest' && this.adminPiece) {
      const id = this.adminPiece;
      moveBox.append(
        el('p', { class: 'guide' }, `선택: ${pieceLabel(id)}`),
        el('p', { class: 'guide' }, '② 목적지 칸을 클릭하세요. 또는:'),
        el(
          'div',
          { class: 'row2' },
          el('button', { class: 'pbtn', onClick: () => this.actions.adminMove(id, 'HOME') }, '집으로'),
          el('button', { class: 'pbtn', onClick: () => this.actions.adminMove(id, 'DONE') }, '완주 처리'),
        ),
        el(
          'div',
          { class: 'row2' },
          el('button', { class: 'pbtn', onClick: () => this.actions.setAdminTool('movePick') }, '다른 말 선택'),
          el('button', { class: 'pbtn', onClick: () => this.actions.setAdminTool('none') }, '취소'),
        ),
      );
    } else {
      moveBox.append(
        el('button', { class: 'pbtn primary', onClick: () => this.actions.setAdminTool('movePick') }, '말 이동'),
        el('p', { class: 'hint' }, '말을 클릭한 뒤 목적지 칸을 클릭. 잡기·퀴즈는 발동하지 않음.'),
      );
    }
    body.append(moveBox);

    // 차례: 버튼 → 팻말 클릭
    const turnBox = el('div', { class: `box ${tool === 'teamPick' ? 'active' : ''}` }, el('div', { class: 'box-title' }, '차례'));
    if (tool === 'teamPick') {
      turnBox.append(
        el('p', { class: 'guide' }, '차례로 만들 팀의 팻말을 클릭하세요'),
        el('button', { class: 'pbtn', onClick: () => this.actions.setAdminTool('none') }, '취소'),
      );
    } else {
      turnBox.append(
        el(
          'div',
          { class: 'row2' },
          el('button', { class: 'pbtn primary', onClick: () => this.actions.setAdminTool('teamPick') }, '차례 선택'),
          el('button', { class: 'pbtn', onClick: () => this.actions.adminExtraThrow() }, '한 번 더 부여'),
        ),
        el(
          'div',
          { class: 'row2' },
          el('button', { class: 'pbtn', onClick: () => this.actions.adminClearPending() }, '대기 결과 삭제'),
          s.phase === 'finished'
            ? el('button', { class: 'pbtn', onClick: () => this.actions.adminResume() }, '게임 재개')
            : el('button', { class: 'pbtn danger', onClick: () => this.actions.adminFinish() }, '게임 종료'),
        ),
      );
    }
    body.append(turnBox);

    // 퀴즈 수동 출제: 문제 선택 → 노출
    const qSel = el('select', { onChange: (e) => (this.adminQuizQ = (e.target as HTMLSelectElement).value) });
    qSel.append(el('option', { value: '' }, '무작위 (미출제 우선)'));
    for (const q of s.questions) qSel.append(el('option', { value: q.id, selected: this.adminQuizQ === q.id }, `${s.usedQuestionIds.includes(q.id) ? '✓ ' : ''}${q.id}: ${q.text.slice(0, 18)}…`));
    const team = s.teams[s.turnIndex];
    body.append(
      el(
        'div',
        { class: 'box' },
        el('div', { class: 'box-title' }, `퀴즈 수동 출제 (${s.usedQuestionIds.length}/${s.questions.length})`),
        qSel,
        el('button', { class: 'pbtn primary', disabled: s.phase === 'quiz' || !s.questions.length, onClick: () => this.actions.adminQuiz(this.adminQuizQ || undefined) }, `${team?.name ?? ''}에게 노출`),
        el('p', { class: 'hint' }, '결과(+2/-2)는 현재 팀의 판 위 말이 하나일 때 자동 적용, 아니면 이동 없이 기록만.'),
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
