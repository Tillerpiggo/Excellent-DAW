// Visual Instrument Types

import { VisualInstrumentId } from './types';

export interface VisualInstrumentDefinition {
  id: VisualInstrumentId;
  name: string;
  description: string;
  icon: string;
  defaultParams: Record<string, unknown>;
}

export interface ActiveNote {
  pitch: number;
  velocity: number;
  startTime: number;
  duration: number;
}

export interface VisualInstrumentState {
  instrumentId: VisualInstrumentId;
  activeNotes: Map<number, ActiveNote>;
  currentRotation: number;
  bloom: number;
  colorShift: number;
  params: Record<string, unknown>; // Merged: instrument defaults + track overrides
}

export interface VisualEvent {
  trackId: string;
  instrumentId: VisualInstrumentId;
  time: number; // in beats
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
