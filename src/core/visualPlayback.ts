// Visual Playback Engine - Frame-based timing for visual instruments
// Syncs with Tone.js transport using a shared clock function

import { Event } from './types';
import { VisualInstrumentState } from './visualTypes';
import { ResolvedTrack } from './resolution';
import { getInstrument } from '@/instruments';

// Visual lookahead in beats - matches audio lookahead for sync
// This processes visual events slightly ahead so they appear in sync with audio
const VISUAL_LOOKAHEAD_BEATS = 0.05; // Small lookahead to match audio scheduling

export interface VisualPlaybackCallbacks {
  // Called only when track structure changes (not every frame)
  onTracksChanged?: (trackIds: string[]) => void;
  onNoteOn?: (trackId: string, pitch: number, velocity: number, duration: number) => void;
  onNoteOff?: (trackId: string, pitch: number) => void;
}

interface ScheduledVisualEvent {
  trackId: string;
  instrumentId: string;
  startTimeInBeats: number;
  pitch: number;
  velocity: number;
  duration: number;
}

// Create visual instrument state from unified instrument system
function createVisualInstrumentState(
  instrumentId: string,
  settings?: Record<string, unknown>
): VisualInstrumentState {
  const instrument = getInstrument(instrumentId);
  const defaultSettings = instrument?.defaultSettings ?? {};
  return {
    instrumentId,
    activeNotes: new Map<number, Event>(),
    currentRotation: 0,
    bloom: 0,
    colorShift: 0,
    params: { ...defaultSettings, ...settings },
    noteOnCount: 0,
  };
}

export class VisualPlaybackEngine {
  private animationFrame: number | null = null;
  private bpm: number = 120;
  private beatsPerBar: number = 4;
  private totalBeats: number = 16;
  private isPlaying: boolean = false;
  private isReady: boolean = false;
  private callbacks: VisualPlaybackCallbacks = {};
  private trackStates: Map<string, VisualInstrumentState> = new Map();
  private scheduledEvents: ScheduledVisualEvent[] = [];
  private lastProcessedBeat: number = -1;
  private getCurrentBeatFn: (() => number) | null = null;
  // Pre-indexed events by beat for faster lookup
  private eventIndex: Map<number, ScheduledVisualEvent[]> = new Map();

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
    this.bpm = bpm;
    this.beatsPerBar = beatsPerBar;
    this.totalBeats = totalBars * beatsPerBar;
    this.getCurrentBeatFn = getCurrentBeatFn;
    this.trackStates.clear();
    this.scheduledEvents = [];
    this.eventIndex.clear();
    this.lastProcessedBeat = -1;
    this.isReady = false;

    // Create state for each track with a visual instrument
    for (const resolved of resolvedTracks) {
      const instrument = resolved.instrumentId ? getInstrument(resolved.instrumentId) : undefined;
      if (instrument?.hasVisual) {
        const state = createVisualInstrumentState(resolved.instrumentId!, resolved.instrumentSettings);
        this.trackStates.set(resolved.trackId, state);

        // Schedule visual events for this track
        for (const event of resolved.output.events) {
          this.scheduledEvents.push({
            trackId: resolved.trackId,
            instrumentId: resolved.instrumentId!,
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

    // Build event index for faster lookup (bucket by beat floor)
    for (const event of this.scheduledEvents) {
      const beatKey = Math.floor(event.startTimeInBeats);
      if (!this.eventIndex.has(beatKey)) {
        this.eventIndex.set(beatKey, []);
      }
      this.eventIndex.get(beatKey)!.push(event);
    }

    // Mark as ready after all preparation is done
    this.isReady = true;

    // Notify about track structure change (not per-frame)
    this.callbacks.onTracksChanged?.(Array.from(this.trackStates.keys()));
  }

  // Prepare engine before playback - call this before transport.start()
  prepare(startBeat: number = 0): void {
    if (!this.isReady) {
      console.warn('[VisualPlayback] Engine not initialized');
      return;
    }

    // Pre-calculate initial state at start position
    this.lastProcessedBeat = startBeat - VISUAL_LOOKAHEAD_BEATS;

    // Find notes that should already be active at start position
    for (const event of this.scheduledEvents) {
      const noteEnd = event.startTimeInBeats + event.duration;
      if (event.startTimeInBeats <= startBeat && noteEnd > startBeat) {
        const state = this.trackStates.get(event.trackId);
        if (state) {
          state.activeNotes.set(event.pitch, {
            startTimeInBeats: event.startTimeInBeats,
            pitch: event.pitch,
            velocity: event.velocity,
            duration: event.duration,
          });
        }
      }
    }
  }

  start(): void {
    if (this.isPlaying) return;
    if (!this.isReady) {
      console.warn('[VisualPlayback] Engine not ready - call initialize() first');
      return;
    }

    this.isPlaying = true;
    // Don't reset lastProcessedBeat here - prepare() already set it
    if (this.lastProcessedBeat < 0) {
      this.lastProcessedBeat = -VISUAL_LOOKAHEAD_BEATS;
    }
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

    // Update lastProcessedBeat with lookahead offset so frame loop continues correctly
    this.lastProcessedBeat = beat - VISUAL_LOOKAHEAD_BEATS;
  }

  private frameLoop = (): void => {
    if (!this.isPlaying || !this.getCurrentBeatFn) return;

    // Get current beat from Tone.js transport (synced with audio)
    const currentBeat = this.getCurrentBeatFn();

    // Apply visual lookahead - process events slightly ahead to match audio scheduling
    const targetBeat = currentBeat + VISUAL_LOOKAHEAD_BEATS;

    // Detect loop reset (beat jumped backwards significantly)
    if (this.lastProcessedBeat > targetBeat + 1) {
      // Loop occurred - reset and clear states
      this.lastProcessedBeat = -VISUAL_LOOKAHEAD_BEATS;
      for (const [, state] of this.trackStates) {
        state.activeNotes.clear();
      }
    }

    // Process events between lastProcessedBeat and targetBeat using index
    const startBeatKey = Math.floor(this.lastProcessedBeat);
    const endBeatKey = Math.floor(targetBeat);

    for (let beatKey = startBeatKey; beatKey <= endBeatKey; beatKey++) {
      const events = this.eventIndex.get(beatKey);
      if (!events) continue;

      for (const event of events) {
        // Skip events we've already processed
        if (event.startTimeInBeats <= this.lastProcessedBeat) continue;

        // Process events up to target beat
        if (event.startTimeInBeats <= targetBeat) {
          this.triggerNoteOn(event, currentBeat);
        }
      }
    }

    this.lastProcessedBeat = targetBeat;

    // Update active notes and decay visual states
    this.updateStates(currentBeat);

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
