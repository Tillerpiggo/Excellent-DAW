import { Project, Track, Block, Event, Output, ProcessContext, HarmonyInfo, VisualInstrumentId } from './types';
import { getTrackType } from './trackTypes';
import { findHarmonyInOutput, deriveScaleFromHarmony } from './harmony';

export interface ResolvedTrack {
  trackId: string;
  instrumentId?: string;
  visualInstrumentId?: VisualInstrumentId;
  visualParams?: Record<string, unknown>;
  output: Output;
}

interface ModifierResolution {
  pattern: Output;
  instrumentedResults: ResolvedTrack[];
}

function resolveModifierOutput(
  modifierTrack: Track,
  project: Project,
  context: ProcessContext,
  targetOutput: Output
): ModifierResolution {
  const instrumentedResults: ResolvedTrack[] = [];

  // Get modifier's own pattern
  let modifierPattern = resolveBlocks(modifierTrack.blocks, project, context);

  // Separate nested children
  const nestedModifiers: Track[] = [];
  const nestedRegular: Track[] = [];

  for (const childId of modifierTrack.childIds) {
    const childTrack = project.tracks[childId];
    if (!childTrack || childTrack.muted) continue;

    const childType = getTrackType(childTrack.typeId);
    if (childType.category === 'modifier' && !childTrack.instrumentId) {
      nestedModifiers.push(childTrack);
    } else {
      nestedRegular.push(childTrack);
    }
  }

  // Apply nested modifiers to this modifier's pattern (recursively)
  let nestedContext = buildContext(context, targetOutput, modifierPattern);

  for (const nestedModifier of nestedModifiers) {
    const nestedResolution = resolveModifierOutput(
      nestedModifier, project, nestedContext, modifierPattern
    );

    const nestedType = getTrackType(nestedModifier.typeId);
    modifierPattern = nestedType.combine(modifierPattern, nestedResolution.pattern, nestedContext);
    instrumentedResults.push(...nestedResolution.instrumentedResults);
    nestedContext = buildContext(context, targetOutput, modifierPattern);
  }

  // Process regular children with the transformed output
  const modifierType = getTrackType(modifierTrack.typeId);
  const transformedTarget = modifierType.combine(targetOutput, modifierPattern, context);

  for (const regularChild of nestedRegular) {
    const childResults = resolveTrack(regularChild, project, nestedContext, transformedTarget);
    instrumentedResults.push(...childResults);
  }

  return { pattern: modifierPattern, instrumentedResults };
}

export function resolveProject(project: Project): ResolvedTrack[] {
  const results: ResolvedTrack[] = [];
  const baseContext: ProcessContext = {
    bpm: project.bpm,
    beatsPerBar: project.beatsPerBar,
    totalBars: project.totalBars,
    currentBar: 0,
  };

  // Process root tracks
  for (const rootId of project.rootTracks) {
    const track = project.tracks[rootId];
    if (!track || track.muted) continue;

    const resolved = resolveTrack(track, project, baseContext);
    results.push(...resolved);
  }

  return results;
}

