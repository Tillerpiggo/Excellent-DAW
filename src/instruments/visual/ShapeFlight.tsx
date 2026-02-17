'use client';

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { Instrument } from '../types';

interface Props {
  trackId: string;
}

interface FlyingShape {
  lineLoop: THREE.LineLoop;
  material: THREE.LineBasicMaterial;
  spawnX: number;
  spawnY: number;
  z: number;
  hue: number;
}

// Generate regular polygon vertices (N-gon) as a BufferGeometry for LineLoop
const polygonGeometryCache = new Map<number, THREE.BufferGeometry>();

function getPolygonGeometry(sides: number): THREE.BufferGeometry {
  let geo = polygonGeometryCache.get(sides);
  if (geo) return geo;

  const positions = new Float32Array(sides * 3);
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    positions[i * 3] = Math.cos(angle);
    positions[i * 3 + 1] = Math.sin(angle);
    positions[i * 3 + 2] = 0;
  }
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  polygonGeometryCache.set(sides, geo);
  return geo;
}

// Spirograph (hypotrochoid) geometry cache
// Key: "R_r_d" string for the specific ratio
const spirographGeometryCache = new Map<string, THREE.BufferGeometry>();

// Nice spirograph presets: [innerRadius, drawDistance] (outer radius always 1)
const SPIROGRAPH_PRESETS: [number, number][] = [
  [0.33, 0.8],   // 3-petal
  [0.25, 0.7],   // 4-petal
  [0.20, 0.75],  // 5-petal
  [0.40, 0.9],   // 5-petal variant
  [0.167, 0.6],  // 6-petal
  [0.143, 0.65], // 7-petal
  [0.125, 0.55], // 8-petal
  [0.375, 0.85], // 8-petal variant
];

function getSpirographGeometry(presetIndex: number): THREE.BufferGeometry {
  const key = `spiro_${presetIndex}`;
  let geo = spirographGeometryCache.get(key);
  if (geo) return geo;

  const [r, d] = SPIROGRAPH_PRESETS[presetIndex % SPIROGRAPH_PRESETS.length];
  const R = 1;
  const segments = 256;
  // Number of full revolutions needed for the curve to close
  const revolutions = Math.round(r / gcd(R, r));
  const tMax = revolutions * Math.PI * 2;

  const positions = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * tMax;
    const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = 0;
  }

  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  spirographGeometryCache.set(key, geo);
  return geo;
}

function gcd(a: number, b: number): number {
  // Work with integers scaled up to avoid floating point issues
  let x = Math.round(a * 1000);
  let y = Math.round(b * 1000);
  while (y) { const t = y; y = x % y; x = t; }
  return x / 1000;
}

const _tmpColor = new THREE.Color();
let hueCounter = 0;

