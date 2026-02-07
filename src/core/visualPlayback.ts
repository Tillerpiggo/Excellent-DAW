// Visual Playback Engine - Stateless query layer
// Given a beat position, instantly computes visual state for all tracks.
// No frame loop, no callbacks — instruments read state via getTrackState().

import { Project } from './types';
import { Event } from './types';
import { VisualInstrumentState } from './visualTypes';
import { resolveProject, ResolvedTrack } from './resolution';
import { getInstrument } from '@/instruments';

interface PerTrackEvents {
  trackId: string;
  instrumentId: string;
  settings: Record<string, unknown>;
  // Sorted by startTimeInBeats
  events: {
    startTimeInBeats: number;
    pitch: number;
    velocity: number;
    duration: number;
  }[];
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
    pitchNoteOnCounts: new Map(),
  };
}

export class VisualPlaybackEngine {
  private trackStates: Map<string, VisualInstrumentState> = new Map();
  private perTrackEvents: PerTrackEvents[] = [];
  private lastComputedBeat: number = -1;

  /**
   * Resolve project events and build per-track sorted event lists.
   * Called whenever the project changes.
   */
  resolveFromProject(project: Project): void {
    const resolvedTracks = resolveProject(project);
    this.perTrackEvents = [];

    // Rebuild track states, preserving params from project settings
    const newStates = new Map<string, VisualInstrumentState>();

    for (const resolved of resolvedTracks) {
      const instrument = resolved.instrumentId ? getInstrument(resolved.instrumentId) : undefined;
      if (!instrument?.hasVisual) continue;

      const state = createVisualInstrumentState(resolved.instrumentId!, resolved.instrumentSettings);
      newStates.set(resolved.trackId, state);

      // Build sorted event list for this track
      const events = resolved.output.events
        .map(e => ({
          startTimeInBeats: e.startTimeInBeats,
          pitch: e.pitch,
          velocity: e.velocity,
          duration: e.duration,
        }))
        .sort((a, b) => a.startTimeInBeats - b.startTimeInBeats);

      this.perTrackEvents.push({
        trackId: resolved.trackId,
        instrumentId: resolved.instrumentId!,
        settings: resolved.instrumentSettings ?? {},
        events,
      });
    }

    this.trackStates = newStates;
    // Force recompute on next call
    this.lastComputedBeat = -1;
  }

  /**
   * Compute visual state for all tracks at a given beat position.
   * Uses binary search for noteOnCount, scans for activeNotes.
   * Short-circuits if beat is unchanged.
   */
  computeStatesAtBeat(beat: number): void {
    // Short-circuit: same beat as last frame
    if (beat === this.lastComputedBeat) return;
    this.lastComputedBeat = beat;

    for (const trackEvents of this.perTrackEvents) {
      const state = this.trackStates.get(trackEvents.trackId);
      if (!state) continue;

      const events = trackEvents.events;
      if (events.length === 0) {
        state.noteOnCount = 0;
        state.activeNotes.clear();
        state.bloom = 0;
        state.colorShift = 0;
        continue;
      }

      // Binary search: count events with startTimeInBeats <= beat
      // This gives us the deterministic noteOnCount at this beat
      let lo = 0;
      let hi = events.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (events[mid].startTimeInBeats <= beat) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      state.noteOnCount = lo;

      // Compute per-pitch note-on counts (how many events of each pitch have started)
      state.pitchNoteOnCounts.clear();
      for (let i = 0; i < lo; i++) {
        const p = events[i].pitch;
        state.pitchNoteOnCounts.set(p, (state.pitchNoteOnCounts.get(p) ?? 0) + 1);
      }

      // Find active notes: notes that started <= beat and haven't ended yet
      state.activeNotes.clear();

      // Scan backwards from lo to find active notes (limit scan for perf)
      const scanStart = Math.max(0, lo - 200);
      for (let i = scanStart; i < lo; i++) {
        const ev = events[i];
        const noteEnd = ev.startTimeInBeats + ev.duration;
        if (noteEnd > beat) {
          state.activeNotes.set(ev.pitch, {
            startTimeInBeats: ev.startTimeInBeats,
            pitch: ev.pitch,
            velocity: ev.velocity,
            duration: ev.duration,
          });
        }
      }

      // Compute bloom from most recent note
      if (lo > 0) {
        const mostRecent = events[lo - 1];
        const timeSinceNote = beat - mostRecent.startTimeInBeats;
        // Bloom decays over ~0.5 beats
        const velocityNorm = mostRecent.velocity / 127;
        state.bloom = Math.max(0, velocityNorm * 0.5 * (1 - timeSinceNote * 2));
      } else {
        state.bloom = 0;
      }

      // Color shift from most recent note
      if (lo > 0) {
        const mostRecent = events[lo - 1];
        state.colorShift = (mostRecent.pitch % 12) / 12;
      }
    }
  }

  /**
   * Returns track IDs that have visual state.
   */
  getActiveTrackIds(): string[] {
    return Array.from(this.trackStates.keys());
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
  visualPlaybackEngine = null;
}