export function resolveTrack(
  track: Track,
  project: Project,
  context: ProcessContext,
  parentOutput?: Output,
  inheritedVisualInstrumentId?: VisualInstrumentId
): ResolvedTrack[] {
  const results: ResolvedTrack[] = [];

  // Step 1: Resolve this track's blocks
  let selfOutput = resolveBlocks(track.blocks, project, context);

  // Step 2: Separate children
  const modifierChildren: Track[] = [];
  const regularChildren: Track[] = [];

  for (const childId of track.childIds) {
    const childTrack = project.tracks[childId];
    if (!childTrack || childTrack.muted) continue;
    const childType = getTrackType(childTrack.typeId);
    if (childType.category === 'modifier' && !childTrack.instrumentId) {
      modifierChildren.push(childTrack);
    } else {
      regularChildren.push(childTrack);
    }
  }

  // Step 3: Apply modifier children to selfOutput BEFORE combining
  let modifierContext = buildContext(context, parentOutput, selfOutput);

  for (const modifierTrack of modifierChildren) {
    const modifierOutput = resolveModifierOutput(modifierTrack, project, modifierContext, selfOutput);
    const modifierType = getTrackType(modifierTrack.typeId);

    selfOutput = modifierType.combine(selfOutput, modifierOutput.pattern, modifierContext);
    results.push(...modifierOutput.instrumentedResults);
    modifierContext = buildContext(context, parentOutput, selfOutput);
  }

  // Step 4: Now combine modified self with parent
  const trackType = getTrackType(track.typeId);
  const enrichedContext = buildContext(context, parentOutput, selfOutput);

  let combinedOutput = trackType.combine(
    parentOutput || { events: [] },
    selfOutput,
    enrichedContext
  );

  // Step 5: Push this track's output
  // Include track if it has an audio instrument OR a visual instrument
  // Audio tracks are special - they have audioData in blocks, not MIDI events
  const isAudioTrack = track.instrumentId === 'audio';
  const hasAudioBlocks = isAudioTrack && track.blocks.some(b => b.audioData);
  const hasAudioInstrument = track.instrumentId && combinedOutput.events.length > 0;
  const hasVisualInstrument = track.visualInstrumentId && combinedOutput.events.length > 0;

  // Determine the visual instrument ID (own or inherited)
  const effectiveVisualInstrumentId = track.visualInstrumentId || inheritedVisualInstrumentId;

  // Check if this track should have visual output via inheritance
  // (has visualParams with actual content, no own visualInstrumentId, but can inherit one, and has its own events)
  const hasVisualParams = track.visualParams && Object.keys(track.visualParams).length > 0;
  const hasInheritedVisualOutput = !track.visualInstrumentId &&
    hasVisualParams &&
    inheritedVisualInstrumentId &&
    selfOutput.events.length > 0;

  // Debug: log inheritance check for any track with visualParams
  if (hasVisualParams && !track.visualInstrumentId) {
    console.log('[Resolution] Inheritance check for', track.id, ':', {
      hasVisualParams,
      inheritedVisualInstrumentId,
      selfEventsCount: selfOutput.events.length,
      willInherit: hasInheritedVisualOutput,
      visualParams: track.visualParams
    });
  }

  if (hasAudioBlocks || hasAudioInstrument || hasVisualInstrument) {
    if (track.visualInstrumentId) {
      console.log('[Resolution] Track', track.id, 'has own visual, visualParams:', track.visualParams);
    }
    results.push({
      trackId: track.id,
      instrumentId: track.instrumentId,
      visualInstrumentId: track.visualInstrumentId,
      visualParams: track.visualParams,
      output: combinedOutput,
    });
  }

  // If track inherits visual instrument via visualParams, create a visual-only output
  if (hasInheritedVisualOutput) {
    console.log('[Resolution] Track', track.id, 'INHERITS visual, visualParams:', track.visualParams);
    results.push({
      trackId: track.id,
      instrumentId: undefined, // No audio output
      visualInstrumentId: inheritedVisualInstrumentId,
      visualParams: track.visualParams,
      output: selfOutput, // Only this track's events, not combined
    });
  }

  // Step 6: Process regular children, passing down visual instrument for inheritance
  const visualToInherit = track.visualInstrumentId || inheritedVisualInstrumentId;
  for (const childTrack of regularChildren) {
    const childResults = resolveTrack(childTrack, project, enrichedContext, combinedOutput, visualToInherit);
    results.push(...childResults);
  }

  return results;
}

