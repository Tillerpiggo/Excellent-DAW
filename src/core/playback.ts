import * as Tone from 'tone';
import { Project, InstrumentId } from './types';
import { resolveProject, ResolvedTrack } from './resolution';
import { createInstruments, scheduleEvent, disposeInstruments, InstrumentInstances } from './instruments';
import { ChordQuality, generateChordPitches } from './harmony';

export type PlaybackState = 'stopped' | 'playing' | 'paused';

export interface PlaybackCallbacks {
  onBeatChange?: (beat: number) => void;
  onStateChange?: (state: PlaybackState) => void;
  onLoop?: () => void;
}

export class PlaybackEngine {
  private instruments: InstrumentInstances | null = null;
  private state: PlaybackState = 'stopped';
  private animationFrame: number | null = null;
  private callbacks: PlaybackCallbacks = {};
  private parts: Tone.Part[] = [];
  private project: Project | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await Tone.start();
    this.instruments = createInstruments();
    this.isInitialized = true;
  }

  setCallbacks(callbacks: PlaybackCallbacks): void {
    this.callbacks = callbacks;
  }

  async play(project: Project): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.state === 'playing') {
      this.stop();
    }

    this.project = project;
    this.state = 'playing';
    this.callbacks.onStateChange?.('playing');

    // Set BPM
    Tone.getTransport().bpm.value = project.bpm;

    // Resolve project to get all playable events
    const resolvedTracks = resolveProject(project);

    // Schedule all events
    this.scheduleEvents(resolvedTracks, project);

    // Start transport
    Tone.getTransport().start();

    // Start beat tracking
    this.startBeatTracking(project);
  }

  private scheduleEvents(resolvedTracks: ResolvedTrack[], project: Project): void {
    if (!this.instruments) return;

    const totalBeats = project.totalBars * project.beatsPerBar;

    for (const resolved of resolvedTracks) {
      if (!resolved.instrumentId) continue;

      // Filter events within bounds and convert to Tone.Part format
      const partEvents = resolved.output.events
        .filter(event => event.time < totalBeats)
        .map(event => ({
          time: `${Math.floor(event.time / project.beatsPerBar)}:${event.time % project.beatsPerBar}`,
          event,
        }));

      if (partEvents.length === 0) continue;

      // Create a Tone.Part for this track - handles lookahead scheduling automatically
      const part = new Tone.Part((time, { event }) => {
        scheduleEvent(
          event,
          resolved.instrumentId as InstrumentId,
          this.instruments!,
          time
        );
      }, partEvents);

      part.start(0);
      part.loop = true;
      part.loopEnd = `${project.totalBars}:0`;

      this.parts.push(part);
    }

    // Configure transport loop
    Tone.getTransport().loop = true;
    Tone.getTransport().loopEnd = `${project.totalBars}:0`;
    Tone.getTransport().loopStart = 0;
  }

  private startBeatTracking(project: Project): void {
    const totalBeats = project.totalBars * project.beatsPerBar;
    let lastBeat = -1;

    const update = () => {
      if (this.state !== 'playing') return;

      const position = Tone.getTransport().position;
      const [bars, beats] = String(position).split(':').map(Number);
      const currentBeat = (bars || 0) * project.beatsPerBar + (beats || 0);

      if (Math.floor(currentBeat) !== lastBeat) {
        lastBeat = Math.floor(currentBeat);
        this.callbacks.onBeatChange?.(lastBeat % totalBeats);
      }

      this.animationFrame = requestAnimationFrame(update);
    };

    this.animationFrame = requestAnimationFrame(update);
  }

  stop(): void {
    this.state = 'stopped';
    this.callbacks.onStateChange?.('stopped');

    // Stop transport
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;

    // Dispose all parts
    for (const part of this.parts) {
      part.dispose();
    }
    this.parts = [];

    // Stop beat tracking
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.callbacks.onBeatChange?.(0);
  }

  pause(): void {
    if (this.state !== 'playing') return;

    this.state = 'paused';
    this.callbacks.onStateChange?.('paused');
    Tone.getTransport().pause();

    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  resume(): void {
    if (this.state !== 'paused' || !this.project) return;

    this.state = 'playing';
    this.callbacks.onStateChange?.('playing');
    Tone.getTransport().start();
    this.startBeatTracking(this.project);
  }

  getState(): PlaybackState {
    return this.state;
  }

  getCurrentBeat(): number {
    if (!this.project) return 0;

    const position = Tone.getTransport().position;
    const [bars, beats] = String(position).split(':').map(Number);
    return (bars || 0) * this.project.beatsPerBar + (beats || 0);
  }

  setBpm(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
  }

  seekTo(beat: number, beatsPerBar: number): void {
    const bars = Math.floor(beat / beatsPerBar);
    const beats = beat % beatsPerBar;
    Tone.getTransport().position = `${bars}:${beats}:0`;
    this.callbacks.onBeatChange?.(beat);
  }

  async previewChord(
    root: number,
    quality: ChordQuality,
    octave: number = 4,
    instrumentId: InstrumentId = 'pad'
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.instruments) return;

    const pitches = generateChordPitches(root, quality, octave);
    const now = Tone.now();

    // Use the track's instrument if it supports polyphony, else fallback to pad
    const polyInstruments: InstrumentId[] = ['synth', 'keys', 'pad'];
    const actualInstrument = polyInstruments.includes(instrumentId) ? instrumentId : 'pad';

    for (const pitch of pitches) {
      scheduleEvent(
        { time: 0, pitch, velocity: 90, duration: 0.5 },
        actualInstrument,
        this.instruments,
        now
      );
    }
  }

  setLoopRegion(startBeat: number | null, endBeat: number | null, beatsPerBar: number): void {
    const transport = Tone.getTransport();

    if (startBeat === null || endBeat === null) {
      // Clear loop region - restore full project loop
      if (this.project) {
        transport.loopStart = 0;
        transport.loopEnd = `${this.project.totalBars}:0`;
      }
      return;
    }

    // Set custom loop region
    const startBars = Math.floor(startBeat / beatsPerBar);
    const startBeats = startBeat % beatsPerBar;
    const endBars = Math.floor(endBeat / beatsPerBar);
    const endBeats = endBeat % beatsPerBar;

    transport.loopStart = `${startBars}:${startBeats}:0`;
    transport.loopEnd = `${endBars}:${endBeats}:0`;
  }

  dispose(): void {
    this.stop();

    if (this.instruments) {
      disposeInstruments(this.instruments);
      this.instruments = null;
    }

    this.isInitialized = false;
  }
}

// Singleton instance
let playbackEngine: PlaybackEngine | null = null;

export function getPlaybackEngine(): PlaybackEngine {
  if (!playbackEngine) {
    playbackEngine = new PlaybackEngine();
  }
  return playbackEngine;
}

export function disposePlaybackEngine(): void {
  if (playbackEngine) {
    playbackEngine.dispose();
    playbackEngine = null;
  }
}
