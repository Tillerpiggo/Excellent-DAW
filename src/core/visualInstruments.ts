// Visual Instruments Registry

import { VisualInstrumentId, Event } from './types';
import { VisualInstrumentDefinition, VisualInstrumentState } from './visualTypes';

export const VISUAL_INSTRUMENTS: Record<VisualInstrumentId, VisualInstrumentDefinition> = {
  silkSymmetry: {
    id: 'silkSymmetry',
    name: 'Silk Symmetry',
    description: 'Flowing silk-like patterns with radial symmetry - MIDI inverts spiral direction',
    icon: '🌀',
    defaultParams: {
      symmetryFolds: 8,
      lineCount: 12,
      glowIntensity: 0.7,
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
  fractalTunnel: {
    id: 'fractalTunnel',
    name: 'Fractal Tunnel',
    description: 'Hypnotic fractal flower tunnel with BPM-synced spiral flipping',
    icon: '🌸',
    defaultParams: {
      symmetry: 6,
      generations: 3,
      glowIntensity: 0.9,
      colorPulse: false,            // When true, midi hits spawn outward color inversion pulses
      pulseSpeed: 200,              // Pixels per second the pulse expands
      pulseBandWidth: 40,           // Width of the inverted color band
      pulseFadeDuration: 2.0,       // Seconds for pulse to fade out
    },
  },
  radialWave: {
    id: 'radialWave',
    name: 'Radial Wave',
    description: 'Glowing radially symmetric sine wave that rotates on MIDI events',
    icon: '🌊',
    defaultParams: {
      waveFrequency: 6,             // Number of wave peaks around the circle
      waveAmplitude: 0.3,           // How much the wave oscillates (0-1)
      waveSpeed: 1.5,               // Speed of wave animation
      glowIntensity: 0.8,           // Glow strength
      rotationAmount: 45,           // Degrees to rotate per MIDI event
      baseHue: 0.55,                // Starting hue (0-1)
    },
  },
};

export function createVisualInstrumentState(
  instrumentId: VisualInstrumentId,
  params?: Record<string, unknown>
): VisualInstrumentState {
  const defaultParams = VISUAL_INSTRUMENTS[instrumentId].defaultParams;
  return {
    instrumentId,
    activeNotes: new Map<number, Event>(),
    currentRotation: 0,
    bloom: 0,
    colorShift: 0,
    params: { ...defaultParams, ...params },
  };
}

export function getVisualInstrumentOptions(): { id: VisualInstrumentId; label: string }[] {
  return Object.entries(VISUAL_INSTRUMENTS).map(([id, def]) => ({
    id: id as VisualInstrumentId,
    label: `${def.icon} ${def.name}`,
  }));
}
