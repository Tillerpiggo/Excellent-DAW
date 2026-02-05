'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';

interface CircleGridProps {
  trackId: string;
}

const CONFIG = {
  circleRadius: 0.12,      // Radius of each circle
  gridSpacing: 0.35,       // Space between circle centers
  glowIntensity: 0.8,      // Glow strength
  baseHue: 0.55,           // Starting hue (cyan-ish)
};

// Clockwise order starting top-left: TL(0) → TR(1) → BR(2) → BL(3)
const CIRCLE_POSITIONS = [
  { x: -1, y: 1 },   // Top-left (index 0)
  { x: 1, y: 1 },    // Top-right (index 1)
  { x: 1, y: -1 },   // Bottom-right (index 2)
  { x: -1, y: -1 },  // Bottom-left (index 3)
];

function isCircleVisible(noteOnCount: number, positionIndex: number): boolean {
  // Each 8 notes is a full cycle:
  // Notes 1-4 turn on circles in order (TL, TR, BR, BL)
  // Notes 5-8 turn off circles in same order
  const cyclePosition = noteOnCount % 8;

  // Circle at position `pos` is visible when:
  // cyclePosition > pos (it was turned on) AND
  // cyclePosition <= pos + 4 (it hasn't been turned off yet)
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
  // Draw multiple glow layers
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

  // Slowly shift hue over time
  const hue = ((baseHue + time * 0.02) % 1) * 360;

  // Render each circle if visible
  for (let i = 0; i < 4; i++) {
    if (isCircleVisible(noteOnCount, i)) {
      const pos = CIRCLE_POSITIONS[i];
      const x = centerX + pos.x * gridSpacing;
      const y = centerY - pos.y * gridSpacing; // Flip y for canvas coordinates

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

export function CircleGrid({ trackId }: CircleGridProps) {
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

    // Read state from engine
    const state = engineRef.current.getTrackState(trackId);
    const params = state?.params ?? {};
    const noteOnCount = state?.noteOnCount ?? 0;

    timeRef.current += delta;

    // Clear canvas
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render the circle grid
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
