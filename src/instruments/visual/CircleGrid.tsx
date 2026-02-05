'use client';

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { Instrument } from '../types';

interface CircleGridProps {
  trackId: string;
}

// Layout generator functions - return normalized positions [-1, 1]
type LayoutFn = (index: number, total: number, rows: number, cols: number) => { x: number; y: number };

const layouts: Record<string, LayoutFn> = {
  grid: (index, _total, rows, cols) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      x: cols > 1 ? (col / (cols - 1)) * 2 - 1 : 0,
      y: rows > 1 ? (row / (rows - 1)) * 2 - 1 : 0,
    };
  },

  spiral: (index, total) => {
    const angle = index * 0.5;
    const radius = Math.sqrt(index / total);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  },

  fibonacci: (index, total) => {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const angle = index * goldenAngle;
    const radius = Math.sqrt(index / total);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  },

  circle: (index, total) => {
    const rings = Math.ceil(Math.sqrt(total));
    let remaining = total;
    let ringStart = 0;
    let currentRing = 0;

    // Find which ring this dot belongs to
    for (let r = 0; r < rings; r++) {
      const dotsInRing = r === 0 ? 1 : Math.floor(2 * Math.PI * r);
      if (index < ringStart + dotsInRing) {
        currentRing = r;
        break;
      }
      ringStart += dotsInRing;
      remaining -= dotsInRing;
    }

    if (currentRing === 0) return { x: 0, y: 0 };

    const indexInRing = index - ringStart;
    const dotsInRing = Math.floor(2 * Math.PI * currentRing);
    const angle = (indexInRing / dotsInRing) * Math.PI * 2;
    const radius = currentRing / rings;

    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  },

  hexagon: (index, total, rows, cols) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const offset = row % 2 === 0 ? 0 : 0.5;
    return {
      x: cols > 1 ? ((col + offset) / cols) * 2 - 1 : 0,
      y: rows > 1 ? (row / (rows - 1)) * 2 - 1 : 0,
    };
  },

  wave: (index, total, rows, cols) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const waveOffset = Math.sin(col * 0.5) * 0.2;
    return {
      x: cols > 1 ? (col / (cols - 1)) * 2 - 1 : 0,
      y: rows > 1 ? (row / (rows - 1)) * 2 - 1 + waveOffset : waveOffset,
    };
  },

  diamond: (index, total) => {
    const side = Math.ceil(Math.sqrt(total));
    const row = Math.floor(index / side);
    const col = index % side;
    // Rotate 45 degrees
    const x = (col / (side - 1)) * 2 - 1;
    const y = (row / (side - 1)) * 2 - 1;
    const cos45 = Math.cos(Math.PI / 4);
    const sin45 = Math.sin(Math.PI / 4);
    return {
      x: (x * cos45 - y * sin45) * 0.7,
      y: (x * sin45 + y * cos45) * 0.7,
    };
  },

  star: (index, total) => {
    const points = 5;
    const rings = Math.ceil(total / points);
    const ring = Math.floor(index / points);
    const pointIndex = index % points;

    const innerRadius = 0.3;
    const outerRadius = 1;
    const radius = innerRadius + (ring / rings) * (outerRadius - innerRadius);
    const angle = (pointIndex / points) * Math.PI * 2 - Math.PI / 2;
    const wobble = ring % 2 === 0 ? 0 : Math.PI / points;

    return {
      x: Math.cos(angle + wobble) * radius,
      y: Math.sin(angle + wobble) * radius,
    };
  },

  random: (index, total) => {
    // Use seeded random for consistency
    const seed = index * 9301 + 49297;
    const rng1 = (seed % 233280) / 233280;
    const rng2 = ((seed * 7) % 233280) / 233280;
    return {
      x: rng1 * 2 - 1,
      y: rng2 * 2 - 1,
    };
  },
};

const LAYOUT_OPTIONS = Object.keys(layouts);

// Toggle mode functions - determine which dots are visible based on noteOnCount
type ToggleFn = (index: number, total: number, noteOnCount: number) => boolean;

const toggleModes: Record<string, ToggleFn> = {
  none: () => true, // All dots always visible

  cycle: (index, total, noteOnCount) => {
    // One dot toggles per hit: fill up, then empty out
    const cycleLength = total * 2;
    const pos = noteOnCount % cycleLength;

    if (pos < total) {
      // Filling up: dot i is visible if i < pos
      return index < pos;
    } else {
      // Emptying: dot i is visible if i >= (pos - total)
      return index >= (pos - total);
    }
  },

  fill: (index, total, noteOnCount) => {
    // Dots fill up one by one, then reset
    const visibleCount = noteOnCount % (total + 1);
    return index < visibleCount;
  },

  wave: (index, total, noteOnCount) => {
    // Wave pattern sweeps across
    const wavePos = (noteOnCount * 2) % total;
    const dist = Math.abs(index - wavePos);
    return dist < total * 0.3;
  },

  random: (index, _total, noteOnCount) => {
    // Seeded random based on noteOnCount - changes pattern each note
    const seed = (index * 9301 + noteOnCount * 49297) % 233280;
    return (seed / 233280) > 0.5;
  },

  alternate: (index, _total, noteOnCount) => {
    // Alternates even/odd dots
    return (index + noteOnCount) % 2 === 0;
  },

  spiral: (index, total, noteOnCount) => {
    // Spiral outward from center
    const visibleCount = noteOnCount % (total + 1);
    // Assuming spiral layout order, first N dots are visible
    return index < visibleCount;
  },
};

