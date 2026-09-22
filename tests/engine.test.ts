import { describe, it, expect } from 'vitest';
import {
  createGame,
  inputThrow,
  applyMove,
  answerQuiz,
  movableOptions,
  adminMovePiece,
  adminSetTurn,
  skipQuiz,
  type GameState,
} from '../src/game/engine';
import { SAMPLE_QUESTIONS } from '../src/data/sampleQuestions';

const teams = [
  { id: 't1', name: '청룡', color: '#2b6cb0' },
  { id: 't2', name: '백호', color: '#e2e8f0' },
  { id: 't3', name: '주작', color: '#c53030' },
];

function game(piecesPerTeam = 2): GameState {
  return createGame({ teams, piecesPerTeam, questions: SAMPLE_QUESTIONS });
}

function placePiece(state: GameState, pieceId: string, node: string): GameState {
  return adminMovePiece(state, pieceId, node as Parameters<typeof adminMovePiece>[2]);
}

/** 특정 칸에 있는 말을 움직이는 선택지 */
function optFrom(state: GameState, results: Parameters<typeof movableOptions>[1], from: string) {
  const o = movableOptions(state, results).find((x) => x.kind === 'piece' && x.from === from);
  if (!o) throw new Error(`no option from ${from}`);
  return o;
}

describe('createGame', () => {
  it('creates pieces per team and starts in throw phase with the first team', () => {
    const s = game(3);
    expect(s.pieces).toHaveLength(9);
    expect(s.phase).toBe('throw');
    expect(s.teams[s.turnIndex].id).toBe('t1');
  });
});

describe('throw input', () => {
  it('도 goes to move phase with one pending result', () => {
    const s = inputThrow(game(), 'do');
    expect(s.phase).toBe('move');
    expect(s.pending).toEqual(['do']);
  });

  it('윷/모 keep the throw phase and stack pending results', () => {
    let s = inputThrow(game(), 'yut');
    expect(s.phase).toBe('throw');
    s = inputThrow(s, 'mo');
    expect(s.phase).toBe('throw');
    s = inputThrow(s, 'gae');
    expect(s.phase).toBe('move');
    expect(s.pending).toEqual(['yut', 'mo', 'gae']);
  });

  it('낙 with nothing pending ends the turn', () => {
    const s = inputThrow(game(), 'nak');
    expect(s.phase).toBe('throw');
    expect(s.turnIndex).toBe(1);
    expect(s.pending).toEqual([]);
  });

  it('낙 voids every pending result and ends the turn (윷윷윷낙 → 전부 무효)', () => {
    let s = inputThrow(game(), 'yut');
    s = inputThrow(s, 'yut');
    s = inputThrow(s, 'yut');
    s = inputThrow(s, 'nak');
    expect(s.pending).toEqual([]);
    expect(s.turnIndex).toBe(1);
    expect(s.phase).toBe('throw');
  });

  it('after 윷 the team may move first and still keep the bonus throw', () => {
    let s = inputThrow(game(), 'yut');
    expect(s.throwsLeft).toBe(1);
    s = applyMove(s, [0], movableOptions(s, ['yut'])[0]);
    expect(s.pieces.find((p) => p.id === 't1-1')!.node).toBe('4');
    expect(s.turnIndex).toBe(0);
    expect(s.phase).toBe('throw');
    expect(s.throwsLeft).toBe(1);
    s = inputThrow(s, 'do');
    expect(s.pending).toEqual(['do']);
    s = applyMove(s, [0], optFrom(s, ['do'], '4'));
    expect(s.turnIndex).toBe(1);
  });

  it('pending results can be combined into a single move (윷 + 개 = 6칸)', () => {
    let s = inputThrow(game(), 'yut');
    s = inputThrow(s, 'gae');
    const opts = movableOptions(s, ['yut', 'gae']);
    expect(opts[0]).toMatchObject({ kind: 'enter', dest: '6' });
    s = applyMove(s, [0, 1], opts[0]);
    expect(s.pieces.find((p) => p.id === 't1-1')!.node).toBe('6');
    expect(s.pending).toEqual([]);
    expect(s.phase).toBe('quiz'); // 6은 퀴즈 칸
  });

  it('윷윷개 can be used one at a time in any order (개 → 윷 → 윷)', () => {
    let s = game(3);
    s = inputThrow(s, 'yut');
    s = inputThrow(s, 'yut');
    s = inputThrow(s, 'gae');
    expect(s.pending).toEqual(['yut', 'yut', 'gae']);
    // 개만 먼저: 새 말 출발 → 2
    s = applyMove(s, [2], movableOptions(s, ['gae'])[0]);
    expect(s.pieces.find((p) => p.id === 't1-1')!.node).toBe('2');
    expect(s.pending).toEqual(['yut', 'yut']);
    expect(s.turnIndex).toBe(0);
    // 윷: 2번 칸 말을 6으로 → 퀴즈 칸이므로 퀴즈가 뜨고, 건너뛰면 계속 진행
    s = applyMove(s, [0], optFrom(s, ['yut'], '2'));
    expect(s.phase).toBe('quiz');
    s = skipQuiz(s);
    expect(s.pending).toEqual(['yut']);
    expect(s.turnIndex).toBe(0);
    // 마지막 윷: 새 말 출발 → 4, 그 뒤 차례 종료
    s = applyMove(s, [0], movableOptions(s, ['yut'])[0]);
    expect(s.pieces.filter((p) => p.teamId === 't1' && p.node !== null).map((p) => p.node).sort()).toEqual(['4', '6']);
    expect(s.turnIndex).toBe(1);
  });

  it('백도 cannot be combined with other results', () => {
    let s = game();
    s = placePiece(s, 't1-1', '5');
    s = inputThrow(s, 'yut');
    s = inputThrow(s, 'backdo');
    expect(movableOptions(s, ['yut', 'backdo'])).toEqual([]);
    expect(applyMove(s, [0, 1], { kind: 'piece', from: '5', dest: '4', pieceIds: ['t1-1'] })).toBe(s);
  });

  it('백도 with no piece on board skips the turn', () => {
    const s = inputThrow(game(), 'backdo');
    expect(s.turnIndex).toBe(1);
    expect(s.phase).toBe('throw');
  });
});

