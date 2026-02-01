import * as Tone from 'tone';
import { Project, InstrumentId } from './types';
import { resolveProject, ResolvedTrack } from './resolution';
import { createInstruments, scheduleEvent, disposeInstruments, InstrumentInstances } from './instruments';

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
  private scheduledEvents: number[] = [];
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

      for (const event of resolved.output.events) {
        if (event.time >= totalBeats) continue;

        // Schedule the event
        const timeString = `${Math.floor(event.time / project.beatsPerBar)}:${event.time % project.beatsPerBar}`;

        const eventId = Tone.getTransport().schedule((time) => {
          scheduleEvent(
            event,
            resolved.instrumentId as InstrumentId,
            this.instruments!,
            time - Tone.now()
          );
        }, timeString);

        this.scheduledEvents.push(eventId);
      }
    }

    // Schedule loop point
    const totalDuration = `${project.totalBars}:0`;
    Tone.getTransport().loop = true;
    Tone.getTransport().loopEnd = totalDuration;
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

    // Clear scheduled events
    for (const eventId of this.scheduledEvents) {
      Tone.getTransport().clear(eventId);
    }
    this.scheduledEvents = [];

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
    if (this.project) {
      this.project.bpm = bpm;
    }
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