const TOGGLE_OPTIONS = Object.keys(toggleModes);

function CircleGridVisual({ trackId }: CircleGridProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const engineRef = useRef(getVisualPlaybackEngine());
  const timeRef = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorsRef = useRef<Float32Array | null>(null);

  // Get current params
  const getParams = () => {
    const state = engineRef.current.getTrackState(trackId);
    return state?.params ?? {};
  };

  const params = getParams();
  const rows = (params.rows as number) ?? 2;
  const cols = (params.cols as number) ?? 2;
  const count = rows * cols;

  // Create geometry and set up instance colors
  useEffect(() => {
    if (!meshRef.current) return;

    // Set up instance colors
    const colors = new Float32Array(count * 3);
    colorsRef.current = colors;
    meshRef.current.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  }, [count]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !colorsRef.current) return;

    const state = engineRef.current.getTrackState(trackId);
    const params = state?.params ?? {};
    const noteOnCount = state?.noteOnCount ?? 0;

    // Read params
    const rows = (params.rows as number) ?? 2;
    const cols = (params.cols as number) ?? 2;
    const spacing = (params.spacing as number) ?? 1.5;
    const dotSize = (params.dotSize as number) ?? 1;
    const layoutName = (params.layout as string) ?? 'grid';
    const toggleModeName = (params.toggleMode as string) ?? 'cycle';
    const baseHue = (params.baseHue as number) ?? 0.55;
    const hueRange = (params.hueRange as number) ?? 0.2;
    const rotationSpeed = (params.rotationSpeed as number) ?? 0;

    timeRef.current += delta;
    const time = timeRef.current;

    const layoutFn = layouts[layoutName] ?? layouts.grid;
    const toggleFn = toggleModes[toggleModeName] ?? toggleModes.cycle;
    const total = rows * cols;
    const scale = spacing * Math.max(rows, cols) * 0.5;

    const colors = colorsRef.current;
    const color = new THREE.Color();

    for (let i = 0; i < total; i++) {
      // Check if this dot should be visible based on toggle mode
      const isVisible = toggleFn(i, total, noteOnCount);

      if (!isVisible) {
        // Hide dot by scaling to 0
        dummy.position.set(0, 0, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        colors[i * 3] = 0;
        colors[i * 3 + 1] = 0;
        colors[i * 3 + 2] = 0;
        continue;
      }

      const pos = layoutFn(i, total, rows, cols);

      // Apply rotation
      const cos = Math.cos(time * rotationSpeed);
      const sin = Math.sin(time * rotationSpeed);
      const x = pos.x * cos - pos.y * sin;
      const y = pos.x * sin + pos.y * cos;

      // Position
      dummy.position.set(x * scale, y * scale, 0);
      dummy.scale.setScalar(dotSize);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Color - vary hue based on position and time
      const distFromCenter = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
      const hue = (baseHue + distFromCenter * hueRange + time * 0.05 + (noteOnCount * 0.02)) % 1;
      const saturation = 0.8;
      const lightness = 0.5;

      color.setHSL(hue, saturation, lightness);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} position={[0, 0, -3]}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

// Unified Instrument definition
export const CircleGrid: Instrument = {
  id: 'circleGrid',
  name: 'Circle Grid',
  description: 'Configurable grid of glowing dots with multiple layout patterns',
  icon: '⭕',
  color: '#14b8a6',
  hasAudio: false,
  hasVisual: true,
  editorType: 'generic',

  defaultSettings: {
    rows: 2,
    cols: 2,
    spacing: 1.5,
    dotSize: 1,
    layout: 'grid',
    toggleMode: 'cycle',
    baseHue: 0.55,
    hueRange: 0.2,
    rotationSpeed: 0,
  },

  settingsSchema: {
    rows: { type: 'number', label: 'Rows', min: 1, max: 32, step: 1, default: 2 },
    cols: { type: 'number', label: 'Columns', min: 1, max: 32, step: 1, default: 2 },
    spacing: { type: 'number', label: 'Spacing', min: 0.1, max: 4, step: 0.1, default: 1.5 },
    dotSize: { type: 'number', label: 'Dot Size', min: 0.1, max: 3, step: 0.1, default: 1 },
    layout: {
      type: 'select',
      label: 'Layout',
      options: LAYOUT_OPTIONS.map(l => ({ value: l, label: l.charAt(0).toUpperCase() + l.slice(1) })),
      default: 'grid'
    },
    toggleMode: {
      type: 'select',
      label: 'Toggle Mode',
      options: TOGGLE_OPTIONS.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })),
      default: 'cycle'
    },
    baseHue: { type: 'number', label: 'Base Hue', min: 0, max: 1, step: 0.05, default: 0.55 },
    hueRange: { type: 'number', label: 'Hue Range', min: 0, max: 1, step: 0.05, default: 0.2 },
    rotationSpeed: { type: 'number', label: 'Rotation Speed', min: 0, max: 2, step: 0.1, default: 0 },
  },

  VisualComponent: CircleGridVisual,
};
