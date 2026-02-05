import { VisualPlugin } from '../types';

export const KaleidoscopePlugin: VisualPlugin = {
  id: 'kaleidoscope',
  name: 'Kaleidoscope',
  description: 'Mirror and rotate into a kaleidoscope pattern',
  category: 'shader',

  defaultSettings: {
    segments: 6,
    rotation: 0,
    zoom: 1,
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
      max: 6.28,
      step: 0.05,
      default: 0,
    },
    zoom: {
      type: 'number',
      label: 'Zoom',
      min: 0.1,
      max: 3,
      step: 0.1,
      default: 1,
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
    uniform float segments;
    uniform float rotation;
    uniform float zoom;
    varying vec2 vUv;

    #define PI 3.14159265359

    void main() {
      // Center UV coordinates
      vec2 uv = vUv - 0.5;

      // Convert to polar coordinates
      float angle = atan(uv.y, uv.x) + rotation;
      float radius = length(uv) * zoom;

      // Kaleidoscope effect - fold angle into segment
      float segmentAngle = PI * 2.0 / segments;
      angle = mod(angle, segmentAngle);

      // Mirror every other segment
      if (mod(floor((atan(uv.y, uv.x) + rotation) / segmentAngle), 2.0) >= 1.0) {
        angle = segmentAngle - angle;
      }

      // Convert back to cartesian
      vec2 newUv = vec2(cos(angle), sin(angle)) * radius + 0.5;

      // Sample texture with bounds check
      if (newUv.x < 0.0 || newUv.x > 1.0 || newUv.y < 0.0 || newUv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      } else {
        gl_FragColor = texture2D(tDiffuse, newUv);
      }
    }
  `,
};
