import * as THREE from 'three';
import { VisualPlugin } from '../types';

export const PanPlugin: VisualPlugin = {
  id: 'pan',
  name: 'Pan',
  description: 'Move the visual left and right with a simple sine-wave pan',
  category: 'transform',

  defaultSettings: {
    amount: 1,
    rate: 1,
    phase: 0,
  },

  settingsSchema: {
    amount: {
      type: 'number',
      label: 'Amount',
      min: 0,
      max: 8,
      step: 0.05,
      default: 1,
    },
    rate: {
      type: 'number',
      label: 'Rate',
      min: 0,
      max: 12,
      step: 0.05,
      default: 1,
    },
    phase: {
      type: 'number',
      label: 'Phase',
      min: 0,
      max: 360,
      step: 5,
      default: 0,
    },
  },

  applyTransform: (group: THREE.Group, settings: Record<string, unknown>, time: number) => {
    const amount = (settings.amount as number) ?? 1;
    const rate = (settings.rate as number) ?? 1;
    const phase = (settings.phase as number) ?? 0;
    const phaseRadians = phase * Math.PI / 180;

    group.position.x += Math.sin(time * rate * Math.PI * 2 + phaseRadians) * amount;
  },
};
