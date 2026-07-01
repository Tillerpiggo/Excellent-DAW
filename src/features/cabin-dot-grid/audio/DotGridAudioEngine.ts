export interface DotGridCell {
  id: string;
  row: number;
  col: number;
  rows: number;
  cols: number;
}

type StepListener = (dotId: string | null) => void;

const STEP_DIVISION = 2;
const PREVIEW_LOOKAHEAD_S = 0.02;
const MAX_PAN = 0.82;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function scaleLog(normalized: number, min: number, max: number): number {
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  return Math.exp(logMin + normalized * (logMax - logMin));
}

function createPinkNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;

  for (let index = 0; index < bufferSize; index += 1) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    b6 = white * 0.5362;
    data[index] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.11) * 0.11;
  }

  let peak = 0;
  for (let index = 0; index < bufferSize; index += 1) {
    peak = Math.max(peak, Math.abs(data[index]));
  }

  const normalization = peak > 0 ? 0.8 / peak : 1;
  for (let index = 0; index < bufferSize; index += 1) {
    data[index] *= normalization;
  }

  return buffer;
}

function createAudioContext(): AudioContext {
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  return new AudioContextClass();
}

export class DotGridAudioEngine {
  private ctx: AudioContext | null = null;
  private pinkNoiseBuffer: AudioBuffer | null = null;
  private inputGain: GainNode | null = null;
  private preEqGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private outputGain: GainNode | null = null;
  private activeDots: DotGridCell[] = [];
  private stepListeners = new Set<StepListener>();
  private schedulerId: number | null = null;
  private previewResetId: number | null = null;
  private stepIndex = 0;
  private tempo = 78;
  private isPlaying = false;

