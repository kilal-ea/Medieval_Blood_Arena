export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  public volume = 0.7;
  public muted = false;

  public unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.volume;
    this.masterGain.connect(this.ctx.destination);

    // Pre-generate 0.5s white noise buffer for whooshes and impacts
    const sampleRate = this.ctx.sampleRate;
    const len = Math.floor(sampleRate * 0.5);
    this.noiseBuffer = this.ctx.createBuffer(1, len, sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  public setSettings(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : volume, this.ctx.currentTime, 0.02);
    }
  }

  public playClang(material: 'steel' | 'shield', intensity = 0.7): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const gainScale = Math.max(0.15, Math.min(1, intensity));

    if (material === 'steel') {
      // Metallic inharmonic bell partials
      const freqs = [1180, 1890, 2740, 3620];
      freqs.forEach((f, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(f * (0.94 + Math.random() * 0.12), now);
        g.gain.setValueAtTime(0.16 * gainScale / (idx + 1), now);
        g.gain.exponentialRampToValueAtTime(0.0005, now + 0.38 - idx * 0.06);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.4);
      });
    } else {
      // Heavy oak + iron shield block
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.exponentialRampToValueAtTime(82, now + 0.16);
      g.gain.setValueAtTime(0.28 * gainScale, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.19);
    }
  }

  public playImpact(surface: 'flesh' | 'armor' | 'wood', intensity = 0.7): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const gScale = Math.max(0.15, Math.min(1, intensity));

    // Low thud
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(surface === 'armor' ? 280 : surface === 'wood' ? 190 : 135, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.15);
    g.gain.setValueAtTime(0.35 * gScale, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);

    if (surface === 'armor') {
      this.playClang('steel', intensity * 0.55);
    }

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = surface === 'armor' ? 1400 : 520;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.18 * gScale, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      src.connect(filter);
      filter.connect(ng);
      ng.connect(this.masterGain);
      src.start(now);
      src.stop(now + 0.12);
    }
  }

  public playWhoosh(speed = 5): void {
    if (this.muted || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.6;
    const baseFreq = Math.min(1200, 260 + speed * 75);
    filter.frequency.setValueAtTime(baseFreq * 0.7, now);
    filter.frequency.exponentialRampToValueAtTime(baseFreq * 1.4, now + 0.12);

    const g = this.ctx.createGain();
    const amp = Math.min(0.18, 0.04 + speed * 0.014);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.23);
  }

  public playHorn(victory = true): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const notes = victory ? [146.83, 220, 293.66] : [146.83, 130.81, 110];
    notes.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.18);
      filter.type = 'lowpass';
      filter.frequency.value = 620;
      g.gain.setValueAtTime(0.001, now + i * 0.18);
      g.gain.linearRampToValueAtTime(0.12, now + i * 0.18 + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.55);
      osc.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.58);
    });
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
    }
  }
}
