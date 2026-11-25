// BG 룰렛 BGM: 외부 음원 없이 Web Audio 로 직접 합성하는 오리지널 트랙.
// 레이스 중에는 145BPM 루프가 마디가 지날수록 악기가 더해지며 고조되고,
// 우승자가 나오면 팡파레로 끝난다.

const BPM = 145;
const STEP = 60 / BPM / 4; // 16분음표 길이(초)
const LOOKAHEAD = 0.12;
const MUTE_KEY = 'bg_bgm_muted';

// Am - F - C - G (마디당 1코드, 4마디 반복)
const BASS_ROOTS = [45, 41, 48, 43];
const ARP = [
  [69, 72, 76, 81],
  [65, 69, 72, 77],
  [67, 72, 76, 79],
  [67, 71, 74, 79],
];
// 8마디 이후 들어오는 리드 멜로디 (마디별 16스텝, 0 = 쉼)
const LEAD = [
  [81, 0, 0, 79, 0, 0, 76, 0, 0, 0, 79, 0, 81, 0, 84, 0],
  [81, 0, 0, 77, 0, 0, 72, 0, 0, 0, 77, 0, 81, 0, 0, 0],
  [79, 0, 0, 76, 0, 0, 72, 0, 0, 0, 76, 0, 79, 0, 84, 0],
  [83, 0, 0, 79, 0, 0, 74, 0, 79, 0, 83, 0, 86, 0, 83, 0],
];

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class Bgm {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private _muted = false;

  constructor() {
    try {
      this._muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch (_) {}
  }

  get muted() {
    return this._muted;
  }

  get playing() {
    return this.timer !== null;
  }

  setMuted(value: boolean) {
    this._muted = value;
    try {
      localStorage.setItem(MUTE_KEY, value ? '1' : '0');
    } catch (_) {}
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(value ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  private ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctx();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 0.5;
      this.master.connect(comp).connect(this.ctx.destination);

      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** 시작 버튼에서 호출한다 (브라우저 정책상 사용자 클릭 안에서 불러야 소리가 난다) */
  start() {
    const ctx = this.ensureContext();
    this.stop();
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.tick(), 25);
    this.tick();
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 우승자 결정: 루프를 멈추고 팡파레 */
  win() {
    if (!this.ctx || !this.playing) return;
    this.stop();
    const t = Math.max(this.nextTime, this.ctx.currentTime + 0.02);
    this.crash(t, 2.2);
    this.kick(t);
    const run = [72, 76, 79];
    run.forEach((n, i) => {
      this.tone(t + i * 0.11, freq(n), 0.1, 'square', 0.12, 4000);
      this.tone(t + i * 0.11, freq(n - 12), 0.1, 'sawtooth', 0.1, 2000);
    });
    const hold = t + run.length * 0.11;
    for (const n of [72, 76, 79, 84]) {
      this.tone(hold, freq(n), 1.6, 'sawtooth', 0.08, 3500, 0.01);
      this.tone(hold, freq(n), 1.6, 'square', 0.05, 2500, 0.01);
    }
    this.tone(hold, freq(48), 1.6, 'sawtooth', 0.2, 600, 0.01);
    this.kick(hold);
  }

  private tick() {
    if (!this.ctx) return;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.schedule(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step++;
    }
  }

  private schedule(step: number, t: number) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const chord = bar % 4;

    // 드럼: 4 on the floor + 오프비트 하이햇
    if (s % 4 === 0) this.kick(t);
    if (s % 4 === 2) this.hat(t, 0.09, 0.22);
    else if (bar >= 1) this.hat(t, 0.03, 0.07);
    if (bar >= 1 && (s === 4 || s === 12)) this.snare(t);
    // 4마디마다 마지막에 스네어 필인
    if (bar >= 1 && bar % 4 === 3 && s >= 12) this.snare(t, 0.25 + (s - 12) * 0.08);

    // 베이스: 킥 사이 16분 갤럽 (루트/옥타브 교차)
    if (s % 4 !== 0) {
      const root = BASS_ROOTS[chord] + (s % 2 === 0 ? 12 : 0);
      this.tone(t, freq(root), STEP * 0.9, 'sawtooth', 0.22, 700);
    }

    // 아르페지오: 2마디째부터
    if (bar >= 1) {
      const notes = ARP[chord];
      this.tone(t, freq(notes[s % 4]), STEP * 0.8, 'square', 0.045, 3200);
    }

    // 리드: 5마디째부터
    if (bar >= 4) {
      const n = LEAD[chord][s];
      if (n) this.tone(t, freq(n), STEP * 2.6, 'sawtooth', 0.07, 4500, 0.01);
    }
    // 9마디째부터 리드를 옥타브 위로 겹쳐 더 고조
    if (bar >= 8) {
      const n = LEAD[chord][s];
      if (n) this.tone(t, freq(n + 12), STEP * 2, 'square', 0.03, 5000, 0.01);
    }
    // 4마디 시작마다 심벌
    if (bar >= 4 && bar % 4 === 0 && s === 0) this.crash(t, 1.2);
  }

  private tone(
    t: number,
    f: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    cutoff: number,
    attack = 0.004,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private noiseHit(t: number, dur: number, vol: number, type: BiquadFilterType, cutoff: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private hat(t: number, dur: number, vol: number) {
    this.noiseHit(t, dur, vol, 'highpass', 7000);
  }

  private snare(t: number, vol = 0.45) {
    this.noiseHit(t, 0.16, vol, 'highpass', 1500);
    this.tone(t, 190, 0.08, 'triangle', vol * 0.6, 2000, 0.002);
  }

  private crash(t: number, dur: number) {
    this.noiseHit(t, dur, 0.25, 'highpass', 5000);
  }
}

export const bgm = new Bgm();
