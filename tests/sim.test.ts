import { describe, it, expect } from 'vitest';
import { createGame, inputThrow, applyMove, answerQuiz, movableOptions, currentTeam, type GameState } from '../src/game/engine';
import { SAMPLE_QUESTIONS } from '../src/data/sampleQuestions';
import type { YutResult } from '../src/game/yut';

describe('9-team simulation', () => {
  it('every team gets turns and the game never gets stuck', () => {
    const teams = Array.from({ length: 9 }, (_, i) => ({ id: `t${i + 1}`, name: `T${i + 1}`, color: '#000' }));
    let s: GameState = createGame({ teams, piecesPerTeam: 1, questions: SAMPLE_QUESTIONS });
    let seed = 42;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const results: YutResult[] = ['do', 'gae', 'geol', 'yut', 'mo', 'backdo', 'nak'];
    const turns: string[] = [];
    let lastTeam = '';
    for (let step = 0; step < 4000 && s.phase !== 'finished'; step++) {
      const team = currentTeam(s).id;
      if (team !== lastTeam) { turns.push(team); lastTeam = team; }
      if (s.phase === 'quiz') { s = answerQuiz(s, Math.floor(rnd() * 3)); continue; }
      if (s.throwsLeft > 0 && (s.pending.length === 0 || rnd() < 0.5)) {
        s = inputThrow(s, results[Math.floor(rnd() * results.length)]);
        continue;
      }
      if (s.pending.length) {
        const opts = movableOptions(s, [s.pending[0]]);
        if (opts.length) { s = applyMove(s, [0], opts[Math.floor(rnd() * opts.length)]); continue; }
        // 움직일 수 없는 결과는 엔진이 정리해야 함
        throw new Error(`stuck: team ${team} pending ${s.pending} throwsLeft ${s.throwsLeft} phase ${s.phase}`);
      }
      throw new Error(`stuck without pending: team ${team} throwsLeft ${s.throwsLeft} phase ${s.phase}`);
    }
    const counts = new Map<string, number>();
    for (const t of turns) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of teams) expect(counts.get(t.id) ?? 0, `team ${t.id} never played`).toBeGreaterThan(0);
  });
});
