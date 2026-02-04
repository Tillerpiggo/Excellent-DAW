import { Event, HarmonyInfo, ScaleInfo, Output, Block } from './types';

// Chord quality type for the chord editor
export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented' | 'sus2' | 'sus4' | 'major7' | 'minor7' | 'dominant7';

// Voicing types for chord arrangement
export type ChordVoicing = 'close' | 'open' | 'drop2' | 'spread';

// Inversion type: which chord tone is in the bass
export type ChordInversion = 0 | 1 | 2 | 3; // 0=root, 1=first, 2=second, 3=third (for 7ths)

// Data structure for a chord in the chord editor
export interface ChordData {
  id: string;
  root: number; // 0-11 (C=0, C#=1, etc.)
  quality: ChordQuality;
  startBeat: number;
  durationBeats: number;
  octave: number; // Base octave for the chord
  voicing?: ChordVoicing; // How to arrange the chord notes
  inversion?: ChordInversion; // Which note is in the bass (0=root position)
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

// Circle of fifths: C -> G -> D -> A -> E -> B -> F#/Gb -> Db -> Ab -> Eb -> Bb -> F -> C
export const CIRCLE_OF_FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

// Chord quality patterns (intervals from root)
// Order matters! Longer patterns must come first so major7 isn't detected as major
const CHORD_PATTERNS: Record<ChordQuality, number[]> = {
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dominant7: [0, 4, 7, 10],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
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
    ? output.events.filter(e => Math.abs(e.startTimeInBeats - atTime) < 0.1)
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

  // Find best match - prefer exact matches and longer patterns
  let bestMatch: { root: number; quality: ChordQuality; score: number } | null = null;

  // Try each pitch as potential root
  for (const root of pitchClasses) {
    const intervals = pitchClasses.map(p => (p - root + 12) % 12).sort((a, b) => a - b);

    // Check against known patterns (ordered longest first in CHORD_PATTERNS)
    for (const [quality, pattern] of Object.entries(CHORD_PATTERNS)) {
      const match = matchesPattern(intervals, pattern);
      if (match.matches) {
        // Score: exact match (pattern length * 2) + pattern length for longer patterns
        const score = match.exact ? pattern.length * 3 : pattern.length;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { root, quality: quality as ChordQuality, score };
        }
        // If we found an exact match, this is probably right
        if (match.exact) break;
      }
    }
  }

  if (bestMatch) {
    return {
      chord: pitches.sort((a, b) => a - b),
      root: bestMatch.root,
      quality: mapQualityToHarmony(bestMatch.quality),
    };
  }

  // Unknown chord
  return {
    chord: pitches.sort((a, b) => a - b),
    root: pitches[0] % 12,
    quality: 'unknown',
  };
}

function matchesPattern(intervals: number[], pattern: number[]): { matches: boolean; exact: boolean } {
  if (intervals.length < pattern.length) return { matches: false, exact: false };
  const matches = pattern.every(p => intervals.includes(p));
  const exact = matches && intervals.length === pattern.length;
  return { matches, exact };
}

