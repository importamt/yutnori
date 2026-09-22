import type { GameEvent, GameState } from './engine';

const SAVE_KEY = 'yutnori.save.v1';
const CHECKPOINT_KEY = 'yutnori.checkpoints.v1';
const MAX_HISTORY = 100;
const MAX_CHECKPOINTS = 80;

/** 액션마다 남기는 복구 지점 */
export interface Checkpoint {
  t: number;
  seq: number;
  label: string;
  state: GameState;
}

export type Listener = (state: GameState, events: GameEvent[]) => void;

interface SaveFile {
  version: 1;
  savedAt: number;
  state: GameState;
  history: GameState[];
}

/** 예전 저장 파일(extraThrow 불리언) → throwsLeft 숫자로 변환 */
function migrate(state: GameState): GameState {
  const legacy = state as GameState & { extraThrow?: boolean };
  if (typeof legacy.throwsLeft === 'number') return state;
  const throwsLeft = legacy.extraThrow ? 1 : legacy.phase === 'throw' ? 1 : 0;
  const { extraThrow: _drop, ...rest } = legacy;
  return { ...rest, throwsLeft };
}

function strip(state: GameState): GameState {
  return { ...state, events: [] };
}

/** 상태 + 되돌리기 이력 + 자동 저장 */
export class GameStore {
  private state: GameState | null = null;
  private history: GameState[] = [];
  private listeners = new Set<Listener>();
  /** 마지막 자동 저장 시각 (ms). null = 저장 실패/미저장 */
  lastSavedAt: number | null = null;

  get current(): GameState | null {
    return this.state;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start(state: GameState): void {
    this.history = [];
    this.state = state;
    this.persist();
    this.emit(state.events);
  }

  /** 상태 변환 함수를 적용. 상태가 바뀌지 않으면 아무 것도 하지 않는다 */
  dispatch(fn: (s: GameState) => GameState): void {
    if (!this.state) return;
    const next = fn(this.state);
    if (next === this.state) return;
    this.history.push(strip(this.state));
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.state = next;
    this.persist();
    this.emit(next.events);
  }

  undo(): boolean {
    const prev = this.history.pop();
    if (!prev || !this.state) return false;
    this.state = { ...prev, events: [{ type: 'admin', message: 'undo' }], seq: this.state.seq + 1 };
    this.persist();
    this.emit(this.state.events);
    return true;
  }

  clear(): void {
    this.state = null;
    this.history = [];
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(CHECKPOINT_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  private emit(events: GameEvent[]): void {
    if (!this.state) return;
    for (const fn of this.listeners) fn(this.state, events);
  }

  private persist(): void {
    if (!this.state) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.toSaveFile()));
      this.lastSavedAt = Date.now();
    } catch {
      this.lastSavedAt = null;
    }
    this.appendCheckpoint();
  }

  /** 모든 액션 뒤 체크포인트를 쌓는다 (최근 MAX_CHECKPOINTS 개). 용량 초과 시 오래된 것부터 버린다 */
  private appendCheckpoint(): void {
    if (!this.state) return;
    const list = GameStore.listCheckpoints();
    const last = this.state.log[this.state.log.length - 1];
    const cp: Checkpoint = { t: Date.now(), seq: this.state.seq, label: last?.text ?? '', state: strip(this.state) };
    // 같은 상태(seq)를 다시 저장하는 경우(새로고침 복원 등)는 덧쓴다
    if (list.length && list[list.length - 1].seq === cp.seq) list[list.length - 1] = cp;
    else list.push(cp);
    while (list.length > MAX_CHECKPOINTS) list.shift();
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(list));
        return;
      } catch {
        list.splice(0, Math.ceil(list.length / 2));
      }
    }
  }

  static listCheckpoints(): Checkpoint[] {
    try {
      const raw = localStorage.getItem(CHECKPOINT_KEY);
      const parsed = raw ? (JSON.parse(raw) as Checkpoint[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** 체크포인트 시점으로 복구. 현재 상태는 되돌리기 이력에 남긴다 */
  restoreCheckpoint(index: number): boolean {
    const list = GameStore.listCheckpoints();
    const cp = list[index];
    if (!cp) return false;
    if (this.state) this.history.push(strip(this.state));
    this.state = { ...migrate(cp.state), events: [], seq: (this.state?.seq ?? cp.seq) + 1 };
    this.state = { ...this.state, log: [...this.state.log, { t: Date.now(), text: `🛠 기록 복구: ${formatTime(cp.t)} 시점` }] };
    this.persist();
    this.emit([]);
    return true;
  }

  toSaveFile(): SaveFile {
    return {
      version: 1,
      savedAt: Date.now(),
      state: strip(this.state!),
      history: this.history.slice(-MAX_HISTORY),
    };
  }

  static loadSaved(): SaveFile | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SaveFile;
      if (parsed.version !== 1 || !parsed.state?.teams) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  restore(file: SaveFile): void {
    this.history = (file.history ?? []).map(migrate);
    this.state = { ...migrate(file.state), events: [] };
    this.persist();
    this.emit([]);
  }

  exportJson(): string {
    return JSON.stringify(this.toSaveFile(), null, 2);
  }

  importJson(text: string): void {
    const parsed = JSON.parse(text) as SaveFile;
    if (parsed.version !== 1 || !parsed.state?.teams || !Array.isArray(parsed.state.pieces)) {
      throw new Error('올바른 저장 파일이 아닙니다.');
    }
    this.restore(parsed);
  }
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