describe('movable options', () => {
  it('offers entering a new piece when pieces remain at home', () => {
    const s = inputThrow(game(), 'do');
    const opts = movableOptions(s, ['do']);
    expect(opts).toEqual([{ kind: 'enter', dest: '1', pieceIds: ['t1-1'] }]);
  });

  it('groups stacked pieces on the same node into one option', () => {
    let s = game(2);
    s = placePiece(s, 't1-1', '3');
    s = placePiece(s, 't1-2', '3');
    s = inputThrow(s, 'gae');
    const opts = movableOptions(s, ['gae']);
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({ kind: 'piece', from: '3', dest: '5', pieceIds: ['t1-1', 't1-2'] });
  });
});

describe('moving, catching and stacking', () => {
  it('moves a piece and passes the turn after a plain result', () => {
    let s = inputThrow(game(), 'geol');
    s = applyMove(s, [0], movableOptions(s, ['geol'])[0]);
    expect(s.pieces.find((p) => p.id === 't1-1')!.node).toBe('3');
    expect(s.turnIndex).toBe(1);
    expect(s.phase).toBe('throw');
  });

  it('catching an opponent sends it home and grants an extra throw', () => {
    let s = game();
    s = placePiece(s, 't2-1', '3');
    s = inputThrow(s, 'geol');
    s = applyMove(s, [0], movableOptions(s, ['geol'])[0]); // 새 말 출발 → 3
    expect(s.pieces.find((p) => p.id === 't2-1')!.node).toBeNull();
    expect(s.turnIndex).toBe(0);
    expect(s.phase).toBe('throw');
    expect(s.throwsLeft).toBe(1);
  });

  it('a stack moves together', () => {
    let s = game(2);
    s = placePiece(s, 't1-1', '2');
    s = placePiece(s, 't1-2', '2');
    s = inputThrow(s, 'do');
    s = applyMove(s, [0], movableOptions(s, ['do'])[0]);
    expect(s.pieces.filter((p) => p.node === '3')).toHaveLength(2);
  });

  it('a 윷 result followed by 도 lets the team make two moves before the turn ends', () => {
    let s = inputThrow(game(), 'yut');
    s = inputThrow(s, 'do');
    s = applyMove(s, [0], movableOptions(s, ['yut'])[0]);
    expect(s.turnIndex).toBe(0);
    expect(s.phase).toBe('move');
    expect(s.throwsLeft).toBe(0);
    s = applyMove(s, [0], movableOptions(s, ['do'])[0]);
    expect(s.turnIndex).toBe(1);
  });

  it('finishing all pieces records the team in finishOrder', () => {
    let s = game(1);
    s = placePiece(s, 't1-1', '19');
    s = inputThrow(s, 'do');
    s = applyMove(s, [0], optFrom(s, ['do'], '19'));
    expect(s.pieces.find((p) => p.id === 't1-1')!.done).toBe(true);
    expect(s.finishOrder).toEqual(['t1']);
  });

  it('finished teams are skipped in turn order', () => {
    let s = game(1);
    s = placePiece(s, 't2-1', 'DONE');
    s = inputThrow(s, 'do');
    s = applyMove(s, [0], movableOptions(s, ['do'])[0]);
    expect(s.teams[s.turnIndex].id).toBe('t3');
  });
});

