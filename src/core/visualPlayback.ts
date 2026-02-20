// Visual Playback Engine - Stateless query layer
// Given a beat position, instantly computes visual state for all tracks.
// No frame loop, no callbacks — instruments read state via getTrackState().

import { Project } from './types';
import { Event } from './types';
import { VisualInstrumentState } from './visualTypes';
import { resolveProject, ResolvedTrack, BlackoutRegion, AutomationLane } from './resolution';
import { getInstrument, isMaskInstrument } from '@/instruments';
import {
  ColorPaletteDef,
  DEFAULT_PALETTES,
  resolvePaletteAtBeat,
  applyColorRoleMapping,
} from './colorPalette';

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
    activePalette: null,
  };
}

export class VisualPlaybackEngine {
  private trackStates: Map<string, VisualInstrumentState> = new Map();
  private perTrackEvents: PerTrackEvents[] = [];
  private lastComputedBeat: number = -1;
  // Per-track last noteOnCount index for incremental pitchNoteOnCounts
  private lastLoPerTrack: Map<string, number> = new Map();
  // Palette child map: parentTrackId → paletteChildTrackId
  private paletteChildMap: Map<string, string> = new Map();
  // Mask child map: sceneTrackId → maskChildTrackIds
  private maskChildMap: Map<string, string[]> = new Map();
  // Scene router child map: parentTrackId → sceneRouterChildTrackId
  private sceneRouterMap: Map<string, string> = new Map();
  // Crossfade state per parent track
  private palettePrevPitch: Map<string, number> = new Map();
  private palettePrevDef: Map<string, ColorPaletteDef> = new Map();

