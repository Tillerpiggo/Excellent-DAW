'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { Instrument } from '../types';

const PITCH_MIN = 24;
const PITCH_MAX = 60;
const MAX_PARTICLES = 4200;
const MAX_ACTIVE_HITS = 8;
const TWO_PI = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

type ColorMode = 'mono' | 'pitch' | 'color';

interface RingParticle {
  angle: number;
  radiusNorm: number;
  jitterRadius: number;
  phase: number;
  weight: number;
  dotScale: number;
}

interface BassHit {
  time: number;
  pitch: number;
  velocity: number;
  length: number;
  phase: number;
}

function activeNoteKey(pitch: number, startTimeInBeats: number): string {
  return `${pitch}:${startTimeInBeats}`;
}

const DEFAULTS = {
  particleCount: 2200,
  dotSize: 6.5,
  innerRadius: 1.35,
  outerRadius: 2.35,
  centerX: 0,
  centerY: 0,
  perspectiveDepth: 0.72,
  attack: 0.012,
  decay: 0.22,
  sustain: 0.74,
  release: 1.25,
  baseLength: 0.34,
  noteLengthScale: 0.28,
  shakeStrength: 0.55,
  waveFrequency: 4.8,
  waveSpeed: 7.6,
  noteVariation: 1,
  radialPush: 0.08,
  turbulence: 0.02,
  rotationSpeed: 0.12,
  rotationAmount: 1,
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
    float perspective = 9.0 / max(1.0, -mvPosition.z);
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
    float edge = 1.0 - smoothstep(0.62, 1.0, r);
    gl_FragColor = vec4(vColor, vAlpha * edge);
  }
