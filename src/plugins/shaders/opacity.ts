import { VisualPlugin } from '../types';

export const OpacityPlugin: VisualPlugin = {
  id: 'opacity',
  name: 'Opacity',
  description: 'Fade the entire visual output',
  category: 'shader',

  defaultSettings: {
    opacity: 1,
  },

  settingsSchema: {
    opacity: {
      type: 'number',
      label: 'Opacity',
      min: 0,
      max: 1,
      step: 0.01,
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
    uniform float opacity;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(color.rgb * opacity, color.a * opacity);
    }
  `,
};
