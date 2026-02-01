import { Project, Track, Block, Event, Output, ProcessContext, HarmonyInfo } from './types';
import { getTrackType } from './trackTypes';
import { findHarmonyInOutput, deriveScaleFromHarmony } from './harmony';

export interface ResolvedTrack {
  trackId: string;
  instrumentId?: string;
  output: Output;
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
  parentOutput?: Output
): ResolvedTrack[] {
  const results: ResolvedTrack[] = [];

  // Resolve this track's blocks to an output
  const selfOutput = resolveBlocks(track.blocks, project, context);

  // Get track type and combine with parent
  const trackType = getTrackType(track.typeId);

  // Build context with harmony info
  let enrichedContext = buildContext(context, parentOutput, selfOutput);

  // Combine outputs
  let combinedOutput = trackType.combine(
    parentOutput || { events: [] },
    selfOutput,
    enrichedContext
  );

  // Separate children into modifiers (without instruments) and regular children
  const modifierChildren: Track[] = [];
  const regularChildren: Track[] = [];

  for (const childId of track.childIds) {
    const childTrack = project.tracks[childId];
    if (!childTrack || childTrack.muted) continue;

    const childType = getTrackType(childTrack.typeId);
    // Modifiers without instruments should transform the parent's output
    if (childType.category === 'modifier' && !childTrack.instrumentId) {
      modifierChildren.push(childTrack);
    } else {
      regularChildren.push(childTrack);
    }
  }

  // Apply modifier children to this track's output (in order)
  for (const modifierTrack of modifierChildren) {
    const modifierType = getTrackType(modifierTrack.typeId);
    const modifierSelf = resolveBlocks(modifierTrack.blocks, project, enrichedContext);
    const modifierContext = buildContext(enrichedContext, combinedOutput, modifierSelf);

    combinedOutput = modifierType.combine(combinedOutput, modifierSelf, modifierContext);

    // Recursively apply any nested modifiers from this modifier's children
    const nestedResults = resolveTrack(modifierTrack, project, modifierContext, combinedOutput);
    // Only take the output transformation, not push results (modifier has no instrument)
    // But if modifier has children with instruments, those should still produce output
    for (const nested of nestedResults) {
      if (nested.instrumentId) {
        results.push(nested);
      }
    }
  }

  // Now push this track's output (after all modifiers applied)
  if (track.instrumentId && combinedOutput.events.length > 0) {
    results.push({
      trackId: track.id,
      instrumentId: track.instrumentId,
      output: combinedOutput,
    });
  }

  // Process regular children with this track's (now modified) output as parent
  for (const childTrack of regularChildren) {
    const childResults = resolveTrack(childTrack, project, enrichedContext, combinedOutput);
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
        (max, e) => Math.max(max, e.time + (e.duration || 0)),
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
          const eventTime = blockStartBeat + currentOffset + event.time;
          if (eventTime < blockStartBeat + blockDurationBeats && eventTime < totalBeats) {
            allEvents.push({
              ...event,
              time: eventTime,
            });
          }
        }
        currentOffset += loopLength;
      }
    } else {
      // No looping - just offset events
      for (const event of blockEvents) {
        const eventTime = blockStartBeat + event.time;
        if (eventTime < blockStartBeat + blockDurationBeats && eventTime < totalBeats) {
          allEvents.push({
            ...event,
            time: eventTime,
          });
        }
      }
    }
  }

  // Sort by time
  allEvents.sort((a, b) => a.time - b.time);

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
      return events.map(e => ({ time: e.time, velocity: 100 }));
    case 'pitch':
      return events.map(e => ({ time: e.time, pitch: e.pitch }));
    case 'velocity':
      return events.map(e => ({ time: e.time, velocity: e.velocity }));
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
      events: rt.output.events.filter(e => e.time >= startBeat && e.time < endBeat),
    }));
}