function ShapeFlightVisual({ trackId }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const engineRef = useRef(getVisualPlaybackEngine());
  const shapesRef = useRef<FlyingShape[]>([]);
  const lastLookAheadCountRef = useRef(0);

  // Cleanup on unmount
  useEffect(() => () => {
    const g = groupRef.current;
    if (g) {
      for (const s of shapesRef.current) {
        g.remove(s.lineLoop);
        s.material.dispose();
      }
    }
    shapesRef.current = [];
  }, []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const vs = engineRef.current.getTrackState(trackId);
    if (!vs) return;

    const par = vs.params;
    const speed         = (par.speed as number)         ?? 12;
    const spread        = (par.spread as number)        ?? 0;
    const farZ          = (par.farZ as number)          ?? 40;
    const shapeSize     = (par.shapeSize as number)     ?? 0.4;
    const hueStep       = (par.hueStep as number)       ?? 0.08;
    const baseHue       = (par.baseHue as number)       ?? 0.55;
    const saturation    = (par.saturation as number)    ?? 0.9;
    const lightness     = (par.lightness as number)     ?? 0.85;
    const shapeMode     = (par.shapeMode as string)     ?? 'polygon';
    const rotationSpeed = (par.rotationSpeed as number) ?? 0.5;

    // Compute look-ahead: how many beats ahead to spawn so shape arrives at z=0 on note onset
    const currentBeat = useUIStore.getState().currentBeat;
    const bpm = useProjectStore.getState().project.bpm;
    const travelTimeSec = farZ / speed;
    const lookAheadBeats = travelTimeSec * (bpm / 60);

    // Query noteOnCount at the future beat
    const lookAheadCount = engineRef.current.getNoteOnCountAtBeat(trackId, currentBeat + lookAheadBeats);
    const rawDelta = lookAheadCount - lastLookAheadCountRef.current;
    lastLookAheadCountRef.current = lookAheadCount;

    if (rawDelta > 0) {
      const newNotes = Math.min(rawDelta, 3);

      for (let i = 0; i < newNotes; i++) {
        const hue = (baseHue + hueCounter * hueStep) % 1;
        hueCounter++;

        const material = new THREE.LineBasicMaterial({
          color: _tmpColor.setHSL(hue, saturation, lightness).getHex(),
          transparent: true,
          opacity: 1,
          depthWrite: false,
        });
        material.blending = THREE.AdditiveBlending;
        material.fog = false;

        let geometry: THREE.BufferGeometry;
        if (shapeMode === 'spirograph') {
          const presetIndex = Math.floor(Math.random() * SPIROGRAPH_PRESETS.length);
          geometry = getSpirographGeometry(presetIndex);
        } else {
          const sides = 3 + Math.floor(Math.random() * 6);
          geometry = getPolygonGeometry(sides);
        }

        const lineLoop = new THREE.LineLoop(geometry, material);

        // Random XY within spread radius
        const spawnX = spread > 0 ? (Math.random() - 0.5) * spread * 2 : 0;
        const spawnY = spread > 0 ? (Math.random() - 0.5) * spread * 2 : 0;

        lineLoop.position.set(spawnX, spawnY, -farZ);
        lineLoop.scale.setScalar(shapeSize);

        // Random initial rotation for variety
        lineLoop.rotation.z = Math.random() * Math.PI * 2;

        group.add(lineLoop);
        shapesRef.current.push({ lineLoop, material, spawnX, spawnY, z: -farZ, hue });
      }
    }

    // Update shapes
    const dead: FlyingShape[] = [];

    for (const shape of shapesRef.current) {
      shape.z += speed * delta;
      shape.lineLoop.position.z = shape.z;

      // Scale up as it approaches
      const progress = 1 - Math.max(0, -shape.z) / farZ; // 0 at far, 1 at camera
      const scale = shapeSize + progress * shapeSize * 3;
      shape.lineLoop.scale.setScalar(scale);

      // Rotation (optional via rotationSpeed param)
      if (rotationSpeed !== 0) {
        shape.lineLoop.rotation.z += delta * rotationSpeed;
      }

      // Full opacity throughout approach — fade out gently after passing camera
      if (shape.z > 0) {
        const fadeDistance = 15;
        shape.material.opacity = Math.max(0, 1 - shape.z / fadeDistance);
        if (shape.z > fadeDistance) {
          dead.push(shape);
        }
      } else {
        shape.material.opacity = 1;
      }
    }

    // Remove dead shapes
    for (const shape of dead) {
      group.remove(shape.lineLoop);
      shape.material.dispose();
    }
    if (dead.length > 0) {
      shapesRef.current = shapesRef.current.filter(s => !dead.includes(s));
    }
  });

  return <group ref={groupRef} />;
}

export const ShapeFlight: Instrument = {
  id: 'shapeFlight',
  name: 'Shape Flight',
  description: 'Glowing polygon wireframes fly toward the camera on MIDI notes',
  icon: '🔷',
  color: '#8b5cf6',
  hasAudio: false,
  hasVisual: true,
  editorType: 'generic',

  defaultSettings: {
    speed: 12,
    spread: 0,
    farZ: 40,
    shapeSize: 0.4,
    shapeMode: 'polygon',
    rotationSpeed: 0.5,
    hueStep: 0.08,
    baseHue: 0.55,
    saturation: 0.9,
    lightness: 0.85,
  },

  settingsSchema: {
    speed:         { type: 'number', label: 'Flight Speed',    min: 2,   max: 40,  step: 1,    default: 12 },
    spread:        { type: 'number', label: 'Spread',          min: 0,   max: 10,  step: 0.5,  default: 0 },
    farZ:          { type: 'number', label: 'Spawn Depth',     min: 10,  max: 100, step: 5,    default: 40 },
    shapeSize:     { type: 'number', label: 'Shape Size',      min: 0.1, max: 2,   step: 0.1,  default: 0.4 },
    shapeMode:     { type: 'select', label: 'Shape Mode',      options: [{ value: 'polygon', label: 'Polygon' }, { value: 'spirograph', label: 'Spirograph' }], default: 'polygon' },
    rotationSpeed: { type: 'number', label: 'Rotation Speed',  min: 0,   max: 3,   step: 0.1,  default: 0.5 },
    hueStep:       { type: 'number', label: 'Hue Step',        min: 0,   max: 0.5, step: 0.01, default: 0.08 },
    baseHue:       { type: 'number', label: 'Base Hue',        min: 0,   max: 1,   step: 0.05, default: 0.55 },
    saturation:    { type: 'number', label: 'Saturation',      min: 0,   max: 1,   step: 0.05, default: 0.9 },
    lightness:     { type: 'number', label: 'Lightness',       min: 0.1, max: 1,   step: 0.05, default: 0.85 },
  },

  VisualComponent: ShapeFlightVisual,
};
