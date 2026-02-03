// Visual Instruments Registry

import { VisualInstrumentId } from './types';
import { VisualInstrumentDefinition, VisualInstrumentState, ActiveNote } from './visualTypes';

export const VISUAL_INSTRUMENTS: Record<VisualInstrumentId, VisualInstrumentDefinition> = {
  polarFlower: {
    id: 'polarFlower',
    name: 'Polar Flower',
    description: '3D flower shape that rotates and blooms with MIDI events',
    icon: '🌸',
    defaultParams: {
      petals: 5,
      baseRotationSpeed: 0.5,
      bloomIntensity: 1.0,
      colorSaturation: 0.7,
    },
  },
  hexagonDots: {
    id: 'hexagonDots',
    name: 'Hexagon Dots',
    description: 'Glowing dots spawn from a distant hexagon and float towards the camera',
    icon: '✨',
    defaultParams: {
      dotSpeed: 4.0,
      hexagonDistance: 25,
      dotSize: 0.15,
    },
  },
};

export function createVisualInstrumentState(instrumentId: VisualInstrumentId): VisualInstrumentState {
  return {
    instrumentId,
    activeNotes: new Map<number, ActiveNote>(),
    currentRotation: 0,
    bloom: 0,
    colorShift: 0,
  };
}

export function getVisualInstrumentOptions(): { id: VisualInstrumentId; label: string }[] {
  return Object.entries(VISUAL_INSTRUMENTS).map(([id, def]) => ({
    id: id as VisualInstrumentId,
    label: `${def.icon} ${def.name}`,
  }));
}
