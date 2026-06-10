// Ambient sound, synthesized entirely with the Web Audio API — no audio
// assets. Birdsong by day, crickets at night, a plip when the watering can
// drips, and granular hiss while pouring. Starts muted (browser autoplay
// rules) and is enabled from the sound chip; that click is the user gesture
// that unlocks the AudioContext.

import { PresetName } from './Scene';

type PourKind = 'sand' | 'soil' | 'gravel' | 'water';

const POUR_FREQ: Record<PourKind, number> = {
  sand: 900, soil: 700, gravel: 430, water: 1500,
};

export class SoundScape {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noiseBuf?: AudioBuffer;
  private enabled = false;

  private pour?: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; lfo?: OscillatorNode; kind: PourKind };
  private pourLast = 0;
  private cricketT = 1;
  private birdT = 2;

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) {
      this.ensure();
      this.ctx!.resume();
      this.master!.gain.setTargetAtTime(0.4, this.now(), 0.15);
    } else if (this.master) {
      this.master.gain.setTargetAtTime(0, this.now(), 0.08);
      this.stopPour();
    }
  }

  private ensure(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // 2 seconds of white noise, looped for pour sounds.
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  // A water drop landing: short sine pitch-drop.
  plip(): void {
    if (!this.enabled || !this.ctx) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(820 + Math.random() * 160, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.09);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  // One cricket chirp: a few amplitude pulses of a high sine.
  private cricket(): void {
    const ctx = this.ctx!;
    const t0 = this.now();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 4100 + Math.random() * 500;
    const g = ctx.createGain();
    g.gain.value = 0;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    osc.connect(g).connect(pan).connect(this.master!);
    const pulses = 3 + ((Math.random() * 3) | 0);
    for (let p = 0; p < pulses; p++) {
      const tp = t0 + p * 0.062;
      g.gain.setValueAtTime(0, tp);
      g.gain.linearRampToValueAtTime(0.045, tp + 0.012);
      g.gain.linearRampToValueAtTime(0, tp + 0.048);
    }
    osc.start(t0);
    osc.stop(t0 + pulses * 0.062 + 0.05);
  }

  // A short birdsong phrase: 2-5 swept whistles.
  private bird(): void {
    const ctx = this.ctx!;
    const t0 = this.now();
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    pan.connect(this.master!);
    const syllables = 2 + ((Math.random() * 4) | 0);
    let t = t0;
    for (let s = 0; s < syllables; s++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const f0 = 2300 + Math.random() * 900;
      const f1 = f0 + (Math.random() - 0.4) * 1100;
      const dur = 0.07 + Math.random() * 0.09;
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(800, f1), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.03);
      osc.connect(g).connect(pan);
      osc.start(t);
      osc.stop(t + dur + 0.05);
      t += dur + 0.04 + Math.random() * 0.08;
    }
  }

  // Called every frame while the user is pouring; keeps a filtered noise
  // loop alive, auto-stops shortly after the pour ends.
  pourTick(kind: PourKind): void {
    if (!this.enabled || !this.ctx) return;
    this.pourLast = performance.now();
    if (this.pour && this.pour.kind === kind) return;
    this.stopPour();

    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf!;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = POUR_FREQ[kind];
    filter.Q.value = kind === 'water' ? 1.6 : 0.9;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(kind === 'gravel' ? 0.16 : 0.12, this.now(), 0.05);
    src.connect(filter).connect(gain).connect(this.master!);
    let lfo: OscillatorNode | undefined;
    if (kind === 'water') {
      // Burbling: wobble the filter center.
      lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 420;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start();
    }
    src.start();
    this.pour = { src, gain, filter, lfo, kind };
  }

  private stopPour(): void {
    if (!this.pour) return;
    const { src, gain, lfo } = this.pour;
    gain.gain.setTargetAtTime(0, this.now(), 0.06);
    setTimeout(() => {
      try { src.stop(); lfo?.stop(); } catch { /* already stopped */ }
    }, 250);
    this.pour = undefined;
  }

  update(dt: number, preset: PresetName): void {
    if (!this.enabled || !this.ctx) return;

    if (this.pour && performance.now() - this.pourLast > 160) this.stopPour();

    if (preset === 'night') {
      this.cricketT -= dt;
      if (this.cricketT <= 0) {
        this.cricket();
        this.cricketT = 0.5 + Math.random() * 1.8;
      }
    } else {
      this.birdT -= dt;
      if (this.birdT <= 0) {
        this.bird();
        this.birdT = 4 + Math.random() * 10;
      }
    }
  }
}
