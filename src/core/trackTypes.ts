import { TrackTypeDefinition, Output, ProcessContext, Event } from './types';

// Helper to merge events, avoiding duplicates at same time
function mergeEvents(a: Event[], b: Event[]): Event[] {
  const result = [...a];
  for (const event of b) {
    const existing = result.find(
      e => e.time === event.time && e.pitch === event.pitch && e.drum === event.drum
    );
    if (!existing) {
      result.push(event);
    }
  }
  return result.sort((x, y) => x.time - y.time);
}

// Helper to find events at matching times
function findEventsAtTime(events: Event[], time: number, tolerance = 0.01): Event[] {
  return events.filter(e => Math.abs(e.time - time) < tolerance);
}

export const TRACK_TYPES: Record<string, TrackTypeDefinition> = {
  // Sources - generate events from scratch
  base: {
    id: 'base',
    name: 'Base',
    description: 'Starting point for a pattern - outputs its own events',
    category: 'source',
    combine: (_parent, self) => self,
  },

  // Combiners - merge with parent output
  add: {
    id: 'add',
    name: 'Add',
    description: 'Adds events to parent output (layering)',
    category: 'combiner',
    combine: (parent, self) => ({
      events: mergeEvents(parent.events, self.events),
      harmony: self.harmony || parent.harmony,
    }),
  },

  override: {
    id: 'override',
    name: 'Override',
    description: 'Replaces parent output entirely',
    category: 'combiner',
    combine: (_parent, self) => self,
  },

  // Modifiers - transform parent output
  gate: {
    id: 'gate',
    name: 'Gate',
    description: 'Only allows parent events through when this track has events',
    category: 'modifier',
    combine: (parent, self) => {
      const gatedEvents = parent.events.filter(parentEvent => {
        return self.events.some(
          gateEvent => Math.abs(gateEvent.time - parentEvent.time) < 0.01
        );
      });
      return {
        events: gatedEvents,
        harmony: parent.harmony,
      };
    },
  },

  shift: {
    id: 'shift',
    name: 'Shift',
    description: 'Shifts pitch of parent events based on this track\'s pitches',
    category: 'modifier',
    combine: (parent, self) => {
      if (self.events.length === 0) return parent;

      const shiftedEvents = parent.events.map(parentEvent => {
        const shifters = findEventsAtTime(self.events, parentEvent.time);
        if (shifters.length === 0) return parentEvent;

        // Use the first shifter's pitch as offset (relative to middle C = 60)
        const shiftAmount = (shifters[0].pitch ?? 60) - 60;
        return {
          ...parentEvent,
          pitch: parentEvent.pitch !== undefined
            ? parentEvent.pitch + shiftAmount
            : parentEvent.pitch,
        };
      });

      return {
        events: shiftedEvents,
        harmony: parent.harmony,
      };
    },
  },

  scale: {
    id: 'scale',
    name: 'Scale Velocity',
    description: 'Scales velocity of parent events based on this track\'s velocities',
    category: 'modifier',
    combine: (parent, self) => {
      if (self.events.length === 0) return parent;

      const scaledEvents = parent.events.map(parentEvent => {
        const scalers = findEventsAtTime(self.events, parentEvent.time);
        if (scalers.length === 0) return parentEvent;

        // Use scaler velocity as multiplier (100 = 100% = no change)
        const scaleFactor = (scalers[0].velocity ?? 100) / 100;
        return {
          ...parentEvent,
          velocity: Math.min(127, Math.round((parentEvent.velocity ?? 100) * scaleFactor)),
        };
      });

      return {
        events: scaledEvents,
        harmony: parent.harmony,
      };
    },
  },

  scaleShift: {
    id: 'scaleShift',
    name: 'Scale Shift',
    description: 'Shifts pitches to fit a musical scale',
    category: 'modifier',
    combine: (parent, self, ctx) => {
      if (!ctx.scale) return parent;

      const scale = ctx.scale;
      const scaleNotes = scale.intervals.map(i => (scale.root + i) % 12);

      const shiftedEvents = parent.events.map(parentEvent => {
        if (parentEvent.pitch === undefined) return parentEvent;

        const pitchClass = parentEvent.pitch % 12;
        if (scaleNotes.includes(pitchClass)) return parentEvent;

        // Find closest scale note
        let closestNote = scaleNotes[0];
        let minDistance = 12;
        for (const note of scaleNotes) {
          const distance = Math.min(
            Math.abs(pitchClass - note),
            12 - Math.abs(pitchClass - note)
          );
          if (distance < minDistance) {
            minDistance = distance;
            closestNote = note;
          }
        }

        const octave = Math.floor(parentEvent.pitch / 12);
        return {
          ...parentEvent,
          pitch: octave * 12 + closestNote,
        };
      });

      return {
        events: shiftedEvents,
        harmony: parent.harmony,
      };
    },
  },

  // Mappers - use harmony context
  harmonyMap: {
    id: 'harmonyMap',
    name: 'Harmony Map',
    description: 'Maps parent pitches to current chord tones',
    category: 'mapper',
    combine: (parent, _self, ctx) => {
      if (!ctx.harmony || ctx.harmony.chord.length === 0) return parent;

      const chord = ctx.harmony.chord;

      const mappedEvents = parent.events.map(parentEvent => {
        if (parentEvent.pitch === undefined) return parentEvent;

        // Map pitch to chord tone based on scale degree
        const octave = Math.floor(parentEvent.pitch / 12);
        const degree = parentEvent.pitch % 12;
        const chordIndex = Math.floor((degree / 12) * chord.length) % chord.length;
        const chordTone = chord[chordIndex] % 12;

        return {
          ...parentEvent,
          pitch: octave * 12 + chordTone,
        };
      });

      return {
        events: mappedEvents,
        harmony: ctx.harmony,
      };
    },
  },
};

export function getTrackType(id: string): TrackTypeDefinition {
  return TRACK_TYPES[id] || TRACK_TYPES.base;
}
