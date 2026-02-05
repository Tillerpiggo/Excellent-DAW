import * as THREE from 'three';
import { VisualPlugin } from '../types';

export const RotatePlugin: VisualPlugin = {
  id: 'rotate',
  name: 'Rotate',
  description: 'Continuously rotate the visual output',
  category: 'transform',

  defaultSettings: {
    speed: 0.5,
    axis: 'z',
  },

  settingsSchema: {
    speed: {
      type: 'number',
      label: 'Speed',
      min: -5,
      max: 5,
      step: 0.1,
      default: 0.5,
    },
    axis: {
      type: 'select',
      label: 'Axis',
      options: [
        { value: 'x', label: 'X' },
        { value: 'y', label: 'Y' },
        { value: 'z', label: 'Z' },
      ],
      default: 'z',
    },
  },

  applyTransform: (group: THREE.Group, settings: Record<string, unknown>, time: number) => {
    const speed = (settings.speed as number) ?? 0.5;
    const axis = (settings.axis as string) ?? 'z';
    const angle = time * speed;

    if (axis === 'x') {
      group.rotation.x = angle;
    } else if (axis === 'y') {
      group.rotation.y = angle;
    } else {
      group.rotation.z = angle;
    }
  },
};
