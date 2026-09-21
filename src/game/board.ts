/**
 * 윷판 정의 (참조 이미지 기준)
 *
 *  10 — 9 — 8 — 7 — 6 — 5
 *  |  B1              A1  |
 *  11     B2      A2      4
 *  12         C           3
 *  13     A3      B3      2
 *  14  A4              B4 |
 *  15 — 16 — 17 — 18 — 19 — S(출발)
 *
 *  지름길 A: 5 → A1 → A2 → C → A3 → A4 → 15
 *  지름길 B: 10 → B1 → B2 → C → B3 → B4 → S(완주)
 */

export type NodeId =
  | 'S'
  | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19'
  | 'A1' | 'A2' | 'A3' | 'A4'
  | 'B1' | 'B2' | 'B3' | 'B4'
  | 'C';

export type Dest = NodeId | 'DONE';

export type NodeKind = 'start' | 'corner' | 'center' | 'normal' | 'quiz';

export interface BoardNode {
  id: NodeId;
  /** 보드 좌표. 중앙 (0,0), 우측 +x, 아래 +y, 범위 [-1, 1] */
  x: number;
  y: number;
  kind: NodeKind;
  label: string;
}

export const QUIZ_NODES: ReadonlySet<NodeId> = new Set<NodeId>(['6', '9', '12', '16', '19', 'A2', 'B3']);

const T = 1 / 3;

function ring(id: NodeId, x: number, y: number): BoardNode {
  return { id, x, y, kind: QUIZ_NODES.has(id) ? 'quiz' : 'normal', label: id };
}

export const BOARD: { nodes: BoardNode[] } = {
  nodes: [
    { id: 'S', x: 1, y: 1, kind: 'start', label: '출발' },
    ring('1', 1, 0.6), ring('2', 1, 0.2), ring('3', 1, -0.2), ring('4', 1, -0.6),
    { id: '5', x: 1, y: -1, kind: 'corner', label: '5' },
    ring('6', 0.6, -1), ring('7', 0.2, -1), ring('8', -0.2, -1), ring('9', -0.6, -1),
    { id: '10', x: -1, y: -1, kind: 'corner', label: '10' },
    ring('11', -1, -0.6), ring('12', -1, -0.2), ring('13', -1, 0.2), ring('14', -1, 0.6),
    { id: '15', x: -1, y: 1, kind: 'corner', label: '15' },
    ring('16', -0.6, 1), ring('17', -0.2, 1), ring('18', 0.2, 1), ring('19', 0.6, 1),
    ring('A1', 2 * T, -2 * T), ring('A2', T, -T), ring('A3', -T, T), ring('A4', -2 * T, 2 * T),
    ring('B1', -2 * T, -2 * T), ring('B2', -T, -T), ring('B3', T, T), ring('B4', 2 * T, 2 * T),
    { id: 'C', x: 0, y: 0, kind: 'center', label: 'C' },
  ],
};

const NODE_MAP = new Map<NodeId, BoardNode>(BOARD.nodes.map((n) => [n.id, n]));

export function nodeById(id: NodeId): BoardNode {
  const n = NODE_MAP.get(id);
  if (!n) throw new Error(`Unknown node: ${id}`);
  return n;
}

export const ALL_NODE_IDS: NodeId[] = BOARD.nodes.map((n) => n.id);

/** 판 위 연결선 (렌더링용) */
export const EDGES: Array<[NodeId, NodeId]> = [
  ['S', '1'], ['1', '2'], ['2', '3'], ['3', '4'], ['4', '5'],
  ['5', '6'], ['6', '7'], ['7', '8'], ['8', '9'], ['9', '10'],
  ['10', '11'], ['11', '12'], ['12', '13'], ['13', '14'], ['14', '15'],
  ['15', '16'], ['16', '17'], ['17', '18'], ['18', '19'], ['19', 'S'],
  ['5', 'A1'], ['A1', 'A2'], ['A2', 'C'], ['C', 'A3'], ['A3', 'A4'], ['A4', '15'],
  ['10', 'B1'], ['B1', 'B2'], ['B2', 'C'], ['C', 'B3'], ['B3', 'B4'], ['B4', 'S'],
];

