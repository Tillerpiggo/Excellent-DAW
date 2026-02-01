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
    category: 'modifier',
    combine: (parent, self) => ({
      events: mergeEvents(parent.events, self.events),
      harmony: self.harmony || parent.harmony,
    }),
  },

  override: {
    id: 'override',
    name: 'Override',
    description: 'Replaces parent events within the time range of this track',
    category: 'modifier',
    combine: (parent, self, ctx) => {
      if (self.events.length === 0) return parent;
      if (parent.events.length === 0) return self;

      // Find the time range covered by self's events
      const minTime = Math.min(...self.events.map(e => e.time));
      const maxTime = Math.max(...self.events.map(e => e.time + (e.duration || 0)));

      // Round to bar boundaries
      const beatsPerBar = ctx?.beatsPerBar || 4;
      const rangeStart = Math.floor(minTime / beatsPerBar) * beatsPerBar;
      const rangeEnd = Math.ceil(maxTime / beatsPerBar) * beatsPerBar;

      // Keep parent events outside the override range
      const keptParentEvents = parent.events.filter(
        e => e.time < rangeStart || e.time >= rangeEnd
      );

      // Combine: parent events outside range + self events
      const combined = [...keptParentEvents, ...self.events];
      combined.sort((a, b) => a.time - b.time);

      return {
        events: combined,
        harmony: self.harmony || parent.harmony,
      };
    },
  },

  mute: {
    id: 'mute',
    name: 'Mute',
    description: 'Silences parent events in bars where this track has events',
    category: 'modifier',
    combine: (parent, self, ctx) => {
      if (self.events.length === 0) return parent;
      if (parent.events.length === 0) return parent;

      const beatsPerBar = ctx?.beatsPerBar || 4;

      // Find which bars have mute events
      const mutedBars = new Set<number>();
      for (const event of self.events) {
        const bar = Math.floor(event.time / beatsPerBar);
        mutedBars.add(bar);
      }

      // Keep only parent events in non-muted bars
      const keptEvents = parent.events.filter(e => {
        const bar = Math.floor(e.time / beatsPerBar);
        return !mutedBars.has(bar);
      });

      return {
        events: keptEvents,
        harmony: parent.harmony,
      };
    },
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

  // Rhythm - triggers parent notes at child's event times
  rhythm: {
    id: 'rhythm',
    name: 'Rhythm',
    description: 'Triggers parent notes at child event times',
    category: 'modifier',
    combine: (parent, self) => {
      if (self.events.length === 0) return { events: [], harmony: parent.harmony };

      const parentPitched = parent.events.filter(e => e.pitch !== undefined);
      if (parentPitched.length === 0) return { events: [], harmony: parent.harmony };

      // Find chord/notes active at a given time
      const getNotesAtTime = (time: number): Event[] => {
        const active = parentPitched.filter(e => {
          const end = e.time + (e.duration || 0.5);
          return e.time <= time && time < end;
        });
        if (active.length > 0) return active;

        // Fallback: most recent notes before this time
        const before = parentPitched.filter(e => e.time <= time);
        if (before.length === 0) {
          const firstTime = Math.min(...parentPitched.map(e => e.time));
          return parentPitched.filter(e => Math.abs(e.time - firstTime) < 0.1);
        }
        const lastTime = Math.max(...before.map(e => e.time));
        return before.filter(e => Math.abs(e.time - lastTime) < 0.1);
      };

      const triggered: Event[] = [];
      for (const rhythmEvent of self.events) {
        for (const note of getNotesAtTime(rhythmEvent.time)) {
          triggered.push({
            time: rhythmEvent.time,
            pitch: note.pitch,
            velocity: rhythmEvent.velocity ?? note.velocity,
            duration: rhythmEvent.duration ?? 0.25,
          });
        }
      }
      return { events: triggered.sort((a, b) => a.time - b.time), harmony: parent.harmony };
    },
  },

  // Mappers - use harmony context
  harmonyMap: {
    id: 'harmonyMap',
    name: 'Harmony Map',
    description: 'Maps this track\'s pitches to follow parent harmony over time',
    category: 'modifier',
    combine: (parent, self, ctx) => {
      // If no self events, pass through parent unchanged
      if (self.events.length === 0) return parent;

      // Get harmony from the context's parent output (flows down the signal chain)
      const harmonySource = ctx.parentOutput;
      if (!harmonySource) {
        // No upstream harmony - just return self events as-is
        return self;
      }

      const parentPitched = harmonySource.events.filter(e => e.pitch !== undefined);
      if (parentPitched.length === 0) {
        // No pitched events in harmony source - return self as-is
        return self;
      }

      // Helper: extract chord tones from notes, keeping root (lowest) first
      const extractChordTones = (notes: typeof parentPitched): number[] => {
        if (notes.length === 0) return [];
        // Sort by actual pitch to find the bass note (likely the root)
        const sorted = [...notes].sort((a, b) => a.pitch! - b.pitch!);
        const bassNote = sorted[0].pitch! % 12;
        // Get unique pitch classes
        const pitchClasses = [...new Set(notes.map(e => e.pitch! % 12))];
        // Reorder so bass note is first, then others in ascending order
        const others = pitchClasses.filter(p => p !== bassNote).sort((a, b) => a - b);
        return [bassNote, ...others];
      };

      // Helper: find chord tones active at a given time
      const getChordAtTime = (time: number): number[] => {
        // Find parent notes that overlap with this time
        // A note is active if: noteTime <= time < noteTime + noteDuration
        const activeNotes = parentPitched.filter(e => {
          const noteEnd = e.time + (e.duration || 0.5);
          return e.time <= time && time < noteEnd;
        });

        if (activeNotes.length > 0) {
          return extractChordTones(activeNotes);
        }

        // Fallback: find the most recent chord before this time
        const beforeNotes = parentPitched.filter(e => e.time <= time);
        if (beforeNotes.length === 0) {
          // Use first chord if nothing before
          const firstTime = Math.min(...parentPitched.map(e => e.time));
          const firstChordNotes = parentPitched.filter(e => Math.abs(e.time - firstTime) < 0.1);
          return extractChordTones(firstChordNotes);
        }

        // Get the most recent time with notes
        const lastTime = Math.max(...beforeNotes.map(e => e.time));
        const lastChordNotes = beforeNotes.filter(e => Math.abs(e.time - lastTime) < 0.1);
        return extractChordTones(lastChordNotes);
      };

      // Determine the reference chord from the first arp note's pitch context
      // This lets us figure out what chord degree each arp note represents
      const firstPitch = self.events.find(e => e.pitch !== undefined)?.pitch ?? 60;
      const referenceRoot = firstPitch % 12;

      // Map self's pitches to chord tones at each note's time
      const mappedEvents = self.events.map(selfEvent => {
        if (selfEvent.pitch === undefined) return selfEvent;

        const chordTones = getChordAtTime(selfEvent.time);
        if (chordTones.length === 0) return selfEvent;

        // Calculate which chord degree this note represents
        // by its semitone distance from the reference root
        const semitones = selfEvent.pitch - firstPitch;

        // Map semitones to chord tone index:
        // 0 semitones = root (index 0)
        // ~4 semitones = 3rd (index 1)
        // ~7 semitones = 5th (index 2)
        // We use the semitone offset to pick a chord tone, wrapping around
        const octaveOffset = Math.floor(semitones / 12);
        const intervalInOctave = ((semitones % 12) + 12) % 12;

        // Map the interval to the nearest chord tone index
        // Divide the octave proportionally by number of chord tones
        const chordIndex = Math.round((intervalInOctave / 12) * chordTones.length) % chordTones.length;
        const chordTone = chordTones[chordIndex];

        // Preserve the octave relationship from the original arp
        const baseOctave = Math.floor(firstPitch / 12);
        const targetOctave = baseOctave + octaveOffset;

        return {
          ...selfEvent,
          pitch: targetOctave * 12 + chordTone,
        };
      });

      return {
        events: mappedEvents,
        harmony: harmonySource.harmony,
      };
    },
  },
};

export function getTrackType(id: string): TrackTypeDefinition {
  return TRACK_TYPES[id] || TRACK_TYPES.base;
}
