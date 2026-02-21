import { Instrument } from '../types';

export const SCENE_GATE_PITCH = 0;

export const SceneGate: Instrument = {
  id: 'sceneGate',
  name: 'Scene Gate',
  description: 'Gates scene visibility using MIDI notes — scene is only visible when a note is active. Also exposes automatable X/Y offset.',
  icon: '🚪',
  color: '#10b981',
  hasAudio: false,
  hasVisual: false,
  editorType: 'generic',
  noteRange: { min: 0, max: 127 },
  rangeLabels: [{ startPitch: SCENE_GATE_PITCH, endPitch: SCENE_GATE_PITCH, label: 'Gate' }],
  defaultSettings: {
    offsetX: 0,
    offsetY: 0,
  },
  settingsSchema: {
    offsetX: { type: 'number', label: 'Offset X', min: -1, max: 1, step: 0.01, default: 0 },
    offsetY: { type: 'number', label: 'Offset Y', min: -1, max: 1, step: 0.01, default: 0 },
  },
};
