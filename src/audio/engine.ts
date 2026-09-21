import type { YutResult } from '../game/yut';

export type MusicSource = 'builtin' | 'file';

/**
 * 오디오 엔진
 *  - 내장 국악풍 루프 (Web Audio 신스: 가야금 뜯기 + 장구 굿거리 장단 + 저음 드론)
 *  - mp3 등 오디오 파일 재생 (<audio>)
 *  - 효과음 (윷 결과, 말 이동, 잡기, 퀴즈 정답/오답, 완주)
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;

  private source: MusicSource = 'builtin';
  private playing = false;
  private schedulerTimer: number | null = null;
  private nextNoteTime = 0;
  private stepIndex = 0;
  private melody: number[] = [];

  private fileAudio: HTMLAudioElement | null = null;
  private fileNode: MediaElementAudioSourceNode | null = null;
  private fileUrl: string | null = null;
  fileName: string | null = null;

  musicVolume = 0.5;
  sfxVolume = 0.7;
  sfxEnabled = true;

  onChange: (() => void) | null = null;

  get isPlaying(): boolean {
    return this.playing;
  }

  get musicSource(): MusicSource {
    return this.source;
  }

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);
    this.melody = buildMelody();
    return ctx;
  }

  async resume(): Promise<void> {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') await ctx.resume();
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    if (this.fileAudio) this.fileAudio.volume = 1;
    this.onChange?.();
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = v;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    this.onChange?.();
  }

  async setSource(src: MusicSource): Promise<void> {
    if (src === this.source) return;
    const wasPlaying = this.playing;
    this.stop();
    this.source = src;
    if (wasPlaying) await this.play();
    this.onChange?.();
  }

  async loadFile(file: File): Promise<void> {
    const ctx = this.ensure();
    this.stop();
    if (this.fileUrl) URL.revokeObjectURL(this.fileUrl);
    this.fileUrl = URL.createObjectURL(file);
    this.fileName = file.name;
    if (!this.fileAudio) {
      this.fileAudio = new Audio();
      this.fileAudio.loop = true;
      this.fileAudio.crossOrigin = 'anonymous';
      this.fileNode = ctx.createMediaElementSource(this.fileAudio);
      this.fileNode.connect(this.musicBus);
    }
    this.fileAudio.src = this.fileUrl;
    this.source = 'file';
    await this.play();
    this.onChange?.();
  }

  async toggle(): Promise<void> {
    if (this.playing) this.stop();
    else await this.play();
  }

  async play(): Promise<void> {
    const ctx = this.ensure();
    await this.resume();
    if (this.source === 'file') {
      if (!this.fileAudio || !this.fileUrl) {
        this.source = 'builtin';
      } else {
        try {
          await this.fileAudio.play();
          this.playing = true;
          this.onChange?.();
          return;
        } catch {
          this.source = 'builtin';
        }
      }
    }
    this.playing = true;
    this.stepIndex = 0;
    this.nextNoteTime = ctx.currentTime + 0.1;
    this.startDrone();
    this.schedulerTimer = window.setInterval(() => this.schedule(), 50);
    this.onChange?.();
  }

  stop(): void {
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.stopDrone();
    if (this.fileAudio) this.fileAudio.pause();
    this.playing = false;
    this.onChange?.();
  }

  // ───────────── 내장 음악 ─────────────

  private drone: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;

  private startDrone(): void {
    const ctx = this.ensure();
    if (this.drone) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.045, ctx.currentTime, 1.5);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = ROOT / 4;
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = ROOT / 2;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    osc.connect(lp);
    osc2.connect(lp);
    lp.connect(gain);
    gain.connect(this.musicBus);
    osc.start();
    osc2.start();
    this.drone = { osc, osc2, gain };
  }

  private stopDrone(): void {
    if (!this.drone || !this.ctx) return;
    const { osc, osc2, gain } = this.drone;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    osc.stop(this.ctx.currentTime + 1);
    osc2.stop(this.ctx.currentTime + 1);
    this.drone = null;
  }

  private schedule(): void {
    const ctx = this.ctx!;
    while (this.nextNoteTime < ctx.currentTime + 0.25) {
      this.playStep(this.stepIndex, this.nextNoteTime);
      this.nextNoteTime += STEP_SEC;
      this.stepIndex = (this.stepIndex + 1) % (this.melody.length);
    }
  }

  private playStep(step: number, t: number): void {
    const inBar = step % 12;
    const drum = JANGGU_PATTERN[inBar];
    if (drum & 1) this.gung(t, 0.9);
    if (drum & 2) this.chae(t, inBar === 0 ? 0.6 : 0.4);
    if (drum & 4) this.chae(t, 0.22, true);

    const note = this.melody[step];
    if (note > 0) {
      const accent = inBar === 0 || inBar === 6 ? 0.55 : 0.38;
      this.gayageum(note, t, accent);
      // 옥타브 아래 반주 (첫 박)
      if (inBar === 0 && step % 24 === 0) this.gayageum(note / 2, t + 0.02, 0.25, 1.8);
    }
  }

  /** 가야금 뜯는 소리: 배음 + 빠른 감쇠 + 미세한 농현(피치 흔들림) */
  private gayageum(freq: number, t: number, gain: number, dur = 1.1): void {
    const ctx = this.ctx!;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);

    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.setValueAtTime(freq * 6, t);
    bp.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);

    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.setValueAtTime(freq * 1.004, t);
    o1.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    o1.frequency.setValueAtTime(freq, t + 0.4);
    o1.frequency.linearRampToValueAtTime(freq * 0.995, t + 0.7);
    o1.frequency.linearRampToValueAtTime(freq, t + dur);

    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.01;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;

    const o3 = ctx.createOscillator();
    o3.type = 'sine';
    o3.frequency.value = freq * 3;
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.18, t);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    o1.connect(bp);
    o2.connect(g2).connect(bp);
    o3.connect(g3).connect(bp);
    bp.connect(env).connect(this.musicBus);
    o1.start(t); o2.start(t); o3.start(t);
    o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); o3.stop(t + dur + 0.05);
  }

  /** 장구 궁편 (낮은 북소리) */
  private gung(t: number, gain: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.4);
  }

  /** 장구 채편 (높은 채 소리) */
  private chae(t: number, gain: number, soft = false): void {
    const ctx = this.ctx!;
    const buf = noiseBuffer(ctx, 0.12);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = soft ? 2600 : 3800;
    hp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * 0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (soft ? 0.06 : 0.1));
    src.connect(hp).connect(g).connect(this.musicBus);
    src.start(t);
    src.stop(t + 0.15);
  }

  // ───────────── 효과음 ─────────────

  private tone(freq: number, t: number, dur: number, gain: number, type: OscillatorType = 'triangle'): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private async sfxCtx(): Promise<AudioContext | null> {
    if (!this.sfxEnabled) return null;
    const ctx = this.ensure();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return null;
      }
    }
    return ctx;
  }

  async sfxThrow(result: YutResult): Promise<void> {
    const ctx = await this.sfxCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (result === 'nak') {
      this.tone(220, t, 0.25, 0.3, 'sawtooth');
      this.tone(160, t + 0.18, 0.4, 0.3, 'sawtooth');
      return;
    }
    if (result === 'backdo') {
      this.tone(SCALE[2], t, 0.25, 0.35);
      this.tone(SCALE[0], t + 0.16, 0.4, 0.35);
      return;
    }
    const steps = { do: 1, gae: 2, geol: 3, yut: 4, mo: 5 }[result];
    for (let i = 0; i < steps; i++) this.tone(SCALE[i % SCALE.length] * (i >= 5 ? 2 : 1), t + i * 0.09, 0.3, 0.35);
    if (result === 'yut' || result === 'mo') {
      this.tone(SCALE[0] * 2, t + steps * 0.09 + 0.05, 0.6, 0.4, 'sine');
      this.tone(SCALE[2] * 2, t + steps * 0.09 + 0.05, 0.6, 0.3, 'sine');
    }
  }

  async sfxHop(): Promise<void> {
    const ctx = await this.sfxCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(880 + Math.random() * 120, t, 0.09, 0.18, 'sine');
    this.chaeSfx(t, 0.25);
  }

  private chaeSfx(t: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(bp).connect(g).connect(this.sfxBus);
    src.start(t);
  }

  async sfxCatch(): Promise<void> {
    const ctx = await this.sfxCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.6);
    this.gungSfx(t + 0.05);
    this.gungSfx(t + 0.3);
  }

  private gungSfx(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.45);
  }

  async sfxQuizOpen(): Promise<void> {
    const ctx = await this.sfxCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 2, 4].forEach((i, k) => this.tone(SCALE[i] * 2, t + k * 0.12, 0.8, 0.3, 'sine'));
    this.tone(SCALE[0] * 4, t + 0.4, 1.2, 0.2, 'sine');
  }

  async sfxCorrect(): Promise<void> {
    const ctx = await this.sfxCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 2, 3, 4].forEach((i, k) => this.tone(SCALE[i] * 2, t + k * 0.1, 0.5, 0.35));
    this.tone(SCALE[0] * 4, t + 0.42, 0.9, 0.35, 'sine');
    this.tone(SCALE[2] * 4, t + 0.42, 0.9, 0.25, 'sine');
  }

  async sfxWrong(): Promise<void> {
    const ctx = await this.sfxCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(196, t, 0.35, 0.3, 'square');
    this.tone(185, t + 0.25, 0.6, 0.3, 'square');
  }

  async sfxFinish(): Promise<void> {
    const ctx = await this.sfxCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const seq = [0, 1, 2, 3, 4, 5, 6, 7];
    seq.forEach((i) => this.tone(SCALE[i % 5] * (i >= 5 ? 2 : 1), t + i * 0.09, 0.45, 0.3));
    this.tone(SCALE[0] * 4, t + 0.8, 1.6, 0.4, 'sine');
    this.tone(SCALE[2] * 4, t + 0.8, 1.6, 0.3, 'sine');
    this.tone(SCALE[4] * 2, t + 0.8, 1.6, 0.3, 'sine');
    this.gungSfx(t + 0.8);
  }

  async sfxTurn(): Promise<void> {
    const ctx = await this.sfxCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(SCALE[4], t, 0.3, 0.2, 'sine');
    this.tone(SCALE[4] * 2, t + 0.1, 0.4, 0.2, 'sine');
  }
}

