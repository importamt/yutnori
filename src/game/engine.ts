import { computePath, nextTrail, QUIZ_NODES, type Dest, type NodeId } from './board';
import { QUIZ_BONUS_STEPS, QUIZ_PENALTY_STEPS, type Question } from './quiz';
import { YUT_INFO, type YutResult } from './yut';

export interface Team {
  id: string;
  name: string;
  color: string;
}

export interface Piece {
  id: string;
  teamId: string;
  /** null = 대기(집) 또는 완주 */
  node: NodeId | null;
  done: boolean;
  trail: NodeId[];
}

export type Phase = 'throw' | 'move' | 'quiz' | 'finished';

export interface QuizContext {
  /** 결과(+2/-2)를 적용할 말. 수동 출제로 특정 말이 없으면 null → 현재 팀의 판 위 말이 하나일 때만 적용 */
  pieceId: string | null;
  teamId: string;
  questionId: string;
  node: NodeId | null;
  /** 오퍼레이터가 선택한 보기 (판정 후) */
  chosen?: number;
  correct?: boolean;
}

export type GameEvent =
  | { type: 'move'; pieceIds: string[]; path: Dest[]; teamId: string; steps: number }
  | { type: 'catch'; pieceIds: string[]; byTeamId: string; node: NodeId }
  | { type: 'finish'; pieceIds: string[]; teamId: string }
  | { type: 'teamFinished'; teamId: string; rank: number }
  | { type: 'quiz'; pieceId: string | null; node: NodeId | null }
  | { type: 'quizResult'; correct: boolean; teamId: string }
  | { type: 'throw'; result: YutResult; teamId: string }
  | { type: 'turn'; teamId: string; extra: boolean }
  | { type: 'admin'; message: string };

export interface LogEntry {
  t: number;
  text: string;
}

export interface GameState {
  teams: Team[];
  piecesPerTeam: number;
  pieces: Piece[];
  turnIndex: number;
  phase: Phase;
  pending: YutResult[];
  /** 잡기/윷/모 로 얻은 추가 던지기 */
  extraThrow: boolean;
  quiz: QuizContext | null;
  finishOrder: string[];
  questions: Question[];
  usedQuestionIds: string[];
  log: LogEntry[];
  /** 마지막 액션이 만든 이벤트 (렌더링용, 상태 저장 시 무시 가능) */
  events: GameEvent[];
  seq: number;
}

export type MoveOption =
  | { kind: 'enter'; dest: Dest; pieceIds: string[] }
  | { kind: 'piece'; from: NodeId; dest: Dest; pieceIds: string[] };

export interface CreateGameConfig {
  teams: Team[];
  piecesPerTeam: number;
  questions: Question[];
}

const MAX_LOG = 300;

function withLog(state: GameState, text: string): GameState {
  const log = [...state.log, { t: Date.now(), text }];
  if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
  return { ...state, log };
}

