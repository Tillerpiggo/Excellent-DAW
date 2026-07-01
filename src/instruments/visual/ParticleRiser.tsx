'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { Instrument } from '../types';

const PITCH_MIN = 24;
const PITCH_MAX = 96;
const MAX_PARTICLES = 9000;
const MAX_ACTIVE_RISERS = 4;
const MAX_POINTS = MAX_PARTICLES * MAX_ACTIVE_RISERS;
const TWO_PI = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

type ColorMode = 'mono' | 'palette' | 'pitch';

interface RiserParticle {
  angle: number;
  radiusNorm: number;
  heightOffset: number;
  birthOffset: number;
  phase: number;
  speedMul: number;
  sizeMul: number;
  weight: number;
  drift: number;
  seed: number;
}

interface RiserHit {
  id: number;
  time: number;
  pitch: number;
  velocity: number;
  duration: number;
}

const DEFAULTS = {
  particleCount: 5200,
  dotSize: 5.8,
  duration: 6.5,
  noteDurationScale: 0.35,
  attack: 0.35,
  release: 1.35,
  startY: -4.6,
  endY: 4.55,
  width: 2.6,
  depth: 0.85,
  riseSpeed: 0.22,
  acceleration: 1.65,
  frontWidth: 0.16,
  pressureBoost: 2.1,
  densityBuild: 0.85,
  centerPull: 0.28,
  turbulence: 0.045,
  spiralAmount: 0.9,
  spiralSpeed: 1.05,
  shimmer: 0.22,
  peakFlash: 0.55,
  colorMode: 'mono',
  whiteBackground: true,
};

const vertexShader = `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float perspective = 8.0 / max(1.25, -mvPosition.z);
    gl_PointSize = aSize * perspective;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = dot(p, p);
    if (r > 1.0) discard;
    float softEdge = 1.0 - smoothstep(0.52, 1.0, r);
    gl_FragColor = vec4(vColor, vAlpha * softEdge);
  }
`;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smooth01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function easeInExpoLite(value: number, acceleration: number): number {
  const t = clamp(value, 0, 1);
  return Math.pow(t, Math.max(0.25, acceleration));
}

function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453123;
  return x - Math.floor(x);
}

function num(params: Record<string, unknown>, key: keyof typeof DEFAULTS, fallback: number): number {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(params: Record<string, unknown>, key: keyof typeof DEFAULTS, fallback: boolean): boolean {
  const value = params[key];
  return typeof value === 'boolean' ? value : fallback;
}

function str<T extends string>(params: Record<string, unknown>, key: keyof typeof DEFAULTS, fallback: T): T {
  const value = params[key];
  return typeof value === 'string' ? (value as T) : fallback;
}

function activeNoteKey(pitch: number, startTimeInBeats: number): string {
  return `${pitch}:${startTimeInBeats}`;
}

function makeParticles(count: number): RiserParticle[] {
  const particles: RiserParticle[] = [];
  for (let i = 0; i < count; i++) {
    const seed = i * 23.731 + 4.7;
    const radiusNorm = Math.sqrt(rand(seed + 0.9));
    particles.push({
      angle: (i * GOLDEN_ANGLE + (rand(seed + 1.8) - 0.5) * 0.08) % TWO_PI,
      radiusNorm,
      heightOffset: rand(seed + 3.6),
      birthOffset: rand(seed + 4.5),
      phase: rand(seed + 5.4) * TWO_PI,
      speedMul: 0.72 + rand(seed + 6.3) * 0.62,
      sizeMul: 0.7 + rand(seed + 7.2) * 0.78,
      weight: 0.42 + rand(seed + 8.1) * 0.58,
      drift: (rand(seed + 9.9) - 0.5) * 2,
      seed,
    });
  }
  return particles;
}

function buildGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_POINTS), 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(MAX_POINTS), 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  return geometry;
}