export function resolveBlocks(
  blocks: Block[],
  project: Project,
  context: ProcessContext
): Output {
  const allEvents: Event[] = [];
  const totalBeats = context.totalBars * context.beatsPerBar;

  for (const block of blocks) {
    const blockStartBeat = block.startBar * context.beatsPerBar;
    const blockDurationBeats = block.durationBars * context.beatsPerBar;

    // Get events from block
    const blockEvents = resolveBlockEvents(block, project, context);

    // Handle looping
    if (block.loop) {
      // Get the natural duration of the events
      const maxEventTime = blockEvents.reduce(
        (max, e) => Math.max(max, e.startTimeInBeats + (e.duration || 0)),
        0
      );
      // Round up to the nearest bar to ensure patterns loop on bar boundaries
      const loopLength = maxEventTime > 0
        ? Math.ceil(maxEventTime / context.beatsPerBar) * context.beatsPerBar
        : blockDurationBeats;

      // Loop events to fill block duration
      let currentOffset = 0;
      while (currentOffset < blockDurationBeats) {
        for (const event of blockEvents) {
          const eventTime = blockStartBeat + currentOffset + event.startTimeInBeats;
          if (eventTime < blockStartBeat + blockDurationBeats && eventTime < totalBeats) {
            allEvents.push({
              ...event,
              startTimeInBeats: eventTime,
            });
          }
        }
        currentOffset += loopLength;
      }
    } else {
      // No looping - just offset events
      for (const event of blockEvents) {
        const eventTime = blockStartBeat + event.startTimeInBeats;
        if (eventTime < blockStartBeat + blockDurationBeats && eventTime < totalBeats) {
          allEvents.push({
            ...event,
            startTimeInBeats: eventTime,
          });
        }
      }
    }
  }

  // Sort by time
  allEvents.sort((a, b) => a.startTimeInBeats - b.startTimeInBeats);

  return { events: allEvents };
}

export function resolveBlockEvents(
  block: Block,
  project: Project,
  context: ProcessContext
): Event[] {
  // If block has inline events (streams), use those
  if (block.streams && block.streams.length > 0) {
    return block.streams.flatMap(s => s.events);
  }

  // If block references another block/track
  if (block.sourceTrackId) {
    const sourceTrack = project.tracks[block.sourceTrackId];
    if (!sourceTrack) return [];

    // Find the referenced block
    if (block.sourceBlockId) {
      const sourceBlock = sourceTrack.blocks.find(b => b.id === block.sourceBlockId);
      if (sourceBlock) {
        const events = resolveBlockEvents(sourceBlock, project, context);
        return extractEvents(events, block.extractMode || 'all');
      }
    }

    // Or use all blocks from source track
    const sourceOutput = resolveBlocks(sourceTrack.blocks, project, context);
    return extractEvents(sourceOutput.events, block.extractMode || 'all');
  }

  return [];
}

export function extractEvents(events: Event[], mode: 'timing' | 'pitch' | 'velocity' | 'all'): Event[] {
  switch (mode) {
    case 'timing':
      // Keep timing, use default pitch (C4) and velocity
      return events.map(e => ({ startTimeInBeats: e.startTimeInBeats, pitch: 60, velocity: 100, duration: e.duration }));
    case 'pitch':
      // Keep pitch and timing, use default velocity
      return events.map(e => ({ startTimeInBeats: e.startTimeInBeats, pitch: e.pitch, velocity: 100, duration: e.duration }));
    case 'velocity':
      // Keep velocity and timing, use default pitch (C4)
      return events.map(e => ({ startTimeInBeats: e.startTimeInBeats, pitch: 60, velocity: e.velocity, duration: e.duration }));
    case 'all':
    default:
      return events;
  }
}

export function buildContext(
  baseContext: ProcessContext,
  parentOutput?: Output,
  selfOutput?: Output
): ProcessContext {
  const context = { ...baseContext };

  // Try to find harmony info
  let harmony: HarmonyInfo | undefined;

  if (parentOutput) {
    harmony = findHarmonyInOutput(parentOutput);
    context.parentOutput = parentOutput;
  }

  if (!harmony && selfOutput) {
    harmony = findHarmonyInOutput(selfOutput);
  }

  if (harmony) {
    context.harmony = harmony;
    context.scale = deriveScaleFromHarmony(harmony);
  }

  return context;
}

// Helper to get all events from a project for a specific time range
export function getEventsInRange(
  resolvedTracks: ResolvedTrack[],
  startBeat: number,
  endBeat: number
): { trackId: string; instrumentId: string; events: Event[] }[] {
  return resolvedTracks
    .filter(rt => rt.instrumentId)
    .map(rt => ({
      trackId: rt.trackId,
      instrumentId: rt.instrumentId!,
      events: rt.output.events.filter(e => e.startTimeInBeats >= startBeat && e.startTimeInBeats < endBeat),
    }));
}
