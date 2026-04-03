// Audio manager using Howler.js
// Starts muted, enables on user interaction

let Howl: any = null;

interface SoundLayer {
  sound: any;
  baseVolume: number;
  targetVolume: number;
  currentVolume: number;
}

export class AudioManager {
  private layers: Map<string, SoundLayer> = new Map();
  private enabled = false;
  private loaded = false;
  private currentPreset = 'goldenHour';

  // Preset-to-audio mapping: which layers play at what volume
  private presetMix: Record<string, Record<string, number>> = {
    goldenHour: { birds: 0.3, wind: 0.15, ambient: 0.2 },
    daylight: { birds: 0.4, wind: 0.2, ambient: 0.15 },
    moonlight: { crickets: 0.35, wind: 0.1, ambient: 0.15 },
    warmLamp: { rain: 0.3, ambient: 0.25 },
    growLight: { ambient: 0.3, hum: 0.1 },
  };

  async init(): Promise<void> {
    try {
      const howler = await import('howler');
      Howl = howler.Howl;
      this.loaded = true;
    } catch {
      console.warn('Howler.js not available, audio disabled');
    }
  }

  private ensureLayers(): void {
    if (!this.loaded || !Howl || this.layers.size > 0) return;

    // Use generated white noise / tone for ambient since we don't have audio files
    // In production, these would be real audio file URLs
    const layerDefs: [string, number][] = [
      ['birds', 0.3],
      ['wind', 0.2],
      ['rain', 0.3],
      ['crickets', 0.35],
      ['ambient', 0.2],
      ['hum', 0.1],
    ];

    // We'll use AudioContext to generate ambient sounds instead of files
    // This is a fallback that works without audio files
    for (const [name, vol] of layerDefs) {
      this.layers.set(name, {
        sound: null, // Will use Web Audio API
        baseVolume: vol,
        targetVolume: 0,
        currentVolume: 0,
      });
    }

    this.setupWebAudio();
  }

  private audioContext: AudioContext | null = null;
  private gainNodes: Map<string, GainNode> = new Map();

  private setupWebAudio(): void {
    try {
      this.audioContext = new AudioContext();

      // Create noise generators for different ambient layers
      const createNoise = (type: 'brown' | 'pink' | 'white', freq?: number): [AudioNode, GainNode] => {
        const ctx = this.audioContext!;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(ctx.destination);

        if (type === 'brown' || type === 'pink') {
          // Brown noise via filtered white noise
          const bufferSize = ctx.sampleRate * 2;
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          let lastOut = 0;
          for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5; // boost
          }
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = true;

          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = type === 'brown' ? 200 : 800;

          source.connect(filter);
          filter.connect(gain);
          source.start();
          return [source, gain];
        } else {
          // Gentle tone
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq || 220;

          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 400;

          osc.connect(filter);
          filter.connect(gain);
          osc.start();
          return [osc, gain];
        }
      };

      // Map layers to audio generators
      const [, windGain] = createNoise('brown');
      this.gainNodes.set('wind', windGain);

      const [, rainGain] = createNoise('pink');
      this.gainNodes.set('rain', rainGain);

      const [, ambientGain] = createNoise('brown');
      this.gainNodes.set('ambient', ambientGain);

      const [, cricketGain] = createNoise('white', 4000);
      this.gainNodes.set('crickets', cricketGain);

      const [, birdGain] = createNoise('white', 2000);
      this.gainNodes.set('birds', birdGain);

      const [, humGain] = createNoise('white', 60);
      this.gainNodes.set('hum', humGain);
    } catch (e) {
      console.warn('Web Audio not available:', e);
    }
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    this.ensureLayers();

    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }

    if (!this.enabled) {
      // Mute all
      this.gainNodes.forEach(gain => {
        gain.gain.setTargetAtTime(0, this.audioContext!.currentTime, 0.3);
      });
    } else {
      this.applyPreset(this.currentPreset);
    }

    return this.enabled;
  }

  setPreset(name: string): void {
    this.currentPreset = name;
    if (this.enabled) {
      this.applyPreset(name);
    }
  }

  private applyPreset(name: string): void {
    if (!this.audioContext) return;
    const mix = this.presetMix[name] || this.presetMix.goldenHour;
    const now = this.audioContext.currentTime;

    this.gainNodes.forEach((gain, layerName) => {
      const targetVol = (mix[layerName] || 0) * 0.15; // Keep it subtle
      gain.gain.setTargetAtTime(targetVol, now, 0.5);
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
