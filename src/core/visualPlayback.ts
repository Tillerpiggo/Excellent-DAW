// Visual Playback Engine - Stateless query layer
// Given a beat position, instantly computes visual state for all tracks.
// No frame loop, no callbacks — instruments read state via getTrackState().

import { Project } from './types';
import { Event } from './types';
import { VisualInstrumentState } from './visualTypes';
import { resolveProject, ResolvedTrack, BlackoutRegion, AutomationLane } from './resolution';
import { getInstrument } from '@/instruments';

interface PerTrackEvents {
  trackId: string;
  instrumentId: string;
  settings: Record<string, unknown>;
  blackoutRegions: BlackoutRegion[];
  automationLanes: AutomationLane[];
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
    pluginParamOverrides: new Map(),
    noteOnCount: 0,
    pitchNoteOnCounts: new Map(),
    blackedOut: false,
  };
}

export class VisualPlaybackEngine {
  private trackStates: Map<string, VisualInstrumentState> = new Map();
  private perTrackEvents: PerTrackEvents[] = [];
  private lastComputedBeat: number = -1;
  // Per-track last noteOnCount index for incremental pitchNoteOnCounts
  private lastLoPerTrack: Map<string, number> = new Map();

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
      const hasVisual = instrument?.hasVisual;
      const hasAutomationOnly = !hasVisual && resolved.automationLanes && resolved.automationLanes.length > 0;
      if (!hasVisual && !hasAutomationOnly) continue;

      const state = createVisualInstrumentState(resolved.instrumentId ?? '', resolved.instrumentSettings);
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

      // Sort blackout regions by startBeat for binary search
      const blackoutRegions = (resolved.blackoutRegions ?? [])
        .slice()
        .sort((a, b) => a.startBeat - b.startBeat);

      this.perTrackEvents.push({
        trackId: resolved.trackId,
        instrumentId: resolved.instrumentId!,
        settings: resolved.instrumentSettings ?? {},
        blackoutRegions,
        automationLanes: resolved.automationLanes ?? [],
        events,
      });
    }

    this.trackStates = newStates;
    // Reset incremental tracking
    this.lastLoPerTrack.clear();
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

      // Check if current beat falls within a blackout region (binary search)
      const regions = trackEvents.blackoutRegions;
      let isBlackedOut = false;
      if (regions.length > 0) {
        // Binary search: find last region with startBeat <= beat
        let rLo = 0, rHi = regions.length;
        while (rLo < rHi) {
          const mid = (rLo + rHi) >>> 1;
          if (regions[mid].startBeat <= beat) rLo = mid + 1;
          else rHi = mid;
        }
        if (rLo > 0) {
          const r = regions[rLo - 1];
          isBlackedOut = beat >= r.startBeat && beat < r.endBeat;
        }
      }
      state.blackedOut = isBlackedOut;

      // Apply automation lanes to params (runs even during blackout/empty events)
      state.pluginParamOverrides.clear();
      for (const lane of trackEvents.automationLanes) {
        const kf = lane.keyframes;
        if (kf.length === 0) continue;

        // Binary search: find last keyframe with beatTime <= beat
        let aLo = 0, aHi = kf.length;
        while (aLo < aHi) {
          const mid = (aLo + aHi) >>> 1;
          if (kf[mid].beatTime <= beat) aLo = mid + 1;
          else aHi = mid;
        }

        if (aLo === 0) continue; // no keyframe before current beat

        let value: number;
        if (!lane.interpolate || aLo >= kf.length) {
          value = kf[aLo - 1].value;
        } else {
          const prev = kf[aLo - 1];
          const next = kf[aLo];
          const t = (beat - prev.beatTime) / (next.beatTime - prev.beatTime);
          value = prev.value + t * (next.value - prev.value);
        }

        if (lane.pluginInstanceId) {
          // Write to plugin param overrides
          let overrides = state.pluginParamOverrides.get(lane.pluginInstanceId);
          if (!overrides) {
            overrides = {};
            state.pluginParamOverrides.set(lane.pluginInstanceId, overrides);
          }
          overrides[lane.paramKey] = value;
        } else {
          state.params[lane.paramKey] = value;
        }
      }

      if (isBlackedOut) {
        state.activeNotes.clear();
        state.noteOnCount = 0;
        state.pitchNoteOnCounts.clear();
        this.lastLoPerTrack.set(trackEvents.trackId, 0);
        state.bloom = 0;
        state.colorShift = 0;
        continue;
      }

      const events = trackEvents.events;
      if (events.length === 0) {
        state.noteOnCount = 0;
        state.activeNotes.clear();
        state.bloom = 0;
        state.colorShift = 0;
        continue;
      }

      // Binary search: count events with startTimeInBeats <= beat
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

      // Incremental pitchNoteOnCounts: only process new events since last frame
      const prevLo = this.lastLoPerTrack.get(trackEvents.trackId) ?? 0;
      if (lo >= prevLo && prevLo > 0) {
        // Forward playback: only count newly crossed events
        for (let i = prevLo; i < lo; i++) {
          const p = events[i].pitch;
          state.pitchNoteOnCounts.set(p, (state.pitchNoteOnCounts.get(p) ?? 0) + 1);
        }
      } else {
        // Seek/rewind/first frame: full recount
        state.pitchNoteOnCounts.clear();
        for (let i = 0; i < lo; i++) {
          const p = events[i].pitch;
          state.pitchNoteOnCounts.set(p, (state.pitchNoteOnCounts.get(p) ?? 0) + 1);
        }
      }
      this.lastLoPerTrack.set(trackEvents.trackId, lo);

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

/**
 * Returns plugin settings with automation overrides merged in.
 * Call this per-frame in plugin wrappers to get live automated values.
 */
export function getPluginSettingsWithOverrides(
  trackId: string,
  pluginInstanceId: string,
  baseSettings: Record<string, unknown>
): Record<string, unknown> {
  const engine = getVisualPlaybackEngine();
  const state = engine.getTrackState(trackId);
  if (!state) return baseSettings;
  const overrides = state.pluginParamOverrides.get(pluginInstanceId);
  if (!overrides) return baseSettings;
  return { ...baseSettings, ...overrides };
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