// 황종(Eb) 기준 5음 음계: 황 태 중 임 남 ≈ Eb F Ab Bb C
const ROOT = 311.13;
const SCALE = [311.13, 349.23, 415.3, 466.16, 523.25];
const BPM = 82;
const STEP_SEC = 60 / BPM / 3; // 굿거리 12/8: 한 박을 3등분

// 굿거리 장단 (12 스텝): bit1 = 궁, bit2 = 채(강), bit4 = 채(약)
// 덩 - 기덕 | 쿵 - 더러러러 | 쿵 - 기덕 | 쿵 - 더러러러 (간략화)
const JANGGU_PATTERN = [3, 0, 4, 1, 0, 2, 1, 0, 4, 1, 4, 2];

let noiseCache: AudioBuffer | null = null;
function noiseBuffer(ctx: AudioContext, sec: number): AudioBuffer {
  if (noiseCache && noiseCache.duration >= sec) return noiseCache;
  const len = Math.ceil(ctx.sampleRate * Math.max(sec, 0.12));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseCache = buf;
  return buf;
}

/** 시드 기반 5음 선율 (8마디 × 12스텝). 0 = 쉼표 */
function buildMelody(): number[] {
  let seed = 20260921;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const bars = 8;
  const out: number[] = [];
  let deg = 0; // 스케일 인덱스 (0..9, 두 옥타브)
  const pitch = (d: number) => SCALE[d % 5] * (d >= 5 ? 2 : 1);
  for (let b = 0; b < bars; b++) {
    for (let s = 0; s < 12; s++) {
      const strong = s % 3 === 0;
      const play = strong ? rnd() < 0.92 : rnd() < 0.42;
      if (!play) {
        out.push(0);
        continue;
      }
      const r = rnd();
      const move = r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.82 ? 2 : r < 0.94 ? -2 : 0;
      deg = Math.max(0, Math.min(8, deg + move));
      if (s === 0 && b % 4 === 3) deg = 0; // 프레이즈 끝은 황종으로
      out.push(pitch(deg));
    }
  }
  return out;
}