/** 다음 칸 계산. isStart: 이 칸에서 이동을 시작하는가. prev: 직전에 지나온 칸 */
function nextNode(node: NodeId, isStart: boolean, prev: NodeId | null): Dest {
  switch (node) {
    case 'S': return '1';
    case '5': return isStart ? 'A1' : '6';
    case '10': return isStart ? 'B1' : '11';
    case '15': return '16';
    case '19': return 'DONE';
    case 'A1': return 'A2';
    case 'A2': return 'C';
    case 'A3': return 'A4';
    case 'A4': return '15';
    case 'B1': return 'B2';
    case 'B2': return 'C';
    case 'B3': return 'B4';
    case 'B4': return 'DONE';
    case 'C':
      if (isStart) return 'B3';
      return prev === 'A2' ? 'A3' : 'B3';
    default:
      return String(Number(node) + 1) as NodeId;
  }
}

/** 이동 경로(trail)가 없을 때 사용하는 기본 이전 칸 */
const DEFAULT_PREV: Record<NodeId, NodeId> = {
  S: 'S', '1': 'S', '2': '1', '3': '2', '4': '3', '5': '4', '6': '5', '7': '6', '8': '7', '9': '8',
  '10': '9', '11': '10', '12': '11', '13': '12', '14': '13', '15': '14', '16': '15', '17': '16',
  '18': '17', '19': '18',
  A1: '5', A2: 'A1', A3: 'C', A4: 'A3',
  B1: '10', B2: 'B1', B3: 'C', B4: 'B3',
  C: 'B2',
};

export interface Locatable {
  /** null = 대기(집) */
  node: NodeId | null;
  /** 지나온 칸 (현재 칸 포함, 시간순) */
  trail: NodeId[];
}

export interface PathResult {
  path: Dest[];
  dest: Dest;
}

/**
 * steps 만큼 이동한 경로를 계산한다.
 * 양수: 전진, 음수: 후진(백도/퀴즈 오답). 후진은 trail 을 우선 따라간다.
 * 대기 중인 말은 후진할 수 없다 (null 반환).
 */
export function computePath(piece: Locatable, steps: number): PathResult | null {
  if (steps === 0) return null;

  if (steps > 0) {
    const path: Dest[] = [];
    let cur: NodeId = piece.node ?? 'S';
    let prev: NodeId | null = piece.node ? piece.trail[piece.trail.length - 2] ?? null : null;
    for (let i = 0; i < steps; i++) {
      const nxt = nextNode(cur, i === 0, prev);
      path.push(nxt);
      if (nxt === 'DONE') break;
      prev = cur;
      cur = nxt;
    }
    return { path, dest: path[path.length - 1] };
  }

  if (piece.node === null) return null;
  const trail = [...piece.trail];
  if (trail[trail.length - 1] !== piece.node) trail.push(piece.node);
  const path: Dest[] = [];
  let cur: NodeId = piece.node;
  for (let i = 0; i < -steps; i++) {
    if (cur === 'S') break;
    trail.pop();
    const back: NodeId = trail.length > 0 ? trail[trail.length - 1] : DEFAULT_PREV[cur];
    path.push(back);
    cur = back;
  }
  if (path.length === 0) return null;
  return { path, dest: path[path.length - 1] };
}

/** 이동 후의 trail 계산 */
export function nextTrail(piece: Locatable, steps: number, path: Dest[]): NodeId[] {
  const base = piece.node ? (piece.trail.length ? [...piece.trail] : [piece.node]) : ['S' as NodeId];
  if (steps > 0) {
    for (const p of path) if (p !== 'DONE') base.push(p);
    return base;
  }
  for (let i = 0; i < path.length; i++) base.pop();
  const last = path[path.length - 1];
  if (last !== 'DONE' && base[base.length - 1] !== last) base.push(last);
  return base;
}
