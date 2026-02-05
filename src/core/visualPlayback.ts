// Visual Playback Engine - Frame-based timing for visual instruments

import { VisualInstrumentId, Event } from './types';
import { VisualEvent, VisualInstrumentState } from './visualTypes';
import { ResolvedTrack } from './resolution';
import { createVisualInstrumentState } from './visualInstruments';

export interface VisualPlaybackCallbacks {
  // Called only when track structure changes (not every frame)
  onTracksChanged?: (trackIds: string[]) => void;
  onNoteOn?: (trackId: string, pitch: number, velocity: number, duration: number) => void;
  onNoteOff?: (trackId: string, pitch: number) => void;
}

interface ScheduledVisualEvent {
  trackId: string;
  instrumentId: VisualInstrumentId;
  startTimeInBeats: number;
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
        console.log('[VisualPlayback] Creating state for track:', resolved.trackId, 'visualParams:', resolved.visualParams);
        const state = createVisualInstrumentState(resolved.visualInstrumentId, resolved.visualParams);
        console.log('[VisualPlayback] Created state with params:', state.params);
        this.trackStates.set(resolved.trackId, state);

        // Schedule visual events for this track
        // All events now have pitch (drums use MIDI pitches 36/38/39/42)
        for (const event of resolved.output.events) {
          this.scheduledEvents.push({
            trackId: resolved.trackId,
            instrumentId: resolved.visualInstrumentId,
            startTimeInBeats: event.startTimeInBeats,
            pitch: event.pitch,
            velocity: event.velocity,
            duration: event.duration,
          });
        }
      }
    }

    // Sort events by start time
    this.scheduledEvents.sort((a, b) => a.startTimeInBeats - b.startTimeInBeats);

    console.log('[VisualPlayback] Scheduled events count:', this.scheduledEvents.length);
    console.log('[VisualPlayback] First 20 event times:', this.scheduledEvents.slice(0, 20).map(e => e.startTimeInBeats.toFixed(3)));

    // Notify about track structure change (not per-frame)
    this.callbacks.onTracksChanged?.(Array.from(this.trackStates.keys()));
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
    for (const [, state] of this.trackStates) {
      state.activeNotes.clear();
      state.bloom = 0;
      state.colorShift = 0;
    }

    // Notify about track structure change
    this.callbacks.onTracksChanged?.([]);
  }

  // Seek to a specific beat - recalculates what should be active at that position
  seekTo(beat: number): void {
    // Clear all current state
    for (const [, state] of this.trackStates) {
      state.activeNotes.clear();
      state.bloom = 0;
    }

    // Find notes that should be active at this beat
    // (notes that started before this beat and haven't ended yet)
    for (const event of this.scheduledEvents) {
      const noteEnd = event.startTimeInBeats + event.duration;
      if (event.startTimeInBeats <= beat && noteEnd > beat) {
        const state = this.trackStates.get(event.trackId);
        if (state) {
          state.activeNotes.set(event.pitch, {
            startTimeInBeats: event.startTimeInBeats,
            pitch: event.pitch,
            velocity: event.velocity,
            duration: event.duration,
          });
          state.colorShift = (event.pitch % 12) / 12;
        }
      }
    }

    // Update lastProcessedBeat so the frame loop continues from here
    this.lastProcessedBeat = beat;
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
      if (event.startTimeInBeats <= this.lastProcessedBeat) continue;

      // Process events up to current beat
      if (event.startTimeInBeats <= currentBeat) {
        this.triggerNoteOn(event, currentBeat);
      } else {
        break; // Events are sorted, no need to check further
      }
    }

    this.lastProcessedBeat = currentBeat;

    // Update active notes and decay visual states
    this.updateStates(currentBeat);

    // Note: No React state update here - visual instruments read directly via getTrackState()

    this.animationFrame = requestAnimationFrame(this.frameLoop);
  };

  private triggerNoteOn(event: ScheduledVisualEvent, currentBeat: number): void {
    const state = this.trackStates.get(event.trackId);
    if (!state) return;

    const activeNote: Event = {
      startTimeInBeats: currentBeat,
      pitch: event.pitch,
      velocity: event.velocity,
      duration: event.duration,
    };

    state.activeNotes.set(event.pitch, activeNote);

    // Increment note-on counter (NEVER throttled - counts every trigger)
    state.noteOnCount++;
    console.log('[VisualPlayback] triggerNoteOn - track:', event.trackId, 'eventBeat:', event.startTimeInBeats.toFixed(3), 'currentBeat:', currentBeat.toFixed(3), 'noteOnCount:', state.noteOnCount);

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
        if (currentBeat >= note.startTimeInBeats + note.duration) {
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
