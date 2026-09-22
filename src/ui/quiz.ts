import type { Question } from '../game/quiz';
import { clear, el, pouchIcon } from './dom';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export interface QuizModalOptions {
  /** 보기 클릭 → 판정 공개 (이동은 아직) */
  onReveal: (choice: number, correct: boolean) => void;
  /** 결과 적용 (+2/-2) */
  onApply: (choice: number) => void;
  onSkip: () => void;
}

export class QuizModal {
  readonly root: HTMLElement;
  private question: Question | null = null;
  private chosen: number | null = null;

  constructor(parent: HTMLElement, private opts: QuizModalOptions) {
    this.root = el('div', { class: 'quiz-overlay hidden' });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(q: Question, teamName: string, teamColor: string, _node: string): void {
    this.question = q;
    this.chosen = null;
    this.render(teamName, teamColor);
    this.root.classList.remove('hidden');
  }

  close(): void {
    this.root.classList.add('hidden');
    this.question = null;
    clear(this.root);
  }

  private render(teamName: string, teamColor: string): void {
    const q = this.question!;
    clear(this.root);
    const choices = el('div', { class: `choices n${q.choices.length}` });
    q.choices.forEach((c, i) => {
      choices.append(
        el(
          'button',
          { class: 'choice', 'data-i': String(i), onClick: () => this.reveal(i) },
          el('span', { class: 'letter' }, LETTERS[i] ?? String(i + 1)),
          el('span', { class: 'choice-text' }, c),
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
        el('span', { class: 'quiz-rule' }, '정답 +2 · 오답 -2'),
      ),
      el(
        'div',
        { class: `quiz-body ${q.image ? 'with-image' : ''}` },
        q.image ? el('div', { class: 'quiz-image' }, el('img', { src: q.image, alt: '' })) : null,
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
  }

  private reveal(i: number): void {
    if (!this.question || this.chosen !== null) return;
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
      el('div', { class: `verdict ${correct ? 'ok' : 'no'}` }, correct ? '정답! 앞으로 2칸' : '오답… 뒤로 2칸'),
      q.explanation ? el('div', { class: 'explain' }, q.explanation) : el('span'),
    );
    const apply = this.root.querySelector<HTMLButtonElement>('#quiz-apply')!;
    apply.classList.remove('hidden');
    apply.classList.toggle('danger', !correct);
    apply.textContent = correct ? '+2 적용' : '-2 적용';
    apply.onclick = () => this.opts.onApply(i);
    this.opts.onReveal(i, correct);
  }
}
