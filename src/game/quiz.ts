export interface Question {
  id: string;
  /** 문제 본문 */
  text: string;
  /** 이미지 URL (선택). public/ 기준 상대 경로 또는 data URI */
  image?: string;
  /** 3~6개 보기 */
  choices: string[];
  /** 정답 인덱스 (0-based) */
  answer: number;
  /** 정답 공개 시 보여줄 해설 (선택) */
  explanation?: string;
}

export const QUIZ_BONUS_STEPS = 2;
export const QUIZ_PENALTY_STEPS = -2;

export function validateQuestions(input: unknown): Question[] {
  if (!Array.isArray(input)) throw new Error('문제 파일은 배열이어야 합니다.');
  return input.map((raw, i) => {
    const q = raw as Partial<Question>;
    if (typeof q.text !== 'string' || !q.text.trim()) throw new Error(`${i + 1}번 문제: text 가 없습니다.`);
    if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 6) {
      throw new Error(`${i + 1}번 문제: 보기는 2~6개여야 합니다.`);
    }
    if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.choices.length) {
      throw new Error(`${i + 1}번 문제: answer 인덱스가 잘못되었습니다.`);
    }
    return {
      id: typeof q.id === 'string' && q.id ? q.id : `q${i + 1}`,
      text: q.text,
      image: typeof q.image === 'string' && q.image ? q.image : undefined,
      choices: q.choices.map(String),
      answer: q.answer,
      explanation: typeof q.explanation === 'string' ? q.explanation : undefined,
    };
  });
}
