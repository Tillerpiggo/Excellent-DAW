import { Instrument } from '../types';

export const RadialMask: Instrument = {
  id: 'radialMask',
  name: 'Radial Mask',
  description: 'Circular mask with automatable inner and outer radius',
  icon: '✳️',
  color: '#c084fc',
  hasAudio: false,
  hasVisual: false,
  editorType: 'generic',
  defaultSettings: {
    innerRadius: 0,
    outerRadius: 0.5,
    feather: 0.02,
  },
  settingsSchema: {
    innerRadius: {
      type: 'number',
      label: 'Inner Radius',
      min: 0,
      max: 1.5,
      step: 0.01,
      default: 0,
    },
    outerRadius: {
      type: 'number',
      label: 'Outer Radius',
      min: 0,
      max: 1.5,
      step: 0.01,
      default: 0.5,
    },
    feather: {
      type: 'number',
      label: 'Feather',
      min: 0,
      max: 0.5,
      step: 0.01,
      default: 0.02,
    },
  },
};
