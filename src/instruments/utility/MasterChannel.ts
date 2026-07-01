import { Instrument } from '../types';

export const MasterChannel: Instrument = {
  id: 'masterChannel',
  name: 'Master',
  description: 'Global post-processing applied after all scene compositing — glow, exposure, contrast, saturation, color temperature, vignette, and gamma',
  icon: '🎛️',
  color: '#94a3b8',
  hasAudio: false,
  hasVisual: false,
  editorType: null,
  singleton: true,
  isMaster: true,

  defaultSettings: {
    exposure: 1.0,
    glowIntensity: 1.5,
    glowThreshold: 0.2,
    glowSmoothing: 0.9,
    contrast: 1.0,
    saturation: 1.0,
    temperature: 0.0,
    vignetteAmount: 0.0,
    vignetteRadius: 0.5,
    vignetteSoftness: 0.5,
    gamma: 1.0,
  },

  settingsSchema: {
    exposure:         { type: 'number', label: 'Exposure',           min: 0.2, max: 3.0, step: 0.05, default: 1.0 },
    glowIntensity:    { type: 'number', label: 'Glow Intensity',     min: 0.0, max: 6.0, step: 0.05, default: 1.5 },
    glowThreshold:    { type: 'number', label: 'Glow Threshold',     min: 0.0, max: 1.0, step: 0.01, default: 0.2 },
    glowSmoothing:    { type: 'number', label: 'Glow Smoothing',     min: 0.0, max: 1.0, step: 0.01, default: 0.9 },
    contrast:         { type: 'number', label: 'Contrast',           min: 0.2, max: 3.0, step: 0.05, default: 1.0 },
    saturation:       { type: 'number', label: 'Saturation',         min: 0.0, max: 3.0, step: 0.05, default: 1.0 },
    temperature:      { type: 'number', label: 'Temperature',        min: -1.0, max: 1.0, step: 0.05, default: 0.0 },
    vignetteAmount:   { type: 'number', label: 'Vignette Amount',    min: 0.0, max: 3.0, step: 0.05, default: 0.0 },
    vignetteRadius:   { type: 'number', label: 'Vignette Radius',    min: 0.1, max: 2.0, step: 0.05, default: 0.5 },
    vignetteSoftness: { type: 'number', label: 'Vignette Softness',  min: 0.0, max: 2.0, step: 0.05, default: 0.5 },
    gamma:            { type: 'number', label: 'Gamma',              min: 0.2, max: 3.0, step: 0.05, default: 1.0 },
  },
};
