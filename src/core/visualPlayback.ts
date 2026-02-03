// Visual Playback Engine - Frame-based timing for visual instruments

import { VisualInstrumentId } from './types';
import { VisualEvent, VisualInstrumentState, ActiveNote } from './visualTypes';
import { ResolvedTrack } from './resolution';
import { createVisualInstrumentState } from './visualInstruments';

export interface VisualPlaybackCallbacks {
  onStateUpdate?: (states: Map<string, VisualInstrumentState>) => void;
  onNoteOn?: (trackId: string, pitch: number, velocity: number, duration: number) => void;
  onNoteOff?: (trackId: string, pitch: number) => void;
}

interface ScheduledVisualEvent {
  trackId: string;
  instrumentId: VisualInstrumentId;
  time: number; // in beats
  pitch: number;
  velocity: number;
  duration: number;
}

export class VisualPlaybackEngine {
  private animationFrame: number | null = null;
  private beatsPerBar: number = 4;
  private totalBeats: number = 16;
  private isPlaying: boolean = false;
  private callbacks: VisualPlaybackCallbacks = {};
  private trackStates: Map<string, VisualInstrumentState> = new Map();
  private scheduledEvents: ScheduledVisualEvent[] = [];
  private lastProcessedBeat: number = -1;
  private getCurrentBeatFn: (() => number) | null = null;

  setCallbacks(callbacks: VisualPlaybackCallbacks): void {
    this.callbacks = callbacks;
  }

  initialize(
    resolvedTracks: ResolvedTrack[],
    bpm: number,
    beatsPerBar: number,
    totalBars: number,
    getCurrentBeatFn: () => number
  ): void {
    this.beatsPerBar = beatsPerBar;
    this.totalBeats = totalBars * beatsPerBar;
    this.getCurrentBeatFn = getCurrentBeatFn;
    this.trackStates.clear();
    this.scheduledEvents = [];
    this.lastProcessedBeat = -1;

    // Create state for each track with a visual instrument
    for (const resolved of resolvedTracks) {
      if (resolved.visualInstrumentId) {
        this.trackStates.set(
          resolved.trackId,
          createVisualInstrumentState(resolved.visualInstrumentId)
        );

        // Schedule visual events for this track
        for (const event of resolved.output.events) {
          // Handle pitched events
          if (event.pitch !== undefined) {
            this.scheduledEvents.push({
              trackId: resolved.trackId,
              instrumentId: resolved.visualInstrumentId,
              time: event.time,
              pitch: event.pitch,
              velocity: event.velocity ?? 100,
              duration: event.duration ?? 0.25,
            });
          }
          // Handle drum events - map drum type to pseudo-pitch for visual variety
          else if (event.drum !== undefined) {
            const drumPitchMap: Record<string, number> = {
              kick: 36,
              snare: 38,
              clap: 39,
              hihat: 42,
            };
            this.scheduledEvents.push({
              trackId: resolved.trackId,
              instrumentId: resolved.visualInstrumentId,
              time: event.time,
              pitch: drumPitchMap[event.drum] ?? 36,
              velocity: event.velocity ?? 100,
              duration: event.duration ?? 0.1,
            });
          }
        }
      }
    }

    // Sort events by time
    this.scheduledEvents.sort((a, b) => a.time - b.time);
  }

  start(): void {
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.lastProcessedBeat = -1;
    this.frameLoop();
  }

  stop(): void {
    this.isPlaying = false;

    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // Clear all active notes and reset states
    for (const [trackId, state] of this.trackStates) {
      state.activeNotes.clear();
      state.bloom = 0;
      state.colorShift = 0;
    }

    this.callbacks.onStateUpdate?.(this.trackStates);
  }

  private frameLoop = (): void => {
    if (!this.isPlaying || !this.getCurrentBeatFn) return;

    // Get current beat from Tone.js transport (synced with audio)
    const currentBeat = this.getCurrentBeatFn();

    // Detect loop reset (beat jumped backwards significantly)
    if (this.lastProcessedBeat > currentBeat + 1) {
      this.lastProcessedBeat = -1;
    }

    // Process events between lastProcessedBeat and currentBeat
    for (const event of this.scheduledEvents) {
      // Skip events we've already processed (before lastProcessedBeat)
      if (event.time <= this.lastProcessedBeat) continue;

      // Process events up to current beat
      if (event.time <= currentBeat) {
        this.triggerNoteOn(event, currentBeat);
      } else {
        break; // Events are sorted, no need to check further
      }
    }

    this.lastProcessedBeat = currentBeat;

    // Update active notes and decay visual states
    this.updateStates(currentBeat);

    // Notify listeners
    this.callbacks.onStateUpdate?.(this.trackStates);

    this.animationFrame = requestAnimationFrame(this.frameLoop);
  };

  private triggerNoteOn(event: ScheduledVisualEvent, currentBeat: number): void {
    const state = this.trackStates.get(event.trackId);
    if (!state) return;

    const activeNote: ActiveNote = {
      pitch: event.pitch,
      velocity: event.velocity,
      startTime: currentBeat,
      duration: event.duration,
    };

    state.activeNotes.set(event.pitch, activeNote);

    // Update visual state based on note
    const velocityNorm = event.velocity / 127;
    state.bloom = Math.min(1, state.bloom + velocityNorm * 0.5);
    state.colorShift = (event.pitch % 12) / 12; // Map pitch to color wheel

    this.callbacks.onNoteOn?.(event.trackId, event.pitch, event.velocity, event.duration);
  }

  private updateStates(currentBeat: number): void {
    for (const [trackId, state] of this.trackStates) {
      // Check for note-offs
      const notesToRemove: number[] = [];
      for (const [pitch, note] of state.activeNotes) {
        if (currentBeat >= note.startTime + note.duration) {
          notesToRemove.push(pitch);
          this.callbacks.onNoteOff?.(trackId, pitch);
        }
      }
      for (const pitch of notesToRemove) {
        state.activeNotes.delete(pitch);
      }

      // Decay bloom
      state.bloom = Math.max(0, state.bloom - 0.02);

      // Update rotation based on active notes
      const activeCount = state.activeNotes.size;
      const avgVelocity = activeCount > 0
        ? Array.from(state.activeNotes.values()).reduce((sum, n) => sum + n.velocity, 0) / activeCount / 127
        : 0;
      state.currentRotation += 0.01 + avgVelocity * 0.05;
    }
  }

  getTrackState(trackId: string): VisualInstrumentState | undefined {
    return this.trackStates.get(trackId);
  }

  getAllStates(): Map<string, VisualInstrumentState> {
    return this.trackStates;
  }
}

// Singleton instance
let visualPlaybackEngine: VisualPlaybackEngine | null = null;

export function getVisualPlaybackEngine(): VisualPlaybackEngine {
  if (!visualPlaybackEngine) {
    visualPlaybackEngine = new VisualPlaybackEngine();
  }
  return visualPlaybackEngine;
}

export function disposeVisualPlaybackEngine(): void {
  if (visualPlaybackEngine) {
    visualPlaybackEngine.stop();
    visualPlaybackEngine = null;
  }
}
