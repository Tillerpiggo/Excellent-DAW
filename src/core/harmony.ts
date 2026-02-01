import { Event, HarmonyInfo, ScaleInfo, Output, Block } from './types';

// Chord quality type for the chord editor
export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented' | 'sus2' | 'sus4' | 'major7' | 'minor7' | 'dominant7';

// Data structure for a chord in the chord editor
export interface ChordData {
  id: string;
  root: number; // 0-11 (C=0, C#=1, etc.)
  quality: ChordQuality;
  startBeat: number;
  durationBeats: number;
  octave: number; // Base octave for the chord
}

// Common scales
export const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

// Chord quality patterns (intervals from root)
const CHORD_PATTERNS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dominant7: [0, 4, 7, 10],
};

export function findClosestScaleIndex(pitch: number, scale: ScaleInfo): number {
  const pitchClass = pitch % 12;
  const scaleNotes = scale.intervals.map(i => (scale.root + i) % 12);

  let closestIndex = 0;
  let minDistance = 12;

  for (let i = 0; i < scaleNotes.length; i++) {
    const distance = Math.min(
      Math.abs(pitchClass - scaleNotes[i]),
      12 - Math.abs(pitchClass - scaleNotes[i])
    );
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = i;
    }
  }

  return closestIndex;
}

export function getScalePitch(scaleIndex: number, scale: ScaleInfo, octave: number): number {
  const normalizedIndex = ((scaleIndex % scale.intervals.length) + scale.intervals.length) % scale.intervals.length;
  const octaveOffset = Math.floor(scaleIndex / scale.intervals.length);
  return (octave + octaveOffset) * 12 + scale.root + scale.intervals[normalizedIndex];
}

export function findHarmonyInOutput(output: Output, atTime?: number): HarmonyInfo | undefined {
  if (output.harmony) return output.harmony;

  // Try to detect chord from events
  const events = atTime !== undefined
    ? output.events.filter(e => Math.abs(e.time - atTime) < 0.1)
    : output.events.slice(0, 10); // Look at first few events

  const pitches = events
    .filter(e => e.pitch !== undefined)
    .map(e => e.pitch as number);

  if (pitches.length < 2) return undefined;

  return detectChord(pitches);
}

export function detectChord(pitches: number[]): HarmonyInfo | undefined {
  if (pitches.length < 2) return undefined;

  // Get unique pitch classes
  const pitchClasses = [...new Set(pitches.map(p => p % 12))].sort((a, b) => a - b);

  if (pitchClasses.length < 2) return undefined;

  // Try each pitch as potential root
  for (const root of pitchClasses) {
    const intervals = pitchClasses.map(p => (p - root + 12) % 12).sort((a, b) => a - b);

    // Check against known patterns
    for (const [quality, pattern] of Object.entries(CHORD_PATTERNS)) {
      if (matchesPattern(intervals, pattern)) {
        return {
          chord: pitches.sort((a, b) => a - b),
          root,
          quality: quality as HarmonyInfo['quality'],
        };
      }
    }
  }

  // Unknown chord
  return {
    chord: pitches.sort((a, b) => a - b),
    root: pitches[0] % 12,
    quality: 'unknown',
  };
}

function matchesPattern(intervals: number[], pattern: number[]): boolean {
  if (intervals.length < pattern.length) return false;
  return pattern.every(p => intervals.includes(p));
}

export function deriveScaleFromHarmony(harmony: HarmonyInfo): ScaleInfo {
  // Simple mapping: major chord -> major scale, minor chord -> minor scale
  let scaleName: string;
  let intervals: number[];

  switch (harmony.quality) {
    case 'major':
      scaleName = 'Major';
      intervals = SCALES.major;
      break;
    case 'minor':
      scaleName = 'Minor';
      intervals = SCALES.minor;
      break;
    case 'diminished':
      scaleName = 'Minor';
      intervals = SCALES.minor;
      break;
    case 'sus':
      scaleName = 'Mixolydian';
      intervals = SCALES.mixolydian;
      break;
    default:
      scaleName = 'Major';
      intervals = SCALES.major;
  }

  return {
    root: harmony.root,
    intervals,
    name: scaleName,
  };
}

export function transposeEvent(event: Event, semitones: number): Event {
  if (event.pitch === undefined) return event;
  return {
    ...event,
    pitch: event.pitch + semitones,
  };
}

export function transposeToKey(events: Event[], fromRoot: number, toRoot: number): Event[] {
  const semitones = toRoot - fromRoot;
  return events.map(e => transposeEvent(e, semitones));
}

