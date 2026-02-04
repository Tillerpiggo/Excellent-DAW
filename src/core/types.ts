// Core Types for Pattern Composer

export const CURRENT_SCHEMA_VERSION = 1;

export interface PreviewTrackData {
  color: string;
  blocks: { startBar: number; endBar: number }[];
  level: number; // 0=root, 1+=nested
}

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  bpm: number;
  totalBars: number;
  trackCount: number;
  previewTracks?: PreviewTrackData[];
}

// MIDI drum pitch values (General MIDI standard)
export const DRUM_PITCHES = {
  kick: 36,
  snare: 38,
  clap: 39,
  hihat: 42,
} as const;

export type DrumType = keyof typeof DRUM_PITCHES;

export function getDrumType(pitch: number): DrumType | null {
  for (const [type, p] of Object.entries(DRUM_PITCHES)) {
    if (p === pitch) return type as DrumType;
  }
  return null;
}

export interface Event {
  startTimeInBeats: number;
  pitch: number; // MIDI note number (drums use 36/38/39/42)
  velocity: number; // 0-127
  duration: number; // in beats
}

export interface EventStream {
  events: Event[];
}

export interface Output {
  events: Event[];
  harmony?: HarmonyInfo;
}

export interface Block {
  id: string;
  startBar: number; // 0-indexed
  durationBars: number;
  loop: boolean;
  streams: EventStream[];
  // For reference blocks
  sourceBlockId?: string;
  sourceTrackId?: string;
  extractMode?: 'timing' | 'pitch' | 'velocity' | 'all';
  // For audio blocks
  audioData?: AudioData;
}

export type TrackTypeId =
  | 'base'
  | 'add'
  | 'override'
  | 'mute'
  | 'gate'
  | 'shift'
  | 'transpose'
  | 'scale'
  | 'scaleShift'
  | 'harmonyMap'
  | 'rhythm'
  | 'rest'
  | 'swing';

export type InstrumentId = 'synth' | 'keys' | 'pad' | 'bass' | 'drums' | 'audio';

// Audio data for audio track blocks
export interface AudioData {
  // Reference ID to audio stored in IndexedDB (allows large files)
  storageId: string;
  // Original filename
  fileName: string;
  // MIME type (audio/wav, audio/mp3, etc.)
  mimeType: string;
  // Duration in seconds (cached after decode)
  duration: number;
  // Sample rate
  sampleRate: number;
  // Pre-computed waveform peaks for visualization (downsampled)
  // Kept in project JSON for fast rendering without loading full audio
  waveformPeaks: number[];
}

export type VisualInstrumentId = 'silkSymmetry' | 'hexagonDots' | 'fractalTunnel';

export interface Track {
  id: string;
  name: string;
  typeId: TrackTypeId;
  instrumentId?: InstrumentId;
  visualInstrumentId?: VisualInstrumentId;
  visualParams?: Record<string, unknown>; // Overrides for visual instrument defaults
  muted: boolean;
  collapsed: boolean;
  blocks: Block[];
  childIds: string[];
  parentId?: string;
  patternCategory?: PatternCategory;
}

export interface Project {
  id: string;
  name: string;
  bpm: number;
  totalBars: number;
  beatsPerBar: number;
  rootTracks: string[]; // IDs of top-level tracks
  tracks: Record<string, Track>;
}

export type PatternCategory = 'drums' | 'chords' | 'bass' | 'arp' | 'modifier' | 'rhythm' | 'mute' | 'rest' | 'swing';

export type PresetType = 'loop' | 'pattern';

export interface PatternPreset {
  id: string;
  name: string;
  category: PatternCategory;
  description: string;
  defaultTrackType: TrackTypeId;
  defaultInstrument?: InstrumentId;
  events: Event[];
  durationBars: number;
  presetType: PresetType;
}

export interface TrackTypeDefinition {
  id: TrackTypeId;
  name: string;
  description: string;
  category: 'source' | 'combiner' | 'modifier' | 'mapper';
  combine: (parent: Output, self: Output, ctx: ProcessContext) => Output;
}

export interface InstrumentDefinition {
  id: InstrumentId;
  name: string;
  description: string;
  color: string;
}

export interface HarmonyInfo {
  chord: number[]; // MIDI note numbers
  root: number;
  quality: 'major' | 'minor' | 'diminished' | 'augmented' | 'sus' | 'unknown';
}

export interface ScaleInfo {
  root: number;
  intervals: number[]; // semitones from root
  name: string;
}

export interface ProcessContext {
  bpm: number;
  beatsPerBar: number;
  totalBars: number;
  currentBar: number;
  parentOutput?: Output;
  harmony?: HarmonyInfo;
  scale?: ScaleInfo;
}