// Map ChordQuality to HarmonyInfo quality (which has fewer options)
function mapQualityToHarmony(quality: ChordQuality): HarmonyInfo['quality'] {
  switch (quality) {
    case 'major':
    case 'major7':
      return 'major';
    case 'minor':
    case 'minor7':
      return 'minor';
    case 'diminished':
      return 'diminished';
    case 'augmented':
      return 'augmented';
    case 'sus2':
    case 'sus4':
      return 'sus';
    case 'dominant7':
      return 'major'; // Dominant is major with a flat 7
    default:
      return 'unknown';
  }
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

// Generate MIDI pitches for a chord given root, quality, octave, voicing, and inversion
export function generateChordPitches(
  root: number,
  quality: ChordQuality,
  octave: number,
  voicing: ChordVoicing = 'close',
  inversion: ChordInversion = 0
): number[] {
  const pattern = CHORD_PATTERNS[quality];
  if (!pattern) return [root + octave * 12];

  const basePitch = root + octave * 12;
  let pitches = pattern.map(interval => basePitch + interval);

  // Apply inversion - rotate chord tones and adjust octaves
  if (inversion > 0 && inversion < pitches.length) {
    // Rotate the array by inversion amount
    const rotated = [...pitches.slice(inversion), ...pitches.slice(0, inversion)];
    // Move the lower notes up an octave to maintain ascending order
    pitches = rotated.map((p, i) => {
      if (i < pitches.length - inversion) {
        return p;
      }
      return p + 12;
    });
    // Sort to get proper bass note
    pitches.sort((a, b) => a - b);
  }

  // Apply voicing on top of inversion
  switch (voicing) {
    case 'close':
      // Default close voicing - notes stay as they are
      return pitches;

    case 'open':
      // Open voicing - raise middle note(s) up an octave
      if (pitches.length >= 3) {
        const result = [...pitches];
        // Raise the 2nd note up an octave
        result[1] = result[1] + 12;
        return result.sort((a, b) => a - b);
      }
      return pitches;

    case 'drop2':
      // Drop 2 voicing - drop the 2nd note from top down an octave
      if (pitches.length >= 3) {
        const sorted = [...pitches].sort((a, b) => a - b);
        const secondFromTop = sorted[sorted.length - 2];
        return sorted.map(p => p === secondFromTop ? p - 12 : p).sort((a, b) => a - b);
      }
      return pitches;

    case 'spread':
      // Spread voicing - distribute notes across 2 octaves
      if (pitches.length >= 3) {
        const result = pitches.map((p, i) => {
          if (i === 0) return p;
          if (i === 1) return p + 12;
          return p + (i % 2 === 0 ? 0 : 12);
        });
        return result.sort((a, b) => a - b);
      }
      return pitches;

    default:
      return pitches;
  }
}

// Get the number of notes in a chord quality
export function getChordNoteCount(quality: ChordQuality): number {
  return CHORD_PATTERNS[quality]?.length ?? 3;
}

// Get inversion name for display
export function getInversionName(inversion: ChordInversion, quality: ChordQuality): string {
  const noteCount = getChordNoteCount(quality);
  if (inversion === 0) return 'Root';
  if (inversion === 1) return '1st';
  if (inversion === 2 && noteCount >= 3) return '2nd';
  if (inversion === 3 && noteCount >= 4) return '3rd';
  return 'Root';
}

// Detect chord quality directly (returns ChordQuality, not HarmonyInfo)
export function detectChordQuality(pitches: number[]): { root: number; quality: ChordQuality; inversion: ChordInversion } | null {
  if (pitches.length < 2) return null;

  // Get unique pitch classes
  const pitchClasses = [...new Set(pitches.map(p => p % 12))].sort((a, b) => a - b);

  if (pitchClasses.length < 2) return null;

  // Find best match
  let bestMatch: { root: number; quality: ChordQuality; score: number } | null = null;

  for (const root of pitchClasses) {
    const intervals = pitchClasses.map(p => (p - root + 12) % 12).sort((a, b) => a - b);

    for (const [quality, pattern] of Object.entries(CHORD_PATTERNS)) {
      const match = matchesPattern(intervals, pattern);
      if (match.matches) {
        const score = match.exact ? pattern.length * 3 : pattern.length;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { root, quality: quality as ChordQuality, score };
        }
        if (match.exact) break;
      }
    }
  }

  if (!bestMatch) return null;

  // Detect inversion based on bass note
  const sortedPitches = [...pitches].sort((a, b) => a - b);
  const bassNote = sortedPitches[0] % 12;
  const pattern = CHORD_PATTERNS[bestMatch.quality];

  let inversion: ChordInversion = 0;
  if (bassNote !== bestMatch.root) {
    // Find which chord tone is in the bass
    for (let i = 1; i < pattern.length; i++) {
      const chordTone = (bestMatch.root + pattern[i]) % 12;
      if (chordTone === bassNote) {
        inversion = i as ChordInversion;
        break;
      }
    }
  }

  return { root: bestMatch.root, quality: bestMatch.quality, inversion };
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
      if (Math.abs(event.startTimeInBeats - time) < tolerance) {
        timeGroups.get(time)!.push(event);
        foundGroup = true;
        break;
      }
    }
    if (!foundGroup) {
      timeGroups.set(event.startTimeInBeats, [event]);
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

    // Detect the chord with full quality
    const detected = detectChordQuality(pitches);

    // Find the base octave from the lowest pitch
    const lowestPitch = Math.min(...pitches);
    const octave = Math.floor(lowestPitch / 12);

    chords.push({
      id: `chord-${chordIndex++}`,
      root: detected?.root ?? (lowestPitch % 12),
      quality: detected?.quality ?? 'major',
      startBeat,
      durationBeats,
      octave,
      inversion: detected?.inversion ?? 0,
    });
  }

  return chords;
}

// Generate events from chord data array
export function chordsToEvents(chords: ChordData[]): Event[] {
  const events: Event[] = [];

  for (const chord of chords) {
    const pitches = generateChordPitches(
      chord.root,
      chord.quality,
      chord.octave,
      chord.voicing ?? 'close',
      chord.inversion ?? 0
    );

    for (const pitch of pitches) {
      events.push({
        startTimeInBeats: chord.startBeat,
        pitch,
        velocity: 80,
        duration: chord.durationBeats,
      });
    }
  }

  return events;
}