export function getNoteNames(): string[] {
  return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
}

export function midiToNoteName(midi: number): string {
  const noteNames = getNoteNames();
  const octave = Math.floor(midi / 12) - 1;
  const noteName = noteNames[midi % 12];
  return `${noteName}${octave}`;
}

export function noteNameToMidi(name: string): number {
  const noteNames = getNoteNames();
  const match = name.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return 60; // Default to middle C

  const [, noteName, octaveStr] = match;
  const noteIndex = noteNames.indexOf(noteName);
  const octave = parseInt(octaveStr, 10);

  return (octave + 1) * 12 + noteIndex;
}

// Get display name for a chord quality
export function getQualityDisplayName(quality: ChordQuality): string {
  const names: Record<ChordQuality, string> = {
    major: 'Major',
    minor: 'Minor',
    diminished: 'Dim',
    augmented: 'Aug',
    sus2: 'Sus2',
    sus4: 'Sus4',
    major7: 'Maj7',
    minor7: 'm7',
    dominant7: '7',
  };
  return names[quality];
}

// Format a chord name for display (e.g., "C Major", "F# Minor")
export function formatChordName(root: number, quality: ChordQuality): string {
  const noteNames = getNoteNames();
  const noteName = noteNames[root % 12];
  const qualityName = getQualityDisplayName(quality);
  return `${noteName} ${qualityName}`;
}

// Generate MIDI pitches for a chord given root, quality, and octave
export function generateChordPitches(root: number, quality: ChordQuality, octave: number): number[] {
  const pattern = CHORD_PATTERNS[quality];
  if (!pattern) return [root + octave * 12];

  const basePitch = root + octave * 12;
  return pattern.map(interval => basePitch + interval);
}

// Extract chords from a block by grouping simultaneous notes
export function extractChordsFromBlock(block: Block, beatsPerBar: number): ChordData[] {
  const allEvents = block.streams?.flatMap(s => s.events) || [];
  const pitchedEvents = allEvents.filter(e => e.pitch !== undefined);

  if (pitchedEvents.length === 0) return [];

  // Group events by start time (with small tolerance for timing variations)
  const timeGroups = new Map<number, Event[]>();
  const tolerance = 0.05; // beats

  for (const event of pitchedEvents) {
    let foundGroup = false;
    for (const [time] of timeGroups) {
      if (Math.abs(event.time - time) < tolerance) {
        timeGroups.get(time)!.push(event);
        foundGroup = true;
        break;
      }
    }
    if (!foundGroup) {
      timeGroups.set(event.time, [event]);
    }
  }

  // Sort by time
  const sortedTimes = [...timeGroups.keys()].sort((a, b) => a - b);

  const chords: ChordData[] = [];
  let chordIndex = 0;

  for (let i = 0; i < sortedTimes.length; i++) {
    const startBeat = sortedTimes[i];
    const events = timeGroups.get(startBeat)!;
    const pitches = events.map(e => e.pitch!);

    // Calculate duration (until next chord or use event duration)
    const nextTime = sortedTimes[i + 1];
    const eventDuration = Math.max(...events.map(e => e.duration || 1));
    const durationBeats = nextTime !== undefined
      ? Math.min(nextTime - startBeat, eventDuration)
      : eventDuration;

    // Detect the chord
    const harmony = detectChord(pitches);

    // Find the base octave from the lowest pitch
    const lowestPitch = Math.min(...pitches);
    const octave = Math.floor(lowestPitch / 12);

    chords.push({
      id: `chord-${chordIndex++}`,
      root: harmony?.root ?? (lowestPitch % 12),
      quality: mapQuality(harmony?.quality),
      startBeat,
      durationBeats,
      octave,
    });
  }

  return chords;
}

// Map HarmonyInfo quality to ChordQuality
function mapQuality(quality: HarmonyInfo['quality'] | undefined): ChordQuality {
  if (!quality || quality === 'unknown') return 'major';
  if (quality === 'sus') return 'sus4';
  return quality as ChordQuality;
}

// Generate events from chord data array
export function chordsToEvents(chords: ChordData[]): Event[] {
  const events: Event[] = [];

  for (const chord of chords) {
    const pitches = generateChordPitches(chord.root, chord.quality, chord.octave);

    for (const pitch of pitches) {
      events.push({
        time: chord.startBeat,
        pitch,
        velocity: 80,
        duration: chord.durationBeats,
      });
    }
  }

  return events;
}
