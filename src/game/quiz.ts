/** 객관식 보기: 글 + 사진(선택) */
export interface Choice {
  text: string;
  /** 보기 사진 URL (선택). public/ 기준 상대 경로 또는 data URI */
  image?: string;
}

export interface Question {
  id: string;
  /** 문제 본문 */
  text: string;
  /** 문제 대표 이미지 URL (선택). public/ 기준 상대 경로 또는 data URI */
  image?: string;
  /** 2~6개 보기. JSON 에서는 문자열 또는 { text, image } 객체 */
  choices: Choice[];
  /** 정답 인덱스 (0-based) */
  answer: number;
  /** 정답 공개 시 보여줄 해설 (선택) */
  explanation?: string;
}

export const QUIZ_BONUS_STEPS = 2;
export const QUIZ_PENALTY_STEPS = -2;

/** 문자열 보기를 객체로 정규화 */
export function toChoice(raw: unknown): Choice {
  if (typeof raw === 'string') return { text: raw };
  const c = raw as Partial<Choice>;
  return { text: String(c?.text ?? ''), image: typeof c?.image === 'string' && c.image ? c.image : undefined };
}

export function validateQuestions(input: unknown): Question[] {
  if (!Array.isArray(input)) throw new Error('문제 파일은 배열이어야 합니다.');
  return input.map((raw, i) => {
    const q = raw as Partial<Omit<Question, 'choices'>> & { choices?: unknown[] };
    if (typeof q.text !== 'string' || !q.text.trim()) throw new Error(`${i + 1}번 문제: text 가 없습니다.`);
    if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 6) {
      throw new Error(`${i + 1}번 문제: 보기는 2~6개여야 합니다.`);
    }
    if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.choices.length) {
      throw new Error(`${i + 1}번 문제: answer 인덱스가 잘못되었습니다.`);
    }
    if (q.choices.some((c) => !toChoice(c).text.trim())) throw new Error(`${i + 1}번 문제: 비어 있는 보기가 있습니다.`);
    return {
      id: typeof q.id === 'string' && q.id ? q.id : `q${i + 1}`,
      text: q.text,
      image: typeof q.image === 'string' && q.image ? q.image : undefined,
      choices: q.choices.map(toChoice),
      answer: q.answer,
      explanation: typeof q.explanation === 'string' ? q.explanation : undefined,
    };
  });
}
