import { VisualPlugin } from '../types';

export const RadialSymmetryPlugin: VisualPlugin = {
  id: 'radialSymmetry',
  name: 'Radial Symmetry',
  description: 'Duplicate and rotate around center',
  category: 'shader',

  defaultSettings: {
    folds: 4,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
  },

  settingsSchema: {
    folds: {
      type: 'number',
      label: 'Folds',
      min: 2,
      max: 16,
      step: 1,
      default: 4,
    },
    rotation: {
      type: 'number',
      label: 'Rotation',
      min: 0,
      max: 6.28,
      step: 0.05,
      default: 0,
    },
    offsetX: {
      type: 'number',
      label: 'Offset X',
      min: -0.5,
      max: 0.5,
      step: 0.05,
      default: 0,
    },
    offsetY: {
      type: 'number',
      label: 'Offset Y',
      min: -0.5,
      max: 0.5,
      step: 0.05,
      default: 0,
    },
  },

  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float folds;
    uniform float rotation;
    uniform float offsetX;
    uniform float offsetY;
    varying vec2 vUv;

    #define PI 3.14159265359

    void main() {
      // Center UV with offset
      vec2 center = vec2(0.5 + offsetX, 0.5 + offsetY);
      vec2 uv = vUv - center;

      // Convert to polar
      float angle = atan(uv.y, uv.x) + rotation;
      float radius = length(uv);

      // Fold into one segment
      float segmentAngle = PI * 2.0 / folds;
      angle = mod(angle, segmentAngle);

      // Keep angle in first segment (no mirroring unlike kaleidoscope)
      vec2 newUv = vec2(cos(angle), sin(angle)) * radius + center;

      // Sample with accumulation for overlapping copies
      vec4 color = vec4(0.0);

      for (float i = 0.0; i < 16.0; i++) {
        if (i >= folds) break;

        float a = angle + segmentAngle * i;
        vec2 sampleUv = vec2(cos(a), sin(a)) * radius + center;

        if (sampleUv.x >= 0.0 && sampleUv.x <= 1.0 && sampleUv.y >= 0.0 && sampleUv.y <= 1.0) {
          vec4 sample = texture2D(tDiffuse, sampleUv);
          color = max(color, sample); // Use max blending for glow effect
        }
      }

      gl_FragColor = color;
    }
  `,
};
