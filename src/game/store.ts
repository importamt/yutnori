import type { GameEvent, GameState } from './engine';

const SAVE_KEY = 'yutnori.save.v1';
const MAX_HISTORY = 100;

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
    } catch {
      /* storage unavailable or quota exceeded */
    }
  }

  toSaveFile(): SaveFile {
    return {
      version: 1,
      savedAt: Date.now(),
      state: strip(this.state!),
      history: this.history.slice(-30),
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
