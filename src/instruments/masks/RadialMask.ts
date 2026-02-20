import { Instrument } from '../types';

export const RadialMask: Instrument = {
  id: 'radialMask',
  name: 'Radial Mask',
  description: 'Creates angular segment patterns radiating from center',
  icon: '✳️',
  color: '#c084fc',
  hasAudio: false,
  hasVisual: false,
  editorType: 'generic',
  defaultSettings: {
    segments: 6,
    rotation: 0,
    offset: 0.5,
  },
  settingsSchema: {
    segments: {
      type: 'number',
      label: 'Segments',
      min: 2,
      max: 24,
      step: 1,
      default: 6,
    },
    rotation: {
      type: 'number',
      label: 'Rotation',
      min: 0,
      max: 360,
      step: 1,
      default: 0,
    },
    offset: {
      type: 'number',
      label: 'Offset',
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.5,
    },
  },
};
