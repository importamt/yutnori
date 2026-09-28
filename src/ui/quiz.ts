import { QUIZ_BONUS_STEPS, QUIZ_PENALTY_STEPS, type Question } from '../game/quiz';
import { clear, el, pouchIcon } from './dom';

/** 보기 번호 (1부터) */
const LETTERS = ['1', '2', '3', '4', '5', '6'];

export interface QuizModalOptions {
  /** 보기 클릭 → 판정 공개 (이동은 아직) */
  onReveal: (choice: number, correct: boolean) => void;
  /** 결과 적용 (+2/-2) */
  onApply: (choice: number) => void;
  onSkip: () => void;
}

/**
 * 퀴즈 모달.
 * 문제(대표 사진 + 글)가 먼저 뜨고, 클릭 / Enter / Space 를 누를 때마다 보기가 1번부터 하나씩 나타난다.
 * 보기가 모두 나온 뒤에야 보기를 클릭해 정답을 판정할 수 있다.
 */
export class QuizModal {
  readonly root: HTMLElement;
  private question: Question | null = null;
  private chosen: number | null = null;
  private revealed = 0;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(parent: HTMLElement, private opts: QuizModalOptions) {
    this.root = el('div', { class: 'quiz-overlay hidden' });
    parent.appendChild(this.root);
    // 카드 빈 곳(보기·버튼 제외)을 클릭하면 다음 보기
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('button, a, input, select')) return;
      this.revealNext();
    });
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(q: Question, teamName: string, teamColor: string): void {
    this.question = q;
    this.chosen = null;
    this.revealed = 0;
    this.render(teamName, teamColor);
    this.root.classList.remove('hidden');
    window.addEventListener('keydown', this.keyHandler);
  }

  close(): void {
    this.root.classList.add('hidden');
    this.question = null;
    window.removeEventListener('keydown', this.keyHandler);
    clear(this.root);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
      e.preventDefault();
      this.revealNext();
    }
  }

  /** 다음 보기를 보여준다. 이미 다 나왔으면 아무 것도 하지 않는다 */
  private revealNext(): void {
    const q = this.question;
    if (!q || this.chosen !== null || this.revealed >= q.choices.length) return;
    const btn = this.root.querySelector<HTMLButtonElement>(`.choice[data-i="${this.revealed}"]`);
    if (!btn) return;
    btn.classList.remove('unrevealed');
    btn.classList.add('revealed');
    this.revealed++;
    this.updateGuide();
  }

  private updateGuide(): void {
    const q = this.question;
    const guide = this.root.querySelector<HTMLElement>('#quiz-guide');
    if (!q || !guide) return;
    const left = q.choices.length - this.revealed;
    const all = left === 0;
    guide.textContent = all ? '팀이 고른 보기를 클릭하세요' : `클릭 · Enter · Space → 다음 보기 (${this.revealed}/${q.choices.length})`;
    guide.classList.toggle('ready', all);
    this.root.querySelectorAll<HTMLButtonElement>('.choice').forEach((b) => (b.disabled = !all));
  }

  private render(teamName: string, teamColor: string): void {
    const q = this.question!;
    clear(this.root);
    const hasChoiceImage = q.choices.some((c) => c.image || c.images?.length);
    const hasChoiceIcon = q.choices.some((c) => c.icon);
    const longText = q.choices.some((c) => c.text.length > 18);
    const choices = el('div', { class: `choices n${q.choices.length} ${hasChoiceImage ? 'with-images' : ''} ${hasChoiceIcon ? 'with-icons' : ''} ${longText ? 'long-text' : ''}` });
    q.choices.forEach((c, i) => {
      choices.append(
        el(
          'button',
          { class: `choice unrevealed ${c.imageSize === 'small' ? 'img-small' : ''}`, 'data-i': String(i), disabled: true, onClick: () => this.reveal(i) },
          c.images?.length
            ? el('div', { class: `choice-imgs n${c.images.length}` }, ...c.images.map((src) => el('img', { class: 'choice-img', src, alt: '' })))
            : c.image
              ? el('img', { class: 'choice-img', src: c.image, alt: '' })
              : null,
          el(
            'div',
            { class: 'choice-row' },
            el('span', { class: 'letter' }, LETTERS[i] ?? String(i + 1)),
            c.icon && !c.image && !c.images?.length ? el('span', { class: 'choice-icon' }, c.icon) : null,
            el('span', { class: 'choice-text' }, c.text),
          ),
        ),
      );
    });
    const card = el(
      'div',
      { class: 'quiz-card rpg' },
      el(
        'div',
        { class: 'quiz-head' },
        el('span', { class: 'quiz-badge' }, pouchIcon(), '퀴즈'),
        el('span', { class: 'quiz-team', style: `--team:${teamColor}` }, el('i', { class: 'sq', style: `background:${teamColor}` }), teamName),
        el('span', { class: 'quiz-guide', id: 'quiz-guide' }),
        el('span', { class: 'quiz-rule' }, `정답 +${QUIZ_BONUS_STEPS} · 오답 ${QUIZ_PENALTY_STEPS}`),
      ),
      el(
        'div',
        { class: `quiz-body ${q.image ? 'with-image' : ''} ${hasChoiceImage ? 'compact' : ''}` },
        q.image ? el('div', { class: 'quiz-image' }, el('img', { src: q.image, alt: '' })) : q.icon ? el('div', { class: 'quiz-icon' }, q.icon) : null,
        el('div', { class: 'quiz-text' }, q.text),
      ),
      choices,
      el(
        'div',
        { class: 'quiz-foot' },
        el('div', { class: 'quiz-result', id: 'quiz-result' }),
        el('div', { class: 'quiz-actions' }, el('button', { class: 'pbtn', onClick: () => this.opts.onSkip() }, '건너뛰기'), el('button', { class: 'pbtn primary big hidden', id: 'quiz-apply' }, '결과 적용')),
      ),
    );
    this.root.append(card);
    this.updateGuide();
  }

  private reveal(i: number): void {
    if (!this.question || this.chosen !== null || this.revealed < this.question.choices.length) return;
    this.chosen = i;
    const q = this.question;
    const correct = i === q.answer;
    this.root.querySelectorAll<HTMLButtonElement>('.choice').forEach((b) => {
      const k = Number(b.dataset.i);
      b.disabled = true;
      if (k === q.answer) b.classList.add('correct');
      else if (k === i) b.classList.add('wrong');
      else b.classList.add('dim');
    });
    const res = this.root.querySelector('#quiz-result')!;
    clear(res as HTMLElement);
    res.append(
      el('div', { class: `verdict ${correct ? 'ok' : 'no'}` }, correct ? `정답! 앞으로 ${QUIZ_BONUS_STEPS}칸` : `오답… 뒤로 ${-QUIZ_PENALTY_STEPS}칸`),
      q.explanation ? el('div', { class: 'explain' }, q.explanation) : el('span'),
    );
    const apply = this.root.querySelector<HTMLButtonElement>('#quiz-apply')!;
    apply.classList.remove('hidden');
    apply.classList.toggle('danger', !correct);
    apply.textContent = correct ? `+${QUIZ_BONUS_STEPS} 적용` : `${QUIZ_PENALTY_STEPS} 적용`;
    apply.onclick = () => this.opts.onApply(i);
    this.opts.onReveal(i, correct);
  }
}