`;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smooth01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
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

function makeParticles(count: number): RingParticle[] {
  const particles: RingParticle[] = [];
  for (let i = 0; i < count; i++) {
    const radiusNorm = Math.sqrt((i + 0.5) / count);
    const seed = i * 19.19 + 7.7;
    particles.push({
      angle: (i * GOLDEN_ANGLE + (rand(seed) - 0.5) * 0.035) % TWO_PI,
      radiusNorm,
      jitterRadius: (rand(seed + 1.4) - 0.5) * 0.018,
      phase: rand(seed + 2.8) * TWO_PI,
      weight: 0.55 + rand(seed + 4.2) * 0.45,
      dotScale: 0.72 + rand(seed + 5.6) * 0.62,
    });
  }
  return particles;
}

function bassEnvelope(now: number, hit: BassHit, attack: number, decay: number, sustain: number, release: number): number {
  const age = now - hit.time;
  if (age < 0) return 0;

  const safeAttack = Math.max(0.001, attack);
  const safeDecay = Math.max(0.001, decay);
  const safeRelease = Math.max(0.001, release);
  const safeLength = Math.max(0.001, hit.length);

  if (age < safeAttack) {
    return smooth01(age / safeAttack) * hit.velocity;
  }

  const bodyAge = age - safeAttack;
  const bodyLevel = sustain + (1 - sustain) * Math.exp(-bodyAge / safeDecay);
  if (bodyAge <= safeLength) {
    return clamp(bodyLevel * hit.velocity, 0, 1);
  }

  const releaseAge = bodyAge - safeLength;
  const releaseStart = sustain + (1 - sustain) * Math.exp(-safeLength / safeDecay);
  return clamp(releaseStart * Math.exp(-releaseAge / safeRelease) * hit.velocity, 0, 1);
}

function setColorFor(color: THREE.Color, mode: ColorMode, pitch: number, amp: number): void {
  if (mode === 'mono') {
    color.setRGB(0, 0, 0);
    return;
  }
  if (mode === 'color') {
    color.setHSL(0.58, 0.82, 0.26 + amp * 0.12);
    return;
  }
  color.setHSL(((pitch % 12) / 12 + 0.56) % 1, 0.84, 0.32 + amp * 0.12);
}

function ParticleBassRingVisual({ trackId }: { trackId: string }) {
  const engineRef = useRef(getVisualPlaybackEngine());
  const backgroundRef = useRef<THREE.Mesh>(null);
  const prevCountsRef = useRef<Map<number, number>>(new Map());
  const seenActiveNoteKeysRef = useRef<Set<string>>(new Set());
  const prevSeekGenRef = useRef(-1);
  const hitsRef = useRef<BassHit[]>([]);
  const colorRef = useRef(new THREE.Color());

  const particles = useMemo(() => makeParticles(MAX_PARTICLES), []);
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geom.setDrawRange(0, 0);
    return geom;
  }, []);

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
    const particleCount = Math.floor(clamp(num(params, 'particleCount', DEFAULTS.particleCount), 300, MAX_PARTICLES));
    const dotSize = num(params, 'dotSize', DEFAULTS.dotSize);
    const innerRadius = num(params, 'innerRadius', DEFAULTS.innerRadius);
    const outerRadius = Math.max(innerRadius + 0.05, num(params, 'outerRadius', DEFAULTS.outerRadius));
    const centerX = num(params, 'centerX', DEFAULTS.centerX);
    const centerY = num(params, 'centerY', DEFAULTS.centerY);
    const perspectiveDepth = num(params, 'perspectiveDepth', DEFAULTS.perspectiveDepth);
    const attack = num(params, 'attack', DEFAULTS.attack);
    const decay = num(params, 'decay', DEFAULTS.decay);
    const sustain = clamp(num(params, 'sustain', DEFAULTS.sustain), 0, 1);
    const release = num(params, 'release', DEFAULTS.release);
    const baseLength = num(params, 'baseLength', DEFAULTS.baseLength);
    const noteLengthScale = num(params, 'noteLengthScale', DEFAULTS.noteLengthScale);
    const shakeStrength = num(params, 'shakeStrength', DEFAULTS.shakeStrength);
    const waveFrequency = num(params, 'waveFrequency', DEFAULTS.waveFrequency);
    const waveSpeed = num(params, 'waveSpeed', DEFAULTS.waveSpeed);
    const noteVariation = num(params, 'noteVariation', DEFAULTS.noteVariation);
    const radialPush = num(params, 'radialPush', DEFAULTS.radialPush);
    const turbulence = num(params, 'turbulence', DEFAULTS.turbulence);
    const rotationSpeed = num(params, 'rotationSpeed', DEFAULTS.rotationSpeed);
    const rotationAmount = num(params, 'rotationAmount', DEFAULTS.rotationAmount);
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

    const spawnHit = (pitch: number, velocity: number, duration: number, phaseOffset = 0) => {
      hitsRef.current.push({
        time: now,
        pitch,
        velocity,
        length: Math.max(0.04, baseLength + duration * noteLengthScale),
        phase: ((pitch % 12) / 12) * TWO_PI + phaseOffset,
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
      const duration = Math.max(0.05, event?.duration ?? 1);
      for (let i = 0; i < Math.min(newHits, 3); i++) {
        spawnHit(pitch, velocity, duration, i * 0.31);
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

      const velocity = clamp(event.velocity / 127, 0.05, 1);
      const duration = Math.max(0.05, event.duration);
      spawnHit(pitch, velocity, duration);
      seenActiveNoteKeysRef.current.add(key);
    }

    for (const key of seenActiveNoteKeysRef.current) {
      if (!currentActiveNoteKeys.has(key)) {
        seenActiveNoteKeysRef.current.delete(key);
      }
    }

    const minimumHitLife = Math.max(0.03, attack + 0.01);
    hitsRef.current = hitsRef.current
      .filter((hit) => (now - hit.time) < minimumHitLife || bassEnvelope(now, hit, attack, decay, sustain, release) > 0.003)
      .slice(-MAX_ACTIVE_HITS);

    const activeHits = hitsRef.current;
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const sizes = geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const alphas = geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    const colors = geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const pos = positions.array as Float32Array;
    const size = sizes.array as Float32Array;
    const alpha = alphas.array as Float32Array;
    const col = colors.array as Float32Array;

    if (activeHits.length === 0) {
      geometry.setDrawRange(0, 0);
      return;
    }

    const rotation = now * rotationSpeed * rotationAmount;
    const radiusSpan = outerRadius - innerRadius;
    let cursor = 0;

    for (let i = 0; i < particleCount; i++) {
      const p = particles[i];
      const radiusNorm = clamp(p.radiusNorm + p.jitterRadius, 0, 1);
      const radius = innerRadius + radiusNorm * radiusSpan;
      const angle = p.angle + rotation;
      let ampSum = 0;
      let zWave = 0;
      let radialWave = 0;
      let colorPitch = PITCH_MIN;

      for (const hit of activeHits) {
        const amp = bassEnvelope(now, hit, attack, decay, sustain, release);
        if (amp <= 0.003) continue;

        const age = now - hit.time;
        const pitchNorm = clamp((hit.pitch - PITCH_MIN) / (PITCH_MAX - PITCH_MIN), 0, 1);
        const arms = 1 + (hit.pitch % 5);
        const direction = hit.pitch % 2 === 0 ? 1 : -1;
        const noteFreq = waveFrequency * (0.7 + pitchNorm * 1.15 * noteVariation);
        const noteSpeed = waveSpeed * (0.72 + pitchNorm * 0.58 * noteVariation);
        const radialPhase = radiusNorm * noteFreq - age * noteSpeed + hit.phase;
        const angularPhase = angle * arms * direction + hit.phase * 0.7;
        const broadWave = Math.sin(radialPhase + angularPhase);
        const subWave = Math.sin(radiusNorm * 2.6 - age * noteSpeed * 0.42 + p.phase + hit.phase);
        const edgeFalloff = 0.72 + (1 - radiusNorm) * 0.28;
        const hitAmp = amp * hit.velocity * edgeFalloff;

        zWave += hitAmp * (broadWave * 0.76 + subWave * 0.24);
        radialWave += hitAmp * Math.sin(radialPhase * 0.72 + p.phase) * (0.4 + pitchNorm * 0.6);
        ampSum += amp;
        colorPitch = hit.pitch;
      }

      if (ampSum <= 0.003) continue;

      const combinedAmp = clamp(ampSum, 0, 1.6);
      const radiusPush = radialWave * radialPush;
      const noise = Math.sin(now * 18 + p.phase * 1.7) * turbulence * combinedAmp;
      const finalRadius = radius + radiusPush + noise;
      const x = centerX + Math.cos(angle) * finalRadius;
      const y = centerY + Math.sin(angle) * finalRadius;
      const z = zWave * shakeStrength + Math.sin(angle) * perspectiveDepth * radiusNorm * 0.22;
      const shade = 0.55 + clamp((z / Math.max(0.001, shakeStrength)) * 0.18 + radiusNorm * 0.22, 0, 0.45);
      const opacity = clamp(combinedAmp * p.weight * shade, 0, 1);
      if (opacity <= 0.002) continue;

      setColorFor(colorRef.current, colorMode, colorPitch, combinedAmp);
      const i3 = cursor * 3;
      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;
      size[cursor] = dotSize * p.dotScale * (0.72 + combinedAmp * 0.45 + Math.abs(zWave) * 0.28);
      alpha[cursor] = opacity;
      col[i3] = colorRef.current.r;
      col[i3 + 1] = colorRef.current.g;
      col[i3 + 2] = colorRef.current.b;
      cursor++;
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

export const ParticleBassRing: Instrument = {
  id: 'particleBassRing',
  name: 'Particle Bass Ring',
  description: '808-style bass ring made of particles that shakes in pitch-shaped waves while notes decay',
  color: '#0f766e',
  hasAudio: false,
  hasVisual: true,
  editorType: 'generic',
  disableBloom: true,
  noteRange: { min: PITCH_MIN, max: PITCH_MAX },
  rangeLabels: [
    { startPitch: PITCH_MIN, endPitch: PITCH_MAX, label: 'Bass Notes' },
  ],

  defaultSettings: { ...DEFAULTS },

  settingsSchema: {
    particleCount: { type: 'number', label: 'Particles', min: 300, max: MAX_PARTICLES, step: 100, default: DEFAULTS.particleCount },
    dotSize: { type: 'number', label: 'Dot Size', min: 2, max: 14, step: 0.25, default: DEFAULTS.dotSize },
    innerRadius: { type: 'number', label: 'Inner Radius', min: 0.2, max: 4, step: 0.05, default: DEFAULTS.innerRadius },
    outerRadius: { type: 'number', label: 'Outer Radius', min: 0.3, max: 5, step: 0.05, default: DEFAULTS.outerRadius },
    centerX: { type: 'number', label: 'Center X', min: -5, max: 5, step: 0.05, default: DEFAULTS.centerX },
    centerY: { type: 'number', label: 'Center Y', min: -7, max: 2, step: 0.05, default: DEFAULTS.centerY },
    perspectiveDepth: { type: 'number', label: 'Plane Depth', min: 0, max: 2, step: 0.05, default: DEFAULTS.perspectiveDepth },
    attack: { type: 'number', label: 'Attack', min: 0.001, max: 0.2, step: 0.001, default: DEFAULTS.attack },
    decay: { type: 'number', label: 'Decay', min: 0.02, max: 1.5, step: 0.01, default: DEFAULTS.decay },
    sustain: { type: 'number', label: 'Sustain', min: 0, max: 1, step: 0.01, default: DEFAULTS.sustain },
    release: { type: 'number', label: 'Release', min: 0.05, max: 4, step: 0.01, default: DEFAULTS.release },
    baseLength: { type: 'number', label: 'Base Length', min: 0.04, max: 2, step: 0.01, default: DEFAULTS.baseLength },
    noteLengthScale: { type: 'number', label: 'Note Length Scale', min: 0, max: 1.5, step: 0.01, default: DEFAULTS.noteLengthScale },
    shakeStrength: { type: 'number', label: 'Bass Shake', min: 0, max: 1.5, step: 0.01, default: DEFAULTS.shakeStrength },
    waveFrequency: { type: 'number', label: 'Wave Frequency', min: 0.5, max: 12, step: 0.1, default: DEFAULTS.waveFrequency },
    waveSpeed: { type: 'number', label: 'Wave Speed', min: 0.5, max: 18, step: 0.1, default: DEFAULTS.waveSpeed },
    noteVariation: { type: 'number', label: 'Note Variation', min: 0, max: 2, step: 0.05, default: DEFAULTS.noteVariation },
    radialPush: { type: 'number', label: 'Radial Push', min: 0, max: 0.5, step: 0.01, default: DEFAULTS.radialPush },
    turbulence: { type: 'number', label: 'Turbulence', min: 0, max: 0.2, step: 0.005, default: DEFAULTS.turbulence },
    rotationSpeed: { type: 'number', label: 'Rotation Speed', min: -1, max: 1, step: 0.01, default: DEFAULTS.rotationSpeed },
    rotationAmount: { type: 'number', label: 'Rotation Amount', min: 0, max: 2, step: 0.05, default: DEFAULTS.rotationAmount },
    colorMode: {
      type: 'select',
      label: 'Color Mode',
      options: [
        { value: 'mono', label: 'Black on White' },
        { value: 'pitch', label: 'Pitch Color' },
        { value: 'color', label: 'Bass Teal' },
      ],
      default: DEFAULTS.colorMode,
    },
    whiteBackground: { type: 'boolean', label: 'White Background', default: DEFAULTS.whiteBackground },
  },

  VisualComponent: ParticleBassRingVisual,
};
