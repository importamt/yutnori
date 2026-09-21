import type { Team } from '../game/engine';
import { clear, el } from './dom';

export interface SetupResult {
  teams: Team[];
  piecesPerTeam: number;
}

/** 개발국 팀 (Slack #org-* 채널 기준). 9번째부터는 예비 */
const DEFAULT_NAMES = ['백엔드', 'API플랫폼', '서비스플랫폼', '계정플랫폼', '웹라이브', '웹코어', '앱서비스', '플레이어', 'QE', '데이터', '인프라', '디자인'];
const DEFAULT_COLORS = ['#2f6fd6', '#e05a47', '#f7c02c', '#2f9c6a', '#7a4bd1', '#f08a3c', '#1fa9b8', '#c8508f', '#8b5a2b', '#e8e2d2', '#2d2a32', '#9ccc3c'];

export class SetupScreen {
  readonly root: HTMLElement;
  private count = 8;
  private pieces = 2;
  private names: string[] = [...DEFAULT_NAMES];
  private colors: string[] = [...DEFAULT_COLORS];

  constructor(
    parent: HTMLElement,
    private opts: { hasSave: boolean; savedSummary: string | null; onStart: (r: SetupResult) => void; onResume: () => void },
  ) {
    this.root = el('div', { class: 'setup-overlay' });
    parent.appendChild(this.root);
    this.render();
  }

  show(hasSave: boolean, summary: string | null): void {
    this.opts.hasSave = hasSave;
    this.opts.savedSummary = summary;
    this.render();
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private render(): void {
    clear(this.root);
    const rows = el('div', { class: 'team-rows' });
    for (let i = 0; i < this.count; i++) {
      rows.append(
        el(
          'div',
          { class: 'team-row' },
          el('span', { class: 'team-no' }, `${i + 1}`),
          el('input', {
            type: 'color',
            value: this.colors[i],
            onInput: (e) => (this.colors[i] = (e.target as HTMLInputElement).value),
          }),
          el('input', {
            type: 'text',
            class: 'team-name',
            value: this.names[i],
            maxlength: '12',
            placeholder: `${i + 1}팀`,
            onInput: (e) => (this.names[i] = (e.target as HTMLInputElement).value),
          }),
        ),
      );
    }

    const countSel = el('select', { onChange: (e) => { this.count = Number((e.target as HTMLSelectElement).value); this.render(); } });
    for (let n = 2; n <= 12; n++) countSel.append(el('option', { value: String(n), selected: n === this.count }, `${n}팀`));
    const pieceSel = el('select', { onChange: (e) => (this.pieces = Number((e.target as HTMLSelectElement).value)) });
    for (let n = 1; n <= 4; n++) pieceSel.append(el('option', { value: String(n), selected: n === this.pieces }, `팀당 말 ${n}개`));

    const card = el(
      'div',
      { class: 'setup-card rpg' },
      el('div', { class: 'setup-title' }, el('h1', {}, '윷놀이'), el('p', { class: 'sub' }, '팀을 정하고 판을 펼치세요')),
      this.opts.hasSave
        ? el(
            'div',
            { class: 'resume-box' },
            el('div', {}, el('strong', {}, '저장된 게임이 있습니다'), el('div', { class: 'muted' }, this.opts.savedSummary ?? '')),
            el('button', { class: 'pbtn primary', onClick: () => this.opts.onResume() }, '이어서 진행'),
          )
        : null,
      el('div', { class: 'setup-controls' }, countSel, pieceSel),
      rows,
      el('div', { class: 'setup-actions' }, el('button', { class: 'pbtn primary big', onClick: () => this.start() }, '▶ 판 펼치기')),
      el('p', { class: 'hint' }, '팀 이름·색상은 게임 중에도 바꿀 수 있습니다.'),
    );
    this.root.append(card);
  }

  private start(): void {
    const teams: Team[] = [];
    for (let i = 0; i < this.count; i++) {
      teams.push({ id: `t${i + 1}`, name: this.names[i].trim() || `${i + 1}팀`, color: this.colors[i] });
    }
    this.opts.onStart({ teams, piecesPerTeam: this.pieces });
  }
}
