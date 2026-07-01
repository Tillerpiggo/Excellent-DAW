'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { Instrument } from '../types';

const TWO_PI = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const PITCH_MIN = 24;
const PITCH_MAX = 96;
const MAX_STREAMS = 96;
const MAX_PARTICLES_PER_STREAM = 96;
const MAX_ACTIVE_BURSTS = 10;
const MAX_POINTS = MAX_STREAMS * MAX_PARTICLES_PER_STREAM * MAX_ACTIVE_BURSTS;

type ColorMode = 'mono' | 'palette' | 'pitch';

interface StreamSpec {
  laneX: number;
  laneY: number;
  laneRadius: number;
  speedMul: number;
  sizeMul: number;
  curve: number;
  phase: number;
  hue: number;
  seed: number;
}

interface BurstEntry {
  id: number;
  birthTime: number;
  pitch: number;
  velocity: number;
  streams: StreamSpec[];
}

const DEFAULTS = {
  streams: 28,
  particlesPerStream: 42,
  dotSize: 6.5,
  streamSpeed: 8.5,
  outwardReach: 0.18,
  cameraReach: 1.55,
  attackTiltX: 0,
  attackTiltY: 0,
  attackSpread: 14,
  runSpread: 0.42,
  attackDuration: 0.055,
  travelDuration: 0.72,
  fadeDuration: 1.05,
  trailDuration: 0.24,
  streamTightness: 0.01,
  turbulence: 0.035,
  spiralAmount: 0.12,
  spiralSpeed: 2.8,
  waveParticleCount: 4,
  waveSizeBoost: 2.4,
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
    float perspective = 8.0 / max(1.4, -mvPosition.z);
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
    float softEdge = 1.0 - smoothstep(0.48, 1.0, r);
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

function easeOutCubic(value: number): number {
  const t = clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function degToRad(value: number): number {
  return value * Math.PI / 180;
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

function makeStreams(count: number, burstId: number, pitch: number): StreamSpec[] {
  const streamCount = Math.max(1, Math.min(MAX_STREAMS, Math.floor(count)));
  const streams: StreamSpec[] = [];
  const baseSeed = burstId * 101.3 + pitch * 17.17 + 9.7;

  for (let i = 0; i < streamCount; i++) {
    const seed = baseSeed + i * 37.11;
    const laneRadius = Math.sqrt((i + 0.5) / streamCount);
    const laneAngle = i * GOLDEN_ANGLE;
    streams.push({
      laneX: Math.cos(laneAngle) * laneRadius,
      laneY: Math.sin(laneAngle) * laneRadius,
      laneRadius,
      speedMul: 0.92 + rand(seed + 3.4) * 0.16,
      sizeMul: 0.88 + rand(seed + 4.9) * 0.24,
      curve: (rand(seed + 6.2) - 0.5) * 2,
      phase: rand(seed + 8.8) * TWO_PI,
      hue: rand(seed + 11.4),
      seed,
    });
  }

  return streams;
}

function envelope(age: number, attack: number, travel: number, fade: number): number {
  if (age < 0) return 0;
  if (age < attack) return smooth01(age / Math.max(0.001, attack));
  if (age < attack + travel) return 1;
  return 1 - smooth01((age - attack - travel) / Math.max(0.001, fade));
}

function buildGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'aSize',
    new THREE.BufferAttribute(new Float32Array(MAX_POINTS), 1).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'aAlpha',
    new THREE.BufferAttribute(new Float32Array(MAX_POINTS), 1).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'aColor',
    new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setDrawRange(0, 0);
  return geometry;
}

function ParticleStreamsVisual({ trackId }: { trackId: string }) {
  const engineRef = useRef(getVisualPlaybackEngine());
  const backgroundRef = useRef<THREE.Mesh>(null);
  const prevCountsRef = useRef<Map<number, number>>(new Map());
  const prevSeekGenRef = useRef(-1);
  const burstsRef = useRef<BurstEntry[]>([]);
  const idRef = useRef(0);
  const colorRef = useRef(new THREE.Color());
  const palettePrimaryRef = useRef(new THREE.Color('#000000'));
  const paletteAccentRef = useRef(new THREE.Color('#000000'));
  const paletteHighlightRef = useRef(new THREE.Color('#000000'));

  const geometry = useMemo(buildGeometry, []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }), []);

  useEffect(() => () => {
    burstsRef.current = [];
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(({ camera, clock }) => {
    const state = engineRef.current.getTrackState(trackId);
    if (!state) return;

    const now = clock.elapsedTime;
    const params = state.params;
    const streamCount = clamp(num(params, 'streams', DEFAULTS.streams), 1, MAX_STREAMS);
    const particlesPerStream = Math.floor(clamp(
      num(params, 'particlesPerStream', DEFAULTS.particlesPerStream),
      4,
      MAX_PARTICLES_PER_STREAM,
    ));
    const dotSize = num(params, 'dotSize', DEFAULTS.dotSize);
    const streamSpeed = num(params, 'streamSpeed', DEFAULTS.streamSpeed);
    const outwardReach = num(params, 'outwardReach', DEFAULTS.outwardReach);
    const cameraReach = num(params, 'cameraReach', DEFAULTS.cameraReach);
    const attackDuration = num(params, 'attackDuration', DEFAULTS.attackDuration);
    const travelDuration = num(params, 'travelDuration', DEFAULTS.travelDuration);
    const fadeDuration = num(params, 'fadeDuration', DEFAULTS.fadeDuration);
    const trailDuration = num(params, 'trailDuration', DEFAULTS.trailDuration);
    const streamTightness = num(params, 'streamTightness', DEFAULTS.streamTightness);
    const turbulence = num(params, 'turbulence', DEFAULTS.turbulence);
    const spiralAmount = num(params, 'spiralAmount', DEFAULTS.spiralAmount);
    const spiralSpeed = num(params, 'spiralSpeed', DEFAULTS.spiralSpeed);
    const attackSpread = clamp(num(params, 'attackSpread', DEFAULTS.attackSpread), 1, 90);
    const runSpread = num(params, 'runSpread', DEFAULTS.runSpread);
    const waveParticleCount = clamp(
      num(params, 'waveParticleCount', DEFAULTS.waveParticleCount),
      1,
      MAX_PARTICLES_PER_STREAM,
    );
    const waveSizeBoost = num(params, 'waveSizeBoost', DEFAULTS.waveSizeBoost);
    const colorMode = str<ColorMode>(params, 'colorMode', DEFAULTS.colorMode as ColorMode);
    if (backgroundRef.current) {
      backgroundRef.current.visible = bool(params, 'whiteBackground', DEFAULTS.whiteBackground);
    }

    if (state.seekGeneration !== prevSeekGenRef.current) {
      prevSeekGenRef.current = state.seekGeneration;
      prevCountsRef.current = new Map(state.pitchNoteOnCounts);
      burstsRef.current = [];
      idRef.current = 0;
    }

    for (const [pitch, count] of state.pitchNoteOnCounts) {
      const prev = prevCountsRef.current.get(pitch) ?? 0;
      const newHits = count - prev;
      if (newHits <= 0) continue;

      const event = state.activeNotes.get(pitch);
      const velocity = clamp((event?.velocity ?? 100) / 127, 0.05, 1);
      for (let i = 0; i < Math.min(newHits, 4); i++) {
        const id = idRef.current++;
        burstsRef.current.push({
          id,
          birthTime: now,
          pitch,
          velocity,
          streams: makeStreams(streamCount, id, pitch),
        });
      }
    }
    prevCountsRef.current = new Map(state.pitchNoteOnCounts);

    const totalLifetime = attackDuration + travelDuration + fadeDuration + trailDuration;
    burstsRef.current = burstsRef.current
      .filter((burst) => now - burst.birthTime <= totalLifetime)
      .slice(-MAX_ACTIVE_BURSTS);

    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const sizes = geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const alphas = geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    const colors = geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const pos = positions.array as Float32Array;
    const size = sizes.array as Float32Array;
    const alpha = alphas.array as Float32Array;
    const col = colors.array as Float32Array;

    const toCamera = _tmpVec3A;
    camera.getWorldDirection(toCamera);
    toCamera.negate().normalize();

    const arbUp = Math.abs(toCamera.y) < 0.98 ? _tmpVec3B.set(0, 1, 0) : _tmpVec3B.set(1, 0, 0);
    const baseRight = _tmpVec3C.crossVectors(toCamera, arbUp).normalize();
    const baseUp = _tmpVec3D.crossVectors(baseRight, toCamera).normalize();

    const tiltX = degToRad(num(params, 'attackTiltX', DEFAULTS.attackTiltX));
    const tiltY = degToRad(num(params, 'attackTiltY', DEFAULTS.attackTiltY));
    const center = _tmpVec3E
      .copy(toCamera)
      .addScaledVector(baseUp, Math.sin(tiltX))
      .addScaledVector(baseRight, Math.sin(tiltY))
      .normalize();
    const right = _tmpVec3F.crossVectors(center, arbUp).normalize();
    if (right.lengthSq() < 0.0001) right.copy(baseRight);
    const up = _tmpVec3G.crossVectors(right, center).normalize();

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

    const travelWindow = Math.max(0.001, attackDuration + travelDuration);
    const travelDistance = streamSpeed * travelWindow;
    const trailProgress = clamp(trailDuration / travelWindow, 0.015, 0.95);
    const attackFan = Math.sin(degToRad(attackSpread * 0.5));
    const baseLaneScale = outwardReach * (0.35 + attackFan * 1.2);
    const waveWidth = Math.max(0.5, waveParticleCount * 0.55);

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

    for (const burst of burstsRef.current) {
      const age = now - burst.birthTime;
      const env = envelope(age, attackDuration, travelDuration, fadeDuration) * burst.velocity;
      if (env <= 0.002) continue;

      const headProgress = easeOutCubic(age / travelWindow);
      const pitchHue = ((burst.pitch % 12) / 12 + burst.id * 0.027) % 1;

      for (const stream of burst.streams) {
        if (colorMode === 'palette') {
          const mix = stream.hue;
          colorRef.current.copy(mix < 0.45
            ? palettePrimaryRef.current
            : mix < 0.78
              ? paletteAccentRef.current
              : paletteHighlightRef.current);
        } else if (colorMode === 'pitch') {
          colorRef.current.setHSL((pitchHue + stream.hue * 0.12) % 1, 0.78, 0.38);
        } else {
          colorRef.current.setRGB(0, 0, 0);
        }

        for (let j = 0; j < particlesPerStream; j++) {
          const tailT = particlesPerStream === 1 ? 0 : j / (particlesPerStream - 1);
          const progressRaw = headProgress - tailT * trailProgress;
          if (progressRaw <= 0) continue;

          const progress = clamp(progressRaw, 0, 1);
          const distance = progress * travelDistance * stream.speedMul;
          const stringAlpha = Math.pow(1 - tailT * 0.76, 1.6);
          const flicker = 0.92 + Math.sin(now * 24 + stream.phase + j * 0.47) * 0.08;
          const waveBoost = Math.exp(-Math.pow(j / waveWidth, 2.35));
          const waveScale = 0.36 + waveBoost * waveSizeBoost;
          const spawnFade = smooth01(progressRaw / Math.max(0.001, trailProgress / particlesPerStream));
          const spiral = spiralAmount
            * (now * spiralSpeed + progress * 3.2 + stream.phase);
          const spiralCos = Math.cos(spiral);
          const spiralSin = Math.sin(spiral);
          const laneX = stream.laneX * spiralCos - stream.laneY * spiralSin;
          const laneY = stream.laneX * spiralSin + stream.laneY * spiralCos;
          const streamBreath = Math.sin(now * 5.2 + stream.phase + progress * 4.0) * turbulence * (0.2 + progress);
          const runScale = baseLaneScale + runSpread * progress;
          const jitterA = stream.seed + j * 19.19;
          const jitterScale = streamTightness * (0.15 + progress) * (0.35 + stream.laneRadius);
          const jitterX = (rand(jitterA) - 0.5) * jitterScale;
          const jitterY = (rand(jitterA + 5.5) - 0.5) * jitterScale;
          const curve = stream.curve * turbulence * progress * (1 - progress) * 2.4;
          const radialX = (laneX + streamBreath * 0.18 + curve) * runScale + jitterX;
          const radialY = (laneY + streamBreath * 0.08) * runScale + jitterY;
          const forward = distance * cameraReach;

          const x = right.x * radialX + up.x * radialY + center.x * forward;
          const y = right.y * radialX + up.y * radialY + center.y * forward;
          const z = right.z * radialX + up.z * radialY + center.z * forward;
          const opacity = env * spawnFade * stringAlpha * flicker * (0.62 + waveBoost * 0.38);

          writePoint(
            x,
            y,
            z,
            dotSize * stream.sizeMul * waveScale,
            opacity,
            colorRef.current,
          );
        }
      }
    }

    geometry.setDrawRange(0, cursor);
    positions.needsUpdate = true;
    sizes.needsUpdate = true;
    alphas.needsUpdate = true;
    colors.needsUpdate = true;
  });

  return (
    <group>
      <mesh ref={backgroundRef} position={[0, 0, -6]} renderOrder={-100} frustumCulled={false}>
        <planeGeometry args={[28, 16]} />
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

const _tmpVec3A = new THREE.Vector3();
const _tmpVec3B = new THREE.Vector3();
const _tmpVec3C = new THREE.Vector3();
const _tmpVec3D = new THREE.Vector3();
const _tmpVec3E = new THREE.Vector3();
const _tmpVec3F = new THREE.Vector3();
const _tmpVec3G = new THREE.Vector3();

export const ParticleStreams: Instrument = {
  id: 'particleStreams',
  name: 'Particle Streams',
  description: 'Note-triggered particle strings that rush outward and toward the camera in fast fading streams',
  icon: '✦',
  color: '#0ea5e9',
  hasAudio: false,
  hasVisual: true,
  editorType: 'generic',
  disableBloom: true,
  noteRange: { min: PITCH_MIN, max: PITCH_MAX },
  rangeLabels: [
    { startPitch: PITCH_MIN, endPitch: PITCH_MAX, label: 'Trigger Streams' },
  ],

  defaultSettings: { ...DEFAULTS },

  settingsSchema: {
    streams: { type: 'number', label: 'Streams', min: 1, max: MAX_STREAMS, step: 1, default: DEFAULTS.streams },
    particlesPerStream: { type: 'number', label: 'Particles / Stream', min: 4, max: MAX_PARTICLES_PER_STREAM, step: 1, default: DEFAULTS.particlesPerStream },
    dotSize: { type: 'number', label: 'Dot Size', min: 1, max: 16, step: 0.25, default: DEFAULTS.dotSize },
    waveParticleCount: { type: 'number', label: 'Wave Particles', min: 1, max: 24, step: 1, default: DEFAULTS.waveParticleCount },
    waveSizeBoost: { type: 'number', label: 'Wave Size Boost', min: 0.5, max: 6, step: 0.1, default: DEFAULTS.waveSizeBoost },
    streamSpeed: { type: 'number', label: 'Stream Speed', min: 1, max: 24, step: 0.25, default: DEFAULTS.streamSpeed },
    outwardReach: { type: 'number', label: 'Bundle Width', min: 0.02, max: 1.5, step: 0.01, default: DEFAULTS.outwardReach },
    cameraReach: { type: 'number', label: 'Camera Reach', min: 0.1, max: 3.5, step: 0.05, default: DEFAULTS.cameraReach },
    attackTiltX: { type: 'number', label: 'Attack Tilt X', min: -85, max: 85, step: 1, default: DEFAULTS.attackTiltX },
    attackTiltY: { type: 'number', label: 'Attack Tilt Y', min: -85, max: 85, step: 1, default: DEFAULTS.attackTiltY },
    attackSpread: { type: 'number', label: 'Attack Fan', min: 1, max: 90, step: 1, default: DEFAULTS.attackSpread },
    runSpread: { type: 'number', label: 'Run Spread', min: 0, max: 2.5, step: 0.01, default: DEFAULTS.runSpread },
    attackDuration: { type: 'number', label: 'Attack (s)', min: 0.001, max: 0.4, step: 0.001, default: DEFAULTS.attackDuration },
    travelDuration: { type: 'number', label: 'Travel (s)', min: 0.05, max: 2.5, step: 0.01, default: DEFAULTS.travelDuration },
    fadeDuration: { type: 'number', label: 'Fade (s)', min: 0.05, max: 3, step: 0.01, default: DEFAULTS.fadeDuration },
    trailDuration: { type: 'number', label: 'Trail Lag (s)', min: 0.01, max: 1.2, step: 0.01, default: DEFAULTS.trailDuration },
    streamTightness: { type: 'number', label: 'Stream Tightness', min: 0, max: 0.2, step: 0.005, default: DEFAULTS.streamTightness },
    turbulence: { type: 'number', label: 'Turbulence', min: 0, max: 0.5, step: 0.01, default: DEFAULTS.turbulence },
    spiralAmount: { type: 'number', label: 'Spiral Amount', min: 0, max: 1.5, step: 0.01, default: DEFAULTS.spiralAmount },
    spiralSpeed: { type: 'number', label: 'Spiral Speed', min: 0, max: 8, step: 0.05, default: DEFAULTS.spiralSpeed },
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

  VisualComponent: ParticleStreamsVisual,
};
