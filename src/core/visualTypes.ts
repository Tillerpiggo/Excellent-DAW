// Visual Instrument Types

import { VisualInstrumentId, Event } from './types';

export interface VisualInstrumentDefinition {
  id: VisualInstrumentId;
  name: string;
  description: string;
  icon: string;
  defaultParams: Record<string, unknown>;
}

export interface VisualInstrumentState {
  instrumentId: VisualInstrumentId;
  activeNotes: Map<number, Event>;
  currentRotation: number;
  bloom: number;
  colorShift: number;
  params: Record<string, unknown>; // Merged: instrument defaults + track overrides
}

export interface VisualEvent {
  trackId: string;
  instrumentId: VisualInstrumentId;
  startTimeInBeats: number;
  pitch: number;
  velocity: number;
  duration: number;
  type: 'noteOn' | 'noteOff';
}

export interface VisualTrackState {
  trackId: string;
  instrumentId: VisualInstrumentId;
  state: VisualInstrumentState;
}