  /**
   * Resolve project events and build per-track sorted event lists.
   * Called whenever the project changes.
   */
  resolveFromProject(project: Project): void {
    const resolvedTracks = resolveProject(project);
    this.perTrackEvents = [];

    // Build palette child map and mask child map by scanning project tracks
    this.paletteChildMap.clear();
    this.maskChildMap.clear();
    this.sceneRouterMap.clear();
    for (const track of Object.values(project.tracks)) {
      if (track.instrumentId === 'colorPalette' && track.parentId) {
        this.paletteChildMap.set(track.parentId, track.id);
      }
      if (isMaskInstrument(track.instrumentId) && track.parentId) {
        const existing = this.maskChildMap.get(track.parentId) ?? [];
        existing.push(track.id);
        this.maskChildMap.set(track.parentId, existing);
      }
      if (track.instrumentId === 'sceneRouter' && track.parentId) {
        this.sceneRouterMap.set(track.parentId, track.id);
      }
    }

    // Rebuild track states, preserving params from project settings
    const newStates = new Map<string, VisualInstrumentState>();

    for (const resolved of resolvedTracks) {
      const instrument = resolved.instrumentId ? getInstrument(resolved.instrumentId) : undefined;
      const hasVisual = instrument?.hasVisual;
      const isColorPalette = resolved.instrumentId === 'colorPalette';
      const isMask = isMaskInstrument(resolved.instrumentId);
      const isSceneRouter = resolved.instrumentId === 'sceneRouter';
      const hasAutomationOnly = !hasVisual && !isColorPalette && !isMask && !isSceneRouter && resolved.automationLanes && resolved.automationLanes.length > 0;
      const hasBlackoutRegions = (resolved.blackoutRegions?.length ?? 0) > 0;
      if (!hasVisual && !isColorPalette && !isMask && !isSceneRouter && !hasAutomationOnly && !hasBlackoutRegions) continue;

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
    // Reset palette crossfade state
    this.palettePrevPitch.clear();
    this.palettePrevDef.clear();
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
        const mode = lane.interpolation ?? (lane.interpolate ? 'linear' : 'step');
        if (mode === 'step' || aLo >= kf.length) {
          value = kf[aLo - 1].value;
        } else {
          const prev = kf[aLo - 1];
          const next = kf[aLo];
          const tLinear = (beat - prev.beatTime) / (next.beatTime - prev.beatTime);
          let t: number;
          switch (mode) {
            case 'ease-in':
              t = tLinear * tLinear;
              break;
            case 'ease-out':
              t = 1 - (1 - tLinear) * (1 - tLinear);
              break;
            case 'ease-in-out':
              t = tLinear < 0.5
                ? 2 * tLinear * tLinear
                : 1 - 2 * (1 - tLinear) * (1 - tLinear);
              break;
            case 'exponential':
              t = tLinear * tLinear * tLinear;
              break;
            case 'smooth-step':
              t = tLinear * tLinear * (3 - 2 * tLinear);
              break;
            default: // linear
              t = tLinear;
          }
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

    // ── Second pass: resolve color palettes ────────────────────────────
    for (const [parentTrackId, paletteTrackId] of this.paletteChildMap) {
      const parentState = this.trackStates.get(parentTrackId);
      const paletteState = this.trackStates.get(paletteTrackId);
      if (!parentState || !paletteState) continue;

      // Get palette settings (crossfade, custom palettes)
      const paletteTrackEvents = this.perTrackEvents.find(e => e.trackId === paletteTrackId);
      const settings = paletteTrackEvents?.settings ?? {};
      const palettes = (settings.palettes as ColorPaletteDef[] | undefined) ?? DEFAULT_PALETTES;
      const crossfadeDuration = (settings.crossfadeDuration as number | undefined) ?? 0;

      // Detect seek/rewind for crossfade reset
      const prevLo = this.lastLoPerTrack.get(paletteTrackId) ?? 0;
      const paletteEvents = paletteTrackEvents?.events ?? [];
      let currentLo = 0;
      { let lo2 = 0, hi2 = paletteEvents.length;
        while (lo2 < hi2) {
          const mid = (lo2 + hi2) >>> 1;
          if (paletteEvents[mid].startTimeInBeats <= beat) lo2 = mid + 1;
          else hi2 = mid;
        }
        currentLo = lo2;
      }
      if (currentLo < prevLo) {
        // Seek/rewind detected — reset crossfade state
        this.palettePrevPitch.delete(parentTrackId);
        this.palettePrevDef.delete(parentTrackId);
      }

      const prevPitch = this.palettePrevPitch.get(parentTrackId) ?? null;
      const prevDef = this.palettePrevDef.get(parentTrackId) ?? null;

      const resolved = resolvePaletteAtBeat(
        paletteState.activeNotes,
        palettes,
        crossfadeDuration,
        beat,
        prevPitch,
        prevDef,
      );

      if (resolved) {
        parentState.activePalette = resolved;

        // Update prev state for crossfade tracking
        if (resolved.toPalette) {
          // Find current pitch from active notes (latest-starting)
          let bestPitch: number | null = null;
          let bestStart = -Infinity;
          for (const note of paletteState.activeNotes.values()) {
            if (note.startTimeInBeats > bestStart) {
              bestStart = note.startTimeInBeats;
              bestPitch = note.pitch;
            }
          }
          if (bestPitch !== null) {
            this.palettePrevPitch.set(parentTrackId, bestPitch);
            this.palettePrevDef.set(parentTrackId, resolved.toPalette);
          }
        }

        // Apply color role mapping if the parent instrument defines one
        const parentInstrument = getInstrument(parentState.instrumentId);
        if (parentInstrument?.colorRoleMapping) {
          applyColorRoleMapping(parentState, parentInstrument.colorRoleMapping, resolved);
        }
      }
    }
  }

  /**
   * Returns mask instrument states for a given scene track.
   * Each entry has the instrumentId and current params (with automation applied).
   */
  getMaskStatesForScene(sceneTrackId: string): { instrumentId: string; params: Record<string, unknown>; activeNotes: Map<number, Event> }[] {
    const maskIds = this.maskChildMap.get(sceneTrackId);
    if (!maskIds) return [];

    return maskIds.map(maskTrackId => {
      const state = this.trackStates.get(maskTrackId);
      const trackEvents = this.perTrackEvents.find(e => e.trackId === maskTrackId);
      return {
        instrumentId: trackEvents?.instrumentId ?? '',
        params: state?.params ?? {},
        activeNotes: state?.activeNotes ?? new Map(),
      };
    }).filter(m => m.instrumentId);
  }

  /**
   * Returns whether a scene track is currently blacked out (muted by a mute child).
   */
  isSceneBlackedOut(sceneTrackId: string): boolean {
    const state = this.trackStates.get(sceneTrackId);
    return state?.blackedOut ?? false;
  }

  /**
   * Returns dynamic scene index for a track based on its SceneRouter child.
   * Uses the most recent note-on (latch behavior) — the scene stays until a new note triggers.
   * Returns undefined if no SceneRouter or no notes have triggered yet (use static sceneId).
   * Pitch 0 = Main (unassigned), 1+ = scene index in rootScenes.
   */
  getDynamicSceneIndex(trackId: string): number | undefined {
    const routerTrackId = this.sceneRouterMap.get(trackId);
    if (!routerTrackId) return undefined;

    const trackEvents = this.perTrackEvents.find(e => e.trackId === routerTrackId);
    if (!trackEvents || trackEvents.events.length === 0) return undefined;

    const beat = this.lastComputedBeat;
    const events = trackEvents.events;

    // Binary search: find last event with startTimeInBeats <= beat
    let lo = 0, hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (events[mid].startTimeInBeats <= beat) lo = mid + 1;
      else hi = mid;
    }

    if (lo === 0) return undefined; // no note has triggered yet
    return events[lo - 1].pitch;
  }

  /**
   * Returns track IDs that have visual state.
   */
  getActiveTrackIds(): string[] {
    return Array.from(this.trackStates.keys());
  }

  /**
   * Returns noteOnCount at an arbitrary beat for a given track (for look-ahead).
   */
  getNoteOnCountAtBeat(trackId: string, beat: number): number {
    const trackEvents = this.perTrackEvents.find(e => e.trackId === trackId);
    if (!trackEvents) return 0;
    const events = trackEvents.events;
    let lo = 0, hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (events[mid].startTimeInBeats <= beat) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Evaluate a parameter's value at an arbitrary beat for a given track,
   * taking automation into account. Returns defaultValue if no automation exists.
   */
  getParamAtBeat(trackId: string, paramKey: string, beat: number, defaultValue: number): number {
    const trackEvents = this.perTrackEvents.find(e => e.trackId === trackId);
    if (!trackEvents) return defaultValue;

    // Find the automation lane for this param
    const lane = trackEvents.automationLanes.find(l => !l.pluginInstanceId && l.paramKey === paramKey);
    if (!lane) return defaultValue;

    const kf = lane.keyframes;
    if (kf.length === 0) return defaultValue;

    // Binary search: find last keyframe with beatTime <= beat
    let aLo = 0, aHi = kf.length;
    while (aLo < aHi) {
      const mid = (aLo + aHi) >>> 1;
      if (kf[mid].beatTime <= beat) aLo = mid + 1;
      else aHi = mid;
    }

    if (aLo === 0) return defaultValue;

    const mode = lane.interpolation ?? (lane.interpolate ? 'linear' : 'step');
    if (mode === 'step' || aLo >= kf.length) {
      return kf[aLo - 1].value;
    }

    const prev = kf[aLo - 1];
    const next = kf[aLo];
    const tLinear = (beat - prev.beatTime) / (next.beatTime - prev.beatTime);
    let t: number;
    switch (mode) {
      case 'ease-in':      t = tLinear * tLinear; break;
      case 'ease-out':     t = 1 - (1 - tLinear) * (1 - tLinear); break;
      case 'ease-in-out':  t = tLinear < 0.5 ? 2 * tLinear * tLinear : 1 - 2 * (1 - tLinear) * (1 - tLinear); break;
      case 'exponential':  t = tLinear * tLinear * tLinear; break;
      case 'smooth-step':  t = tLinear * tLinear * (3 - 2 * tLinear); break;
      default:             t = tLinear;
    }
    return prev.value + t * (next.value - prev.value);
  }

  /** Get an automation lane for a track+param (cache-friendly: call once, reuse). */
  getAutomationLane(trackId: string, paramKey: string): AutomationLane | null {
    const trackEvents = this.perTrackEvents.find(e => e.trackId === trackId);
    if (!trackEvents) return null;
    return trackEvents.automationLanes.find(l => !l.pluginInstanceId && l.paramKey === paramKey) ?? null;
  }

  getTrackEvents(trackId: string): PerTrackEvents['events'] | null {
    const te = this.perTrackEvents.find(e => e.trackId === trackId);
    return te ? te.events : null;
  }

  getTrackState(trackId: string): VisualInstrumentState | undefined {
    return this.trackStates.get(trackId);
  }

  getAllStates(): Map<string, VisualInstrumentState> {
    return this.trackStates;
  }
}

/** Interpolate a pre-fetched automation lane at a given beat (no .find() lookups). */
export function interpolateLane(lane: AutomationLane | null, beat: number, defaultValue: number): number {
  if (!lane) return defaultValue;
  const kf = lane.keyframes;
  if (kf.length === 0) return defaultValue;

  let aLo = 0, aHi = kf.length;
  while (aLo < aHi) {
    const mid = (aLo + aHi) >>> 1;
    if (kf[mid].beatTime <= beat) aLo = mid + 1;
    else aHi = mid;
  }
  if (aLo === 0) return defaultValue;

  const mode = lane.interpolation ?? (lane.interpolate ? 'linear' : 'step');
  if (mode === 'step' || aLo >= kf.length) {
    return kf[aLo - 1].value;
  }

  const prev = kf[aLo - 1];
  const next = kf[aLo];
  const tLinear = (beat - prev.beatTime) / (next.beatTime - prev.beatTime);
  let t: number;
  switch (mode) {
    case 'ease-in':      t = tLinear * tLinear; break;
    case 'ease-out':     t = 1 - (1 - tLinear) * (1 - tLinear); break;
    case 'ease-in-out':  t = tLinear < 0.5 ? 2 * tLinear * tLinear : 1 - 2 * (1 - tLinear) * (1 - tLinear); break;
    case 'exponential':  t = tLinear * tLinear * tLinear; break;
    case 'smooth-step':  t = tLinear * tLinear * (3 - 2 * tLinear); break;
    default:             t = tLinear;
  }
  return prev.value + t * (next.value - prev.value);
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
