// Visual Instrument Types

import { Event } from './types';

export interface VisualInstrumentState {
  instrumentId: string;
  activeNotes: Map<number, Event>;
  currentRotation: number;
  bloom: number;
  colorShift: number;
  params: Record<string, unknown>; // Merged: instrument defaults + track overrides
  noteOnCount: number; // Increments for EVERY note-on trigger (never throttled)
  pitchNoteOnCounts: Map<number, number>; // Per-pitch note-on counts
  blackedOut: boolean; // True when instrument is completely disabled by a mute region
}

export interface VisualEvent {
  trackId: string;
  instrumentId: string;
  startTimeInBeats: number;
  pitch: number;
  velocity: number;
  duration: number;
  type: 'noteOn' | 'noteOff';
}

export interface VisualTrackState {
  trackId: string;
  instrumentId: string;
  state: VisualInstrumentState;
}