function findPiece(state: GameState, id: string): Piece {
  const p = state.pieces.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown piece ${id}`);
  return p;
}

function teamName(state: GameState, teamId: string): string {
  return state.teams.find((t) => t.id === teamId)?.name ?? teamId;
}

export function currentTeam(state: GameState): Team {
  return state.teams[state.turnIndex];
}

export function teamPieces(state: GameState, teamId: string): Piece[] {
  return state.pieces.filter((p) => p.teamId === teamId);
}

export function isTeamFinished(state: GameState, teamId: string): boolean {
  const ps = teamPieces(state, teamId);
  return ps.length > 0 && ps.every((p) => p.done);
}

export function createGame(config: CreateGameConfig): GameState {
  if (config.teams.length < 2) throw new Error('팀은 2개 이상이어야 합니다.');
  const piecesPerTeam = Math.min(4, Math.max(1, Math.floor(config.piecesPerTeam)));
  const pieces: Piece[] = [];
  for (const t of config.teams) {
    for (let i = 1; i <= piecesPerTeam; i++) {
      pieces.push({ id: `${t.id}-${i}`, teamId: t.id, node: null, done: false, trail: [] });
    }
  }
  const state: GameState = {
    teams: config.teams.map((t) => ({ ...t })),
    piecesPerTeam,
    pieces,
    turnIndex: 0,
    phase: 'throw',
    pending: [],
    extraThrow: false,
    quiz: null,
    finishOrder: [],
    questions: config.questions,
    usedQuestionIds: [],
    log: [],
    events: [],
    seq: 0,
  };
  return withLog(state, `게임 시작 · ${config.teams.length}팀 · 팀당 말 ${piecesPerTeam}개`);
}

/** 해당 결과로 움직일 수 있는 선택지 (같은 칸의 말은 하나로 묶임) */
export function movableOptions(state: GameState, result: YutResult): MoveOption[] {
  const steps = YUT_INFO[result].steps;
  if (steps === 0) return [];
  const team = currentTeam(state);
  const mine = teamPieces(state, team.id).filter((p) => !p.done);
  const options: MoveOption[] = [];

  if (steps > 0) {
    const home = mine.filter((p) => p.node === null);
    if (home.length) {
      const r = computePath(home[0], steps)!;
      options.push({ kind: 'enter', dest: r.dest, pieceIds: [home[0].id] });
    }
  }

  const seen = new Set<NodeId>();
  for (const p of mine) {
    if (p.node === null || seen.has(p.node)) continue;
    seen.add(p.node);
    const r = computePath(p, steps);
    if (!r) continue;
    const stack = mine.filter((x) => x.node === p.node).map((x) => x.id);
    options.push({ kind: 'piece', from: p.node, dest: r.dest, pieceIds: stack });
  }
  return options;
}

function nextTurnIndex(state: GameState, from: number): number {
  const n = state.teams.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (!isTeamFinished(state, state.teams[idx].id)) return idx;
  }
  return from;
}

function activeTeamCount(state: GameState): number {
  return state.teams.filter((t) => !isTeamFinished(state, t.id)).length;
}

/** 대기 중인 결과 정리 후 다음 단계 결정 */
function advance(state: GameState): GameState {
  let s = state;
  // 움직일 수 없는 결과 제거
  const pending = s.pending.filter((r) => {
    const ok = movableOptions(s, r).length > 0;
    if (!ok) s = withLog(s, `${YUT_INFO[r].label}: 움직일 수 있는 말이 없어 건너뜁니다.`);
    return ok;
  });
  s = { ...s, pending };

  if (activeTeamCount(s) <= 1 && s.finishOrder.length > 0) {
    return { ...s, phase: 'finished', pending: [], events: [...s.events] };
  }
  if (s.pending.length > 0) return { ...s, phase: 'move' };
  if (s.extraThrow) {
    return {
      ...s,
      phase: 'throw',
      events: [...s.events, { type: 'turn', teamId: currentTeam(s).id, extra: true }],
    };
  }
  return passTurn(s);
}

function passTurn(state: GameState): GameState {
  const idx = nextTurnIndex(state, state.turnIndex);
  const s: GameState = { ...state, turnIndex: idx, phase: 'throw', pending: [], extraThrow: false, quiz: null };
  return {
    ...withLog(s, `▶ ${teamName(s, s.teams[idx].id)} 차례`),
    events: [...s.events, { type: 'turn', teamId: s.teams[idx].id, extra: false }],
  };
}

export function inputThrow(state: GameState, result: YutResult): GameState {
  if (state.phase !== 'throw' && state.phase !== 'move') return state;
  const team = currentTeam(state);
  const info = YUT_INFO[result];
  let s: GameState = { ...state, events: [{ type: 'throw', result, teamId: team.id }], seq: state.seq + 1 };
  s = withLog(s, `${team.name}: ${info.label}`);

  if (result === 'nak') {
    s = { ...s, extraThrow: false };
    if (s.pending.length === 0) {
      s = withLog(s, `${team.name}: 낙! 차례가 넘어갑니다.`);
      return passTurn(s);
    }
    return advance(s);
  }

  s = { ...s, pending: [...s.pending, result], extraThrow: false };
  if (info.again) {
    return withLog({ ...s, phase: 'throw' }, `${info.label}! 한 번 더 던지세요.`);
  }
  return advance(s);
}

interface MoveOutcome {
  state: GameState;
  landedQuiz: NodeId | null;
}

function performMove(
  state: GameState,
  pieceIds: string[],
  steps: number,
  source: 'throw' | 'quiz' | 'admin',
): MoveOutcome {
  const lead = findPiece(state, pieceIds[0]);
  const r = computePath(lead, steps);
  if (!r) return { state, landedQuiz: null };
  const team = currentTeam(state);
  const movers = new Set(pieceIds);
  const trail = nextTrail(lead, steps, r.path);
  const events: GameEvent[] = [...state.events, { type: 'move', pieceIds, path: r.path, teamId: lead.teamId, steps }];
  let s: GameState = { ...state, events };

  if (r.dest === 'DONE') {
    s = {
      ...s,
      pieces: s.pieces.map((p) => (movers.has(p.id) ? { ...p, node: null, done: true, trail: [] } : p)),
    };
    s.events = [...s.events, { type: 'finish', pieceIds, teamId: lead.teamId }];
    s = withLog(s, `${teamName(s, lead.teamId)}: 말 ${pieceIds.length}개 완주!`);
    if (isTeamFinished(s, lead.teamId) && !s.finishOrder.includes(lead.teamId)) {
      s = { ...s, finishOrder: [...s.finishOrder, lead.teamId] };
      const rank = s.finishOrder.length;
      s.events = [...s.events, { type: 'teamFinished', teamId: lead.teamId, rank }];
      s = withLog(s, `🏆 ${teamName(s, lead.teamId)} ${rank}위로 모든 말 완주!`);
    }
    return { state: s, landedQuiz: null };
  }

  const dest = r.dest;
  const victims = s.pieces.filter((p) => p.node === dest && p.teamId !== lead.teamId && !p.done);
  if (victims.length) {
    const vids = new Set(victims.map((v) => v.id));
    s = {
      ...s,
      pieces: s.pieces.map((p) => (vids.has(p.id) ? { ...p, node: null, trail: [] } : p)),
      extraThrow: source === 'admin' ? s.extraThrow : true,
    };
    s.events = [...s.events, { type: 'catch', pieceIds: victims.map((v) => v.id), byTeamId: lead.teamId, node: dest }];
    const victimTeams = [...new Set(victims.map((v) => teamName(s, v.teamId)))].join(', ');
    s = withLog(s, `${teamName(s, lead.teamId)}: ${dest}에서 ${victimTeams} 말을 잡았습니다! 한 번 더`);
  }

  s = {
    ...s,
    pieces: s.pieces.map((p) => (movers.has(p.id) ? { ...p, node: dest, trail: [...trail] } : p)),
  };
  const stacked = s.pieces.filter((p) => p.node === dest && p.teamId === lead.teamId).length;
  const label = source === 'quiz' ? (steps > 0 ? '정답 +2' : '오답 -2') : `${steps > 0 ? '+' : ''}${steps}`;
  s = withLog(s, `${team.name}: ${lead.node ?? '출발'} → ${dest} (${label})${stacked > 1 ? ` · ${stacked}개 업음` : ''}`);

  const landedQuiz = source === 'throw' && QUIZ_NODES.has(dest) ? dest : null;
  return { state: s, landedQuiz };
}

function pickQuestion(state: GameState): { questionId: string; used: string[] } | null {
  if (state.questions.length === 0) return null;
  let used = state.usedQuestionIds;
  let candidates = state.questions.filter((q) => !used.includes(q.id));
  if (candidates.length === 0) {
    used = [];
    candidates = state.questions;
  }
  const q = candidates[Math.floor(Math.random() * candidates.length)];
  return { questionId: q.id, used: [...used, q.id] };
}

function openQuiz(state: GameState, pieceId: string, node: NodeId): GameState {
  const picked = pickQuestion(state);
  const piece = findPiece(state, pieceId);
  if (!picked) return withLog(state, '퀴즈 칸이지만 등록된 문제가 없어 건너뜁니다.');
  const s: GameState = {
    ...state,
    phase: 'quiz',
    usedQuestionIds: picked.used,
    quiz: { pieceId, teamId: piece.teamId, questionId: picked.questionId, node },
    events: [...state.events, { type: 'quiz', pieceId, node }],
  };
  return withLog(s, `❓ ${teamName(s, piece.teamId)}: 퀴즈 칸 ${node}! 문제 출제`);
}

export function applyMove(state: GameState, pendingIndex: number, option: MoveOption): GameState {
  if (state.phase !== 'move' && state.phase !== 'throw') return state;
  const result = state.pending[pendingIndex];
  if (!result) return state;
  const steps = YUT_INFO[result].steps;
  const pending = state.pending.filter((_, i) => i !== pendingIndex);
  let s: GameState = { ...state, pending, events: [], seq: state.seq + 1 };
  const out = performMove(s, option.pieceIds, steps, 'throw');
  s = out.state;
  if (out.landedQuiz) return openQuiz(s, option.pieceIds[0], out.landedQuiz);
  return advance(s);
}

export function answerQuiz(state: GameState, choiceIndex: number): GameState {
  if (state.phase !== 'quiz' || !state.quiz) return state;
  const q = state.questions.find((x) => x.id === state.quiz!.questionId);
  if (!q) return skipQuiz(state);
  const correct = q.answer === choiceIndex;
  let s: GameState = {
    ...state,
    events: [{ type: 'quizResult', correct, teamId: state.quiz.teamId }],
    seq: state.seq + 1,
  };
  s = withLog(s, `${teamName(s, state.quiz.teamId)}: ${correct ? '정답! +2' : '오답… -2'}`);
  const steps = correct ? QUIZ_BONUS_STEPS : QUIZ_PENALTY_STEPS;
  let piece: Piece | null = state.quiz.pieceId ? findPiece(s, state.quiz.pieceId) : null;
  if (!piece) {
    const onBoard = teamPieces(s, state.quiz.teamId).filter((p) => p.node !== null && !p.done);
    const nodes = new Set(onBoard.map((p) => p.node));
    if (nodes.size === 1) piece = onBoard[0];
    else s = withLog(s, nodes.size === 0 ? '판 위에 말이 없어 이동은 생략합니다.' : '판 위 말이 여러 개라 이동은 생략합니다. 필요하면 말 이동으로 조정하세요.');
  }
  if (piece && !piece.done && piece.node !== null) {
    const stack = s.pieces.filter((p) => p.node === piece!.node && p.teamId === piece!.teamId).map((p) => p.id);
    s = performMove(s, stack, steps, 'quiz').state;
  }
  s = { ...s, quiz: null };
  return advance(s);
}

export function skipQuiz(state: GameState): GameState {
  if (state.phase !== 'quiz') return state;
  const s = withLog({ ...state, quiz: null, events: [], seq: state.seq + 1 }, '퀴즈 건너뜀 (이동 없음)');
  return advance(s);
}

// ───────────────────────── 관리자 기능 ─────────────────────────

export type AdminDest = NodeId | 'HOME' | 'DONE';

export function adminMovePiece(state: GameState, pieceId: string, dest: AdminDest): GameState {
  const piece = findPiece(state, pieceId);
  const s0: GameState = { ...state, events: [], seq: state.seq + 1 };
  let pieces: Piece[];
  if (dest === 'HOME') {
    pieces = s0.pieces.map((p) => (p.id === pieceId ? { ...p, node: null, done: false, trail: [] } : p));
  } else if (dest === 'DONE') {
    pieces = s0.pieces.map((p) => (p.id === pieceId ? { ...p, node: null, done: true, trail: [] } : p));
  } else {
    pieces = s0.pieces.map((p) => (p.id === pieceId ? { ...p, node: dest, done: false, trail: [dest] } : p));
  }
  let s: GameState = {
    ...s0,
    pieces,
    finishOrder: s0.finishOrder.filter((tid) => tid !== piece.teamId),
    events: [{ type: 'admin', message: `${pieceId} → ${dest}` }],
  };
  if (isTeamFinished(s, piece.teamId)) s = { ...s, finishOrder: [...s.finishOrder, piece.teamId] };
  // 기존 완주 팀 순서 유지
  const keep = state.finishOrder.filter((tid) => isTeamFinished(s, tid));
  const added = s.finishOrder.filter((tid) => !keep.includes(tid));
  s = { ...s, finishOrder: [...keep, ...added] };
  return withLog(s, `🛠 관리자: ${teamName(s, piece.teamId)} 말(${pieceId.split('-')[1]}) → ${dest === 'HOME' ? '대기' : dest === 'DONE' ? '완주' : dest}`);
}

export function adminSetTurn(state: GameState, teamIndex: number): GameState {
  if (teamIndex < 0 || teamIndex >= state.teams.length) return state;
  const s: GameState = {
    ...state,
    turnIndex: teamIndex,
    phase: 'throw',
    pending: [],
    extraThrow: false,
    quiz: null,
    events: [{ type: 'turn', teamId: state.teams[teamIndex].id, extra: false }],
    seq: state.seq + 1,
  };
  return withLog(s, `🛠 관리자: ${teamName(s, s.teams[teamIndex].id)} 차례로 변경`);
}

export function adminEndTurn(state: GameState): GameState {
  const s: GameState = { ...state, events: [], seq: state.seq + 1, extraThrow: false, pending: [], quiz: null };
  return passTurn(withLog(s, '🛠 관리자: 차례 넘김'));
}

export function adminGrantExtraThrow(state: GameState): GameState {
  const s: GameState = { ...state, phase: 'throw', extraThrow: true, events: [], seq: state.seq + 1 };
  return withLog(s, `🛠 관리자: ${currentTeam(s).name} 한 번 더 던지기`);
}

export function adminClearPending(state: GameState): GameState {
  const s: GameState = { ...state, pending: [], phase: 'throw', quiz: null, events: [], seq: state.seq + 1 };
  return withLog(s, '🛠 관리자: 대기 중인 결과 삭제');
}

/** 수동 출제: 문제를 지정하거나(없으면 무작위) 현재 팀에게 바로 보여준다 */
export function adminOpenQuiz(state: GameState, questionId?: string): GameState {
  if (state.questions.length === 0) return state;
  const team = currentTeam(state);
  let s: GameState = { ...state, events: [], seq: state.seq + 1 };
  let qid = questionId;
  let used = s.usedQuestionIds;
  if (qid) {
    if (!s.questions.some((q) => q.id === qid)) return state;
    if (!used.includes(qid)) used = [...used, qid];
  } else {
    const picked = pickQuestion(s);
    if (!picked) return state;
    qid = picked.questionId;
    used = picked.used;
  }
  s = {
    ...s,
    phase: 'quiz',
    usedQuestionIds: used,
    quiz: { pieceId: null, teamId: team.id, questionId: qid, node: null },
    events: [{ type: 'quiz', pieceId: null, node: null }],
  };
  return withLog(s, `🛠 관리자: ${team.name}에게 수동 퀴즈 출제`);
}

export function adminUpdateTeam(state: GameState, teamId: string, patch: Partial<Pick<Team, 'name' | 'color'>>): GameState {
  return {
    ...state,
    teams: state.teams.map((t) => (t.id === teamId ? { ...t, ...patch } : t)),
    events: [],
    seq: state.seq + 1,
  };
}

export function setQuestions(state: GameState, questions: Question[]): GameState {
  const s: GameState = { ...state, questions, usedQuestionIds: [], events: [], seq: state.seq + 1 };
  return withLog(s, `문제 ${questions.length}개 불러옴`);
}

export function adminFinishGame(state: GameState): GameState {
  return withLog({ ...state, phase: 'finished', events: [], seq: state.seq + 1 }, '🏁 게임 종료');
}

export function adminResume(state: GameState): GameState {
  return withLog({ ...state, phase: 'throw', events: [], seq: state.seq + 1 }, '게임 재개');
}
