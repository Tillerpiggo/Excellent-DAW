import { MidiRow } from './MidiEditor';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Generate MidiRow[] for a given pitch range.
 * Higher pitches at the top (descending order).
 * Falls back to C1–C7 (24–96) if no range provided.
 */
export function generateRows(
  noteRange?: { min: number; max: number },
): MidiRow[] {
  const min = noteRange?.min ?? 24;
  const max = noteRange?.max ?? 96;
  const rows: MidiRow[] = [];

  for (let pitch = max; pitch >= min; pitch--) {
    const octave = Math.floor(pitch / 12) - 1;
    const noteIndex = pitch % 12;
    const hue = (noteIndex / 12) * 360;
    rows.push({
      pitch,
      label: `${NOTE_NAMES[noteIndex]}${octave}`,
      color: `hsl(${hue}, 70%, 55%)`,
    });
  }

  return rows;
}
