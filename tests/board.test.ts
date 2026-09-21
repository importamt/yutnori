import { describe, it, expect } from 'vitest';
import { BOARD, QUIZ_NODES, computePath as rawComputePath, nodeById, type Locatable } from '../src/game/board';

/** null 을 허용하지 않는 테스트용 래퍼 (후진 불가 테스트만 raw 사용) */
function computePath(piece: Locatable, steps: number) {
  const r = rawComputePath(piece, steps);
  if (!r) throw new Error('expected a path');
  return r;
}

describe('board definition', () => {
  it('has 29 nodes: S, 1-19, A1-A4, B1-B4, C', () => {
    expect(BOARD.nodes).toHaveLength(29);
    expect(nodeById('S')).toBeDefined();
    expect(nodeById('C')).toBeDefined();
    expect(nodeById('19')).toBeDefined();
  });

  it('marks the yellow quiz nodes from the reference image', () => {
    expect([...QUIZ_NODES].sort()).toEqual(['12', '16', '19', '6', '9', 'A2', 'B3'].sort());
  });
});

describe('computePath forward', () => {
  it('enters the board from home: 도 lands on 1', () => {
    expect(computePath({ node: null, trail: [] }, 1)).toEqual({ path: ['1'], dest: '1' });
  });

  it('walks the outer ring: 모 from home lands on 5', () => {
    expect(computePath({ node: null, trail: [] }, 5).dest).toBe('5');
  });

  it('passes through corner 5 without taking the shortcut', () => {
    expect(computePath({ node: '3', trail: ['3'] }, 3)).toEqual({ path: ['4', '5', '6'], dest: '6' });
  });

  it('takes shortcut A when the move starts on 5', () => {
    expect(computePath({ node: '5', trail: ['5'] }, 3).path).toEqual(['A1', 'A2', 'C']);
  });

  it('continues straight through C toward 15 when passing on route A', () => {
    expect(computePath({ node: 'A1', trail: ['A1'] }, 4).path).toEqual(['A2', 'C', 'A3', 'A4']);
  });

  it('turns toward the finish (B3) when the move starts on C', () => {
    expect(computePath({ node: 'C', trail: ['C'] }, 3)).toEqual({ path: ['B3', 'B4', 'DONE'], dest: 'DONE' });
  });

  it('takes shortcut B when the move starts on 10', () => {
    expect(computePath({ node: '10', trail: ['10'] }, 5).path).toEqual(['B1', 'B2', 'C', 'B3', 'B4']);
  });

  it('passes through 10 without shortcut', () => {
    expect(computePath({ node: '9', trail: ['9'] }, 2).path).toEqual(['10', '11']);
  });

  it('route A rejoins the ring at 15 and continues to 16', () => {
    expect(computePath({ node: 'A4', trail: ['A4'] }, 2).path).toEqual(['15', '16']);
  });

  it('finishes when reaching the start point (19 + 1)', () => {
    expect(computePath({ node: '19', trail: ['19'] }, 1)).toEqual({ path: ['DONE'], dest: 'DONE' });
  });

  it('finishes when overshooting the start point', () => {
    expect(computePath({ node: '18', trail: ['18'] }, 5).dest).toBe('DONE');
  });

  it('a piece resting on S (after 백도) moves to 1', () => {
    expect(computePath({ node: 'S', trail: ['S'] }, 1).path).toEqual(['1']);
  });
});

describe('computePath backward', () => {
  it('백도 follows the trail back', () => {
    expect(computePath({ node: 'C', trail: ['5', 'A1', 'A2', 'C'] }, -1)).toEqual({ path: ['A2'], dest: 'A2' });
  });

  it('백도 from 1 rests on S', () => {
    expect(computePath({ node: '1', trail: ['1'] }, -1)).toEqual({ path: ['S'], dest: 'S' });
  });

  it('uses default previous node when trail is missing', () => {
    expect(computePath({ node: '6', trail: ['6'] }, -2).path).toEqual(['5', '4']);
    expect(computePath({ node: 'A2', trail: ['A2'] }, -2).path).toEqual(['A1', '5']);
  });

  it('clamps at S when moving back past the start', () => {
    expect(computePath({ node: '1', trail: ['1'] }, -2)).toEqual({ path: ['S'], dest: 'S' });
  });

  it('cannot move backward from home', () => {
    expect(rawComputePath({ node: null, trail: [] }, -1)).toBeNull();
  });
});
