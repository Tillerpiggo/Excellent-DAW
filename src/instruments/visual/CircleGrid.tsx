'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { Instrument } from '../types';

interface CircleGridProps {
  trackId: string;
}

const CONFIG = {
  circleRadius: 0.12,
  gridSpacing: 0.35,
  glowIntensity: 0.8,
  baseHue: 0.55,
};

const CIRCLE_POSITIONS = [
  { x: -1, y: 1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: -1 },
];

function isCircleVisible(noteOnCount: number, positionIndex: number): boolean {
  const cyclePosition = noteOnCount % 8;
  return cyclePosition > positionIndex && cyclePosition <= positionIndex + 4;
}

function renderCircle(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  hue: number,
  glowIntensity: number
) {
  const glowPasses = [
    { radiusMult: 2.5, alpha: 0.05 * glowIntensity },
    { radiusMult: 2.0, alpha: 0.1 * glowIntensity },
    { radiusMult: 1.6, alpha: 0.15 * glowIntensity },
    { radiusMult: 1.3, alpha: 0.25 * glowIntensity },
    { radiusMult: 1.0, alpha: 0.9 },
  ];

  for (const pass of glowPasses) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * pass.radiusMult, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${pass.alpha})`;
    ctx.fill();
  }
}

function renderCircleGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  noteOnCount: number,
  params: Record<string, unknown>
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const scale = Math.min(width, height) * 0.4;

  const circleRadius = ((params.circleRadius as number) ?? CONFIG.circleRadius) * scale;
  const gridSpacing = ((params.gridSpacing as number) ?? CONFIG.gridSpacing) * scale;
  const glowIntensity = (params.glowIntensity as number) ?? CONFIG.glowIntensity;
  const baseHue = (params.baseHue as number) ?? CONFIG.baseHue;

  ctx.globalCompositeOperation = 'lighter';

  const hue = ((baseHue + time * 0.02) % 1) * 360;

  for (let i = 0; i < 4; i++) {
    if (isCircleVisible(noteOnCount, i)) {
      const pos = CIRCLE_POSITIONS[i];
      const x = centerX + pos.x * gridSpacing;
      const y = centerY - pos.y * gridSpacing;

      renderCircle(ctx, x, y, circleRadius, hue, glowIntensity);
    }
  }
}

function renderVignette(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(width, height) * 0.7;

  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, 'rgba(5, 5, 8, 0)');
  gradient.addColorStop(0.6, 'rgba(5, 5, 8, 0)');
  gradient.addColorStop(1, 'rgba(5, 5, 8, 0.8)');

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function CircleGridVisual({ trackId }: CircleGridProps) {
  const { viewport } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const timeRef = useRef(0);
  const engineRef = useRef(getVisualPlaybackEngine());

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    canvasRef.current = canvas;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    textureRef.current = texture;

    return () => {
      texture.dispose();
    };
  }, []);

  useFrame((_, delta) => {
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    const mesh = meshRef.current;
    if (!canvas || !texture || !mesh) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = engineRef.current.getTrackState(trackId);
    const params = state?.params ?? {};
    const noteOnCount = state?.noteOnCount ?? 0;

    timeRef.current += delta;

    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    renderCircleGrid(
      ctx,
      canvas.width,
      canvas.height,
      timeRef.current,
      noteOnCount,
      params
    );

    renderVignette(ctx, canvas.width, canvas.height);

    texture.needsUpdate = true;

    const material = mesh.material as THREE.MeshBasicMaterial;
    if (!material.map) {
      material.map = texture;
      material.needsUpdate = true;
    }
  });

  const planeSize = Math.max(viewport.width, viewport.height) * 1.5;

  return (
    <mesh ref={meshRef} position={[0, 0, -5]}>
      <planeGeometry args={[planeSize, planeSize]} />
      <meshBasicMaterial transparent opacity={1} depthWrite={false} />
    </mesh>
  );
}

// Unified Instrument definition
export const CircleGrid: Instrument = {
  id: 'circleGrid',
  name: 'Circle Grid',
  description: '2x2 grid of circles that toggle on/off clockwise with each MIDI event',
  icon: '⭕',
  color: '#14b8a6',
  hasAudio: false,
  hasVisual: true,
  editorType: 'generic',

  defaultSettings: {
    circleRadius: 0.12,
    gridSpacing: 0.35,
    glowIntensity: 0.8,
    baseHue: 0.55,
  },

  settingsSchema: {
    circleRadius: { type: 'number', label: 'Circle Radius', min: 0.05, max: 0.3, step: 0.01, default: 0.12 },
    gridSpacing: { type: 'number', label: 'Grid Spacing', min: 0.2, max: 0.6, step: 0.05, default: 0.35 },
    glowIntensity: { type: 'number', label: 'Glow', min: 0, max: 1, step: 0.1, default: 0.8 },
    baseHue: { type: 'number', label: 'Base Hue', min: 0, max: 1, step: 0.05, default: 0.55 },
  },

  VisualComponent: CircleGridVisual,
};