  public async resume(): Promise<void> {
    const ctx = this.ensureGraph();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  public getAnalyser(): AnalyserNode | null {
    this.ensureGraph();
    return this.analyser;
  }

  public getPreEqNode(): GainNode | null {
    this.ensureGraph();
    return this.preEqGain;
  }

  public setTempo(nextTempo: number): void {
    this.tempo = clamp(nextTempo, 42, 180);

    if (this.isPlaying && this.activeDots.length > 0) {
      this.restartScheduler();
    }
  }

  public setDots(nextDots: DotGridCell[]): void {
    this.activeDots = [...nextDots].sort((left, right) => {
      if (left.row !== right.row) {
        return left.row - right.row;
      }

      return left.col - right.col;
    });

    if (this.activeDots.length === 0) {
      this.stepIndex = 0;
      this.stopScheduler();
      this.emitStep(null);
      return;
    }

    if (this.stepIndex >= this.activeDots.length) {
      this.stepIndex = 0;
    }

    if (this.isPlaying) {
      this.restartScheduler();
    }
  }

  public setPlaying(nextState: boolean): void {
    this.isPlaying = nextState;

    if (this.isPlaying && this.activeDots.length > 0) {
      this.restartScheduler();
      return;
    }

    this.stopScheduler();
    this.emitStep(null);
  }

  public previewDot(dot: DotGridCell): void {
    const ctx = this.ensureGraph();
    this.playDot(dot, ctx.currentTime + PREVIEW_LOOKAHEAD_S, 0.92);
    this.emitStep(dot.id);

    if (this.previewResetId !== null) {
      window.clearTimeout(this.previewResetId);
    }

    this.previewResetId = window.setTimeout(() => {
      this.previewResetId = null;
      if (!this.isPlaying) {
        this.emitStep(null);
      }
    }, 280);
  }

  public subscribe(listener: StepListener): () => void {
    this.stepListeners.add(listener);

    return () => {
      this.stepListeners.delete(listener);
    };
  }

  public async destroy(): Promise<void> {
    this.stopScheduler();

    if (this.previewResetId !== null) {
      window.clearTimeout(this.previewResetId);
      this.previewResetId = null;
    }

    if (!this.ctx) {
      return;
    }

    this.outputGain?.disconnect();
    this.analyser?.disconnect();
    this.compressor?.disconnect();
    this.preEqGain?.disconnect();
    this.inputGain?.disconnect();

    await this.ctx.close();

    this.ctx = null;
    this.pinkNoiseBuffer = null;
    this.inputGain = null;
    this.preEqGain = null;
    this.compressor = null;
    this.analyser = null;
    this.outputGain = null;
  }

  private ensureGraph(): AudioContext {
    if (this.ctx) {
      return this.ctx;
    }

    this.ctx = createAudioContext();
    this.pinkNoiseBuffer = createPinkNoiseBuffer(this.ctx);

    this.inputGain = this.ctx.createGain();
    this.preEqGain = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.analyser = this.ctx.createAnalyser();
    this.outputGain = this.ctx.createGain();

    this.inputGain.gain.value = 0.92;
    this.preEqGain.gain.value = 1;
    this.outputGain.gain.value = 0.72;

    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 2.5;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.18;

    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;

    this.inputGain.connect(this.preEqGain);
    this.preEqGain.connect(this.compressor);
    this.compressor.connect(this.analyser);
    this.analyser.connect(this.outputGain);
    this.outputGain.connect(this.ctx.destination);

    return this.ctx;
  }

  private restartScheduler(): void {
    this.stopScheduler();
    this.schedulerId = window.setTimeout(() => {
      this.schedulerId = null;
      this.tick();
    }, 40);
  }

  private stopScheduler(): void {
    if (this.schedulerId !== null) {
      window.clearTimeout(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private tick(): void {
    if (!this.isPlaying || this.activeDots.length === 0) {
      return;
    }

    const ctx = this.ensureGraph();
    const dot = this.activeDots[this.stepIndex % this.activeDots.length];
    const stepMs = 60000 / this.tempo / STEP_DIVISION;

    this.playDot(dot, ctx.currentTime + 0.03, 1);
    this.emitStep(dot.id);

    this.stepIndex = (this.stepIndex + 1) % this.activeDots.length;

    this.schedulerId = window.setTimeout(() => {
      this.schedulerId = null;
      this.tick();
    }, stepMs);
  }

  private playDot(dot: DotGridCell, when: number, emphasis: number): void {
    const ctx = this.ensureGraph();

    if (!this.pinkNoiseBuffer || !this.inputGain) {
      return;
    }

    const normalizedX = dot.cols <= 1 ? 0.5 : dot.col / (dot.cols - 1);
    const normalizedY = dot.rows <= 1 ? 0.5 : 1 - dot.row / (dot.rows - 1);
    const centerFrequency = scaleLog(normalizedY, 170, 4200);
    const toneFrequency = scaleLog(normalizedY, 110, 880);
    const duration = 0.2 + (1 - normalizedY) * 0.14;
    const peak = 0.14 + normalizedY * 0.07 + (0.5 - Math.abs(normalizedX - 0.5)) * 0.08;

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = this.pinkNoiseBuffer;

    const noiseBandpass = ctx.createBiquadFilter();
    noiseBandpass.type = 'bandpass';
    noiseBandpass.frequency.setValueAtTime(centerFrequency, when);
    noiseBandpass.Q.setValueAtTime(0.9 + normalizedY * 1.3, when);

    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = Math.min(centerFrequency * 0.8, 480);
    lowShelf.gain.value = (1 - normalizedY) * 4.5;

    const highShelf = ctx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = Math.max(centerFrequency, 900);
    highShelf.gain.value = -3 + normalizedY * 7;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.86;

    const tonalOscillator = ctx.createOscillator();
    tonalOscillator.type = 'triangle';
    tonalOscillator.frequency.setValueAtTime(toneFrequency, when);
    tonalOscillator.detune.setValueAtTime((normalizedX - 0.5) * 18, when);

    const tonalFilter = ctx.createBiquadFilter();
    tonalFilter.type = 'lowpass';
    tonalFilter.frequency.value = Math.min(toneFrequency * 3.4, 4200);
    tonalFilter.Q.value = 0.7;

    const tonalGain = ctx.createGain();
    tonalGain.gain.value = 0.07 + normalizedY * 0.04;

    const voiceMix = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const envelope = ctx.createGain();

    panner.pan.setValueAtTime((normalizedX * 2 - 1) * MAX_PAN, when);

    envelope.gain.cancelScheduledValues(when);
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.linearRampToValueAtTime(peak * emphasis, when + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    noiseSource.connect(noiseBandpass);
    noiseBandpass.connect(lowShelf);
    lowShelf.connect(highShelf);
    highShelf.connect(noiseGain);
    noiseGain.connect(voiceMix);

    tonalOscillator.connect(tonalFilter);
    tonalFilter.connect(tonalGain);
    tonalGain.connect(voiceMix);

    voiceMix.connect(panner);
    panner.connect(envelope);
    envelope.connect(this.inputGain);

    noiseSource.start(when, Math.random() * 0.3, duration + 0.08);
    noiseSource.stop(when + duration + 0.08);
    tonalOscillator.start(when);
    tonalOscillator.stop(when + duration + 0.02);

    const cleanup = () => {
      noiseSource.disconnect();
      noiseBandpass.disconnect();
      lowShelf.disconnect();
      highShelf.disconnect();
      noiseGain.disconnect();
      tonalOscillator.disconnect();
      tonalFilter.disconnect();
      tonalGain.disconnect();
      voiceMix.disconnect();
      panner.disconnect();
      envelope.disconnect();
    };

    noiseSource.addEventListener('ended', cleanup, { once: true });
  }

  private emitStep(dotId: string | null): void {
    this.stepListeners.forEach((listener) => listener(dotId));
  }
}