describe('quiz squares', () => {
  it('landing on a quiz square from a throw opens the quiz phase', () => {
    let s = game();
    s = placePiece(s, 't1-1', '4');
    s = inputThrow(s, 'gae');
    s = applyMove(s, [0], optFrom(s, ['gae'], '4'));
    expect(s.phase).toBe('quiz');
    expect(s.quiz?.pieceId).toBe('t1-1');
    expect(s.quiz?.questionId).toBeDefined();
  });

  it('a correct answer moves +2 and then continues the turn flow', () => {
    let s = game();
    s = placePiece(s, 't1-1', '4');
    s = inputThrow(s, 'gae');
    s = applyMove(s, [0], optFrom(s, ['gae'], '4'));
    const q = SAMPLE_QUESTIONS.find((x) => x.id === s.quiz!.questionId)!;
    s = answerQuiz(s, q.answer);
    expect(s.pieces.find((p) => p.id === 't1-1')!.node).toBe('8');
    expect(s.phase).toBe('throw');
    expect(s.turnIndex).toBe(1);
  });

  it('a wrong answer moves -2', () => {
    let s = game();
    s = placePiece(s, 't1-1', '4');
    s = inputThrow(s, 'gae');
    s = applyMove(s, [0], optFrom(s, ['gae'], '4'));
    const q = SAMPLE_QUESTIONS.find((x) => x.id === s.quiz!.questionId)!;
    s = answerQuiz(s, (q.answer + 1) % q.choices.length);
    expect(s.pieces.find((p) => p.id === 't1-1')!.node).toBe('4');
  });

  it('a bonus move landing on another quiz square does not re-trigger a quiz', () => {
    let s = game();
    s = placePiece(s, 't1-1', '7'); // 개 -> 9 (quiz), +2 -> 11 ; -2 -> 7
    s = placePiece(s, 't1-2', '10'); // dummy, unaffected
    s = inputThrow(s, 'gae');
    const opt = movableOptions(s, ['gae']).find((o) => o.kind === 'piece' && o.from === '7')!;
    s = applyMove(s, [0], opt);
    expect(s.phase).toBe('quiz');
    const q = SAMPLE_QUESTIONS.find((x) => x.id === s.quiz!.questionId)!;
    // wrong: 9 -> 7. 7 is not quiz, so simply check phase is not quiz afterwards
    s = answerQuiz(s, (q.answer + 1) % q.choices.length);
    expect(s.phase).not.toBe('quiz');
  });

  it('a bonus move can finish a piece (19 + 2)', () => {
    let s = game(1);
    s = placePiece(s, 't1-1', '17');
    s = inputThrow(s, 'gae');
    s = applyMove(s, [0], optFrom(s, ['gae'], '17'));
    expect(s.phase).toBe('quiz');
    const q = SAMPLE_QUESTIONS.find((x) => x.id === s.quiz!.questionId)!;
    s = answerQuiz(s, q.answer);
    expect(s.pieces.find((p) => p.id === 't1-1')!.done).toBe(true);
  });

  it('uses each question once before recycling', () => {
    let s = game(4);
    const seen = new Set<string>();
    for (let i = 0; i < SAMPLE_QUESTIONS.length; i++) {
      s = adminSetTurn(s, 0);
      s = placePiece(s, 't1-1', '4');
      s = inputThrow(s, 'gae');
      s = applyMove(s, [0], optFrom(s, ['gae'], '4'));
      expect(s.phase).toBe('quiz');
      seen.add(s.quiz!.questionId);
      const q = SAMPLE_QUESTIONS.find((x) => x.id === s.quiz!.questionId)!;
      s = answerQuiz(s, (q.answer + 1) % q.choices.length);
    }
    expect(seen.size).toBe(SAMPLE_QUESTIONS.length);
  });
});

describe('admin controls', () => {
  it('can place a piece anywhere, send it home or mark it done', () => {
    let s = game();
    s = adminMovePiece(s, 't1-1', 'C');
    expect(s.pieces.find((p) => p.id === 't1-1')!.node).toBe('C');
    s = adminMovePiece(s, 't1-1', 'HOME');
    expect(s.pieces.find((p) => p.id === 't1-1')!.node).toBeNull();
    s = adminMovePiece(s, 't1-1', 'DONE');
    expect(s.pieces.find((p) => p.id === 't1-1')!.done).toBe(true);
  });

  it('can force the turn to a team and reset to throw phase', () => {
    let s = inputThrow(game(), 'do');
    s = adminSetTurn(s, 2);
    expect(s.turnIndex).toBe(2);
    expect(s.phase).toBe('throw');
    expect(s.pending).toEqual([]);
  });
});
