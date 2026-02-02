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

export interface Event {
  time: number; // in beats
  pitch?: number; // MIDI note number
  velocity?: number; // 0-127
  duration?: number; // in beats
  drum?: 'kick' | 'snare' | 'hihat' | 'clap';
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
  | 'rest';

export type InstrumentId = 'synth' | 'keys' | 'pad' | 'bass' | 'drums';

export interface Track {
  id: string;
  name: string;
  typeId: TrackTypeId;
  instrumentId?: InstrumentId;
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

export type PatternCategory = 'drums' | 'chords' | 'bass' | 'arp' | 'modifier' | 'rhythm' | 'mute' | 'rest';

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