function riserEnvelope(age: number, duration: number, attack: number, release: number): number {
  if (age < 0) return 0;
  const attackIn = smooth01(age / Math.max(0.001, attack));
  if (age <= duration) return attackIn;
  const releaseOut = 1 - smooth01((age - duration) / Math.max(0.001, release));
  return clamp(releaseOut, 0, 1);
}

function ParticleRiserVisual({ trackId }: { trackId: string }) {
  const engineRef = useRef(getVisualPlaybackEngine());
  const backgroundRef = useRef<THREE.Mesh>(null);
  const prevCountsRef = useRef<Map<number, number>>(new Map());
  const prevSeekGenRef = useRef(-1);
  const seenActiveNoteKeysRef = useRef<Set<string>>(new Set());
  const hitsRef = useRef<RiserHit[]>([]);
  const idRef = useRef(0);
  const colorRef = useRef(new THREE.Color());
  const palettePrimaryRef = useRef(new THREE.Color('#000000'));
  const paletteAccentRef = useRef(new THREE.Color('#111111'));
  const paletteHighlightRef = useRef(new THREE.Color('#333333'));

  const particles = useMemo(() => makeParticles(MAX_PARTICLES), []);
  const geometry = useMemo(buildGeometry, []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }), []);

  useEffect(() => () => {
    hitsRef.current = [];
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(({ clock }) => {
    const state = engineRef.current.getTrackState(trackId);
    if (!state) return;

    const now = clock.elapsedTime;
    const params = state.params;
    const particleCount = Math.floor(clamp(num(params, 'particleCount', DEFAULTS.particleCount), 400, MAX_PARTICLES));
    const dotSize = num(params, 'dotSize', DEFAULTS.dotSize);
    const duration = Math.max(0.1, num(params, 'duration', DEFAULTS.duration));
    const noteDurationScale = num(params, 'noteDurationScale', DEFAULTS.noteDurationScale);
    const attack = num(params, 'attack', DEFAULTS.attack);
    const release = Math.max(0.01, num(params, 'release', DEFAULTS.release));
    const startY = num(params, 'startY', DEFAULTS.startY);
    const endY = num(params, 'endY', DEFAULTS.endY);
    const width = num(params, 'width', DEFAULTS.width);
    const depth = num(params, 'depth', DEFAULTS.depth);
    const riseSpeed = num(params, 'riseSpeed', DEFAULTS.riseSpeed);
    const acceleration = num(params, 'acceleration', DEFAULTS.acceleration);
    const frontWidth = Math.max(0.01, num(params, 'frontWidth', DEFAULTS.frontWidth));
    const pressureBoost = num(params, 'pressureBoost', DEFAULTS.pressureBoost);
    const densityBuild = num(params, 'densityBuild', DEFAULTS.densityBuild);
    const centerPull = clamp(num(params, 'centerPull', DEFAULTS.centerPull), 0, 1);
    const turbulence = num(params, 'turbulence', DEFAULTS.turbulence);
    const spiralAmount = num(params, 'spiralAmount', DEFAULTS.spiralAmount);
    const spiralSpeed = num(params, 'spiralSpeed', DEFAULTS.spiralSpeed);
    const shimmer = num(params, 'shimmer', DEFAULTS.shimmer);
    const peakFlash = num(params, 'peakFlash', DEFAULTS.peakFlash);
    const colorMode = str<ColorMode>(params, 'colorMode', DEFAULTS.colorMode as ColorMode);

    if (backgroundRef.current) {
      backgroundRef.current.visible = bool(params, 'whiteBackground', DEFAULTS.whiteBackground);
    }

    if (state.seekGeneration !== prevSeekGenRef.current) {
      prevSeekGenRef.current = state.seekGeneration;
      prevCountsRef.current = new Map(state.pitchNoteOnCounts);
      seenActiveNoteKeysRef.current.clear();
      hitsRef.current = [];
    }

    const makeDuration = (eventDuration?: number) =>
      Math.max(0.25, duration + Math.max(0, eventDuration ?? 0) * noteDurationScale);

    const spawnHit = (pitch: number, velocity: number, hitDuration: number) => {
      hitsRef.current.push({
        id: idRef.current++,
        time: now,
        pitch,
        velocity,
        duration: hitDuration,
      });
    };

    const currentActiveNoteKeys = new Set<string>();
    for (const [pitch, event] of state.activeNotes) {
      if (pitch < PITCH_MIN || pitch > PITCH_MAX) continue;
      currentActiveNoteKeys.add(activeNoteKey(pitch, event.startTimeInBeats));
    }

    for (const [pitch, count] of state.pitchNoteOnCounts) {
      const prev = prevCountsRef.current.get(pitch) ?? 0;
      const newHits = count - prev;
      if (newHits <= 0 || pitch < PITCH_MIN || pitch > PITCH_MAX) continue;

      const event = state.activeNotes.get(pitch);
      const velocity = clamp((event?.velocity ?? 100) / 127, 0.05, 1);
      for (let i = 0; i < Math.min(newHits, 3); i++) {
        spawnHit(pitch, velocity, makeDuration(event?.duration));
      }
      if (event) {
        seenActiveNoteKeysRef.current.add(activeNoteKey(pitch, event.startTimeInBeats));
      }
    }
    prevCountsRef.current = new Map(state.pitchNoteOnCounts);

    for (const [pitch, event] of state.activeNotes) {
      if (pitch < PITCH_MIN || pitch > PITCH_MAX) continue;
      const key = activeNoteKey(pitch, event.startTimeInBeats);
      if (seenActiveNoteKeysRef.current.has(key)) continue;

      spawnHit(pitch, clamp(event.velocity / 127, 0.05, 1), makeDuration(event.duration));
      seenActiveNoteKeysRef.current.add(key);
    }

    for (const key of seenActiveNoteKeysRef.current) {
      if (!currentActiveNoteKeys.has(key)) {
        seenActiveNoteKeysRef.current.delete(key);
      }
    }

    hitsRef.current = hitsRef.current
      .filter((hit) => now - hit.time <= hit.duration + release)
      .slice(-MAX_ACTIVE_RISERS);

    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const sizes = geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const alphas = geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    const colors = geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const pos = positions.array as Float32Array;
    const size = sizes.array as Float32Array;
    const alpha = alphas.array as Float32Array;
    const col = colors.array as Float32Array;

    if (hitsRef.current.length === 0) {
      geometry.setDrawRange(0, 0);
      return;
    }

    const palette = state.activePalette;
    if (palette) {
      palettePrimaryRef.current.set(palette.primary);
      paletteAccentRef.current.set(palette.accent);
      paletteHighlightRef.current.set(palette.highlight);
    } else {
      palettePrimaryRef.current.set('#000000');
      paletteAccentRef.current.set('#111111');
      paletteHighlightRef.current.set('#333333');
    }

    let cursor = 0;
    const writePoint = (
      x: number,
      y: number,
      z: number,
      pointSize: number,
      opacity: number,
      color: THREE.Color,
    ) => {
      if (cursor >= MAX_POINTS || opacity <= 0.002) return;
      const i3 = cursor * 3;
      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;
      size[cursor] = pointSize;
      alpha[cursor] = clamp(opacity, 0, 1);
      col[i3] = color.r;
      col[i3 + 1] = color.g;
      col[i3 + 2] = color.b;
      cursor++;
    };

    for (const hit of hitsRef.current) {
      const age = now - hit.time;
      const progress = clamp(age / hit.duration, 0, 1);
      const energy = smooth01(progress);
      const env = riserEnvelope(age, hit.duration, attack, release) * hit.velocity;
      if (env <= 0.002) continue;

      const head = easeInExpoLite(progress, acceleration);
      const ceiling = clamp(head + frontWidth * (1.15 + densityBuild * energy), 0.04, 1.08);
      const pitchHue = ((hit.pitch % 12) / 12 + hit.id * 0.041) % 1;
      const peak = smooth01((progress - 0.78) / 0.22);

      for (let i = 0; i < particleCount; i++) {
        const p = particles[i];
        const reveal = smooth01((progress - p.birthOffset * densityBuild) / 0.2);
        if (reveal <= 0.002) continue;

        const speed = riseSpeed * p.speedMul * (0.25 + energy * 1.9);
        const heightNorm = (p.heightOffset + age * speed) % 1;
        const aboveHead = 1 - smooth01((heightNorm - ceiling) / Math.max(0.001, frontWidth));
        if (aboveHead <= 0.002) continue;

        const lowerFill = smooth01((heightNorm + 0.04) / Math.max(0.08, ceiling));
        const frontDelta = (heightNorm - head) / frontWidth;
        const frontPulse = Math.exp(-frontDelta * frontDelta);
        const pressure = 1 + frontPulse * pressureBoost + peak * peakFlash;
        const pull = 1 - centerPull * energy * smooth01(heightNorm);
        const laneWidth = width * (0.34 + p.radiusNorm * 0.72) * pull;
        const spiral = p.angle
          + spiralAmount * (age * spiralSpeed * (0.4 + energy) + heightNorm * 4.8 + p.phase)
          + hit.id * 0.19;
        const noise = Math.sin(now * 7.5 + p.phase + heightNorm * 8.0) * turbulence * (0.25 + energy);
        const breath = Math.sin(now * (4.0 + shimmer * 8.0) + p.phase * 1.7) * shimmer * 0.06 * energy;
        const radial = laneWidth * (1 + noise + breath);
        const x = Math.cos(spiral) * radial + p.drift * turbulence * (0.45 + energy);
        const y = startY + heightNorm * (endY - startY);
        const z = Math.sin(spiral) * depth * p.radiusNorm + frontPulse * 0.24 * peak;
        const topGlow = 0.55 + smooth01(heightNorm) * 0.45;
        const opacity = env * reveal * aboveHead * lowerFill * p.weight * topGlow * (0.55 + frontPulse * 0.45);

        if (colorMode === 'palette') {
          const selector = (p.seed + hit.id * 0.13) % 1;
          colorRef.current.copy(selector < 0.5
            ? palettePrimaryRef.current
            : selector < 0.82
              ? paletteAccentRef.current
              : paletteHighlightRef.current);
        } else if (colorMode === 'pitch') {
          colorRef.current.setHSL((pitchHue + p.radiusNorm * 0.11 + heightNorm * 0.08) % 1, 0.82, 0.28 + energy * 0.12);
        } else {
          colorRef.current.setRGB(0, 0, 0);
        }

        writePoint(
          x,
          y,
          z,
          dotSize * p.sizeMul * (0.55 + pressure * 0.45),
          opacity,
          colorRef.current,
        );
      }
    }

    geometry.setDrawRange(0, cursor);
    positions.needsUpdate = true;
    sizes.needsUpdate = true;
    alphas.needsUpdate = true;
    colors.needsUpdate = true;
    geometry.computeBoundingSphere();
  });

  return (
    <group>
      <mesh ref={backgroundRef} position={[0, 0, -6]} renderOrder={-100} frustumCulled={false}>
        <planeGeometry args={[18, 12]} />
        <meshBasicMaterial color="#ffffff" depthWrite={false} toneMapped={false} />
      </mesh>
      <points
        geometry={geometry}
        material={material}
        renderOrder={10}
        frustumCulled={false}
      />
    </group>
  );
}

export const ParticleRiser: Instrument = {
  id: 'particleRiser',
  name: 'Particle Riser',
  description: 'Long-building upward particle riser with accelerating pressure-wave motion',
  color: '#111827',
  hasAudio: false,
  hasVisual: true,
  editorType: 'generic',
  disableBloom: true,
  noteRange: { min: PITCH_MIN, max: PITCH_MAX },
  rangeLabels: [
    { startPitch: PITCH_MIN, endPitch: PITCH_MAX, label: 'Trigger Riser' },
  ],

  defaultSettings: { ...DEFAULTS },

  settingsSchema: {
    particleCount: { type: 'number', label: 'Particles', min: 400, max: MAX_PARTICLES, step: 100, default: DEFAULTS.particleCount },
    dotSize: { type: 'number', label: 'Dot Size', min: 1, max: 14, step: 0.25, default: DEFAULTS.dotSize },
    duration: { type: 'number', label: 'Duration (s)', min: 0.5, max: 24, step: 0.1, default: DEFAULTS.duration },
    noteDurationScale: { type: 'number', label: 'Note Length Scale', min: 0, max: 2, step: 0.05, default: DEFAULTS.noteDurationScale },
    attack: { type: 'number', label: 'Attack (s)', min: 0.001, max: 3, step: 0.01, default: DEFAULTS.attack },
    release: { type: 'number', label: 'Release (s)', min: 0.05, max: 6, step: 0.05, default: DEFAULTS.release },
    startY: { type: 'number', label: 'Start Y', min: -8, max: 4, step: 0.05, default: DEFAULTS.startY },
    endY: { type: 'number', label: 'End Y', min: -2, max: 8, step: 0.05, default: DEFAULTS.endY },
    width: { type: 'number', label: 'Width', min: 0.2, max: 6, step: 0.05, default: DEFAULTS.width },
    depth: { type: 'number', label: 'Depth', min: 0, max: 3, step: 0.05, default: DEFAULTS.depth },
    riseSpeed: { type: 'number', label: 'Rise Speed', min: 0.02, max: 1.5, step: 0.01, default: DEFAULTS.riseSpeed },
    acceleration: { type: 'number', label: 'Acceleration', min: 0.4, max: 4, step: 0.05, default: DEFAULTS.acceleration },
    frontWidth: { type: 'number', label: 'Wave Width', min: 0.02, max: 0.6, step: 0.01, default: DEFAULTS.frontWidth },
    pressureBoost: { type: 'number', label: 'Pressure Boost', min: 0, max: 5, step: 0.05, default: DEFAULTS.pressureBoost },
    densityBuild: { type: 'number', label: 'Density Build', min: 0, max: 1, step: 0.01, default: DEFAULTS.densityBuild },
    centerPull: { type: 'number', label: 'Center Pull', min: 0, max: 1, step: 0.01, default: DEFAULTS.centerPull },
    turbulence: { type: 'number', label: 'Turbulence', min: 0, max: 0.4, step: 0.005, default: DEFAULTS.turbulence },
    spiralAmount: { type: 'number', label: 'Spiral Amount', min: 0, max: 3, step: 0.05, default: DEFAULTS.spiralAmount },
    spiralSpeed: { type: 'number', label: 'Spiral Speed', min: -4, max: 4, step: 0.05, default: DEFAULTS.spiralSpeed },
    shimmer: { type: 'number', label: 'Shimmer', min: 0, max: 1, step: 0.01, default: DEFAULTS.shimmer },
    peakFlash: { type: 'number', label: 'Peak Flash', min: 0, max: 2, step: 0.01, default: DEFAULTS.peakFlash },
    colorMode: {
      type: 'select',
      label: 'Color Mode',
      options: [
        { value: 'mono', label: 'Black on White' },
        { value: 'palette', label: 'Palette' },
        { value: 'pitch', label: 'Pitch Color' },
      ],
      default: DEFAULTS.colorMode,
    },
    whiteBackground: { type: 'boolean', label: 'White Background', default: DEFAULTS.whiteBackground },
  },

  VisualComponent: ParticleRiserVisual,
};
