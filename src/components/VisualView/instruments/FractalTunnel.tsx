'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { VisualInstrumentState } from '@/core/visualTypes';
import { useProjectStore } from '@/stores/projectStore';

interface FractalTunnelProps {
  state: VisualInstrumentState;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
  hue: number;
  generation: number;
}

interface Branch {
  points: Point3D[];
  generation: number;
  hue: number;
}

interface ColorPulse {
  id: number;
  spawnTime: number;
}

interface BranchParams {
  symmetry: number;
  branchCount: number;
  generations: number;
  spiralAmount: number;
  lengthDecay: number;
  spreadAngle: number;
  hueShift: number;
  baseHue: number;
}

const CONFIG = {
  symmetry: 6,
  branchCount: 3,
  generations: 3,
  spiralAmount: 0.9,
  lengthDecay: 0.8,
  spreadAngle: 1.6,
  hueShift: 0.09,
  baseHue: 0.48,
  backFlowerZ: -250,
  backFlowerScale: 20,
  frontFlowerZ: 500,
  focalLength: 800,
  tunnelLineOpacity: 0.5,
  lineWidth: 4,
  glowIntensity: 0.9,
  baseLength: 80,
  oscSpeed: 1,
};

function project(
  x: number, y: number, z: number,
  centerX: number, centerY: number,
  focalLength: number
): { x: number; y: number; scale: number } | null {
  const perspectiveZ = focalLength - z;
  if (perspectiveZ <= 0) return null;
  const scale = focalLength / perspectiveZ;
  return { x: centerX + x * scale, y: centerY + y * scale, scale };
}

function generateBranches(
  baseLength: number,
  zPosition: number,
  scale: number,
  params: BranchParams,
  globalDirectionFlip: number
): Branch[] {
  const branches: Branch[] = [];

  const addBranches = (
    x: number, y: number,
    angle: number,
    length: number,
    gen: number,
    hue: number,
    direction: number
  ) => {
    if (gen >= params.generations) return;

    const segments = 20;
    const points: Point3D[] = [];
    let currentX = x;
    let currentY = y;
    let currentAngle = angle;

    points.push({ x: currentX, y: currentY, z: zPosition, hue, generation: gen });

    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      currentAngle = angle + t * params.spiralAmount * direction * globalDirectionFlip * Math.PI;
      const segLength = (length * scale) / segments;
      currentX += Math.cos(currentAngle) * segLength;
      currentY += Math.sin(currentAngle) * segLength;
      points.push({ x: currentX, y: currentY, z: zPosition, hue, generation: gen });
    }

    branches.push({ points, generation: gen, hue });

    const childLength = length * params.lengthDecay;
    const endAngle = currentAngle;

    for (let i = 0; i < params.branchCount; i++) {
      const fanOffset = ((i / (params.branchCount - 1 || 1)) - 0.5) * params.spreadAngle * Math.PI;
      const childAngle = endAngle + fanOffset;
      const childDirection = (i / (params.branchCount - 1 || 1)) * 2 - 1;
      const childHue = (hue + params.hueShift + i * params.hueShift * 0.3) % 1;
      addBranches(currentX, currentY, childAngle, childLength, gen + 1, childHue, childDirection);
    }
  };

  for (let i = 0; i < params.symmetry; i++) {
    const angle = (i / params.symmetry) * Math.PI * 2 - Math.PI / 2;
    addBranches(0, 0, angle, baseLength, 0, params.baseHue, 1);
  }

  return branches;
}

function getEndpoints(branches: Branch[], maxGen: number): Point3D[] {
  const endpoints: Point3D[] = [];
  branches.forEach(branch => {
    if (branch.generation === maxGen - 1) {
      endpoints.push(branch.points[branch.points.length - 1]);
    }
  });
  return endpoints;
}

function renderTunnelLines(
  ctx: CanvasRenderingContext2D,
  frontEndpoints: Point3D[],
  backEndpoints: Point3D[],
  centerX: number, centerY: number,
  focalLength: number, opacity: number, glowIntensity: number
) {
  const count = Math.min(frontEndpoints.length, backEndpoints.length);
  for (let i = 0; i < count; i++) {
    const back = backEndpoints[i];
    const front = frontEndpoints[i];

    ctx.beginPath();
    const segments = 30;
    let started = false;

    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const x = back.x + (front.x - back.x) * t;
      const y = back.y + (front.y - back.y) * t;
      const z = back.z + (front.z - back.z) * t;

      const projected = project(x, y, z, centerX, centerY, focalLength);
      if (!projected) continue;

      if (!started) {
        ctx.moveTo(projected.x, projected.y);
        started = true;
      } else {
        ctx.lineTo(projected.x, projected.y);
      }
    }

    const hue = ((front.hue + back.hue) / 2) * 360;
    ctx.strokeStyle = `hsla(${hue}, 80%, 60%, ${opacity})`;
    ctx.lineWidth = 1;
    ctx.shadowColor = `hsla(${hue}, 80%, 60%, ${glowIntensity * 0.5})`;
    ctx.shadowBlur = 8;
    ctx.stroke();
  }
}

function renderBranches(
  ctx: CanvasRenderingContext2D,
  branches: Branch[],
  centerX: number, centerY: number,
  focalLength: number, lineWidth: number, glowIntensity: number,
  hueOffset: number = 0 // 0 = normal, 0.5 = inverted (180°)
) {
  branches.sort((a, b) => a.generation - b.generation);

  branches.forEach(branch => {
    ctx.beginPath();
    let started = false;

    branch.points.forEach(point => {
      const projected = project(point.x, point.y, point.z, centerX, centerY, focalLength);
      if (!projected) return;

      if (!started) {
        ctx.moveTo(projected.x, projected.y);
        started = true;
      } else {
        ctx.lineTo(projected.x, projected.y);
      }
    });

    const alpha = Math.max(0.2, 1 - branch.generation * 0.15);
    const lightness = 50 + branch.generation * 5;
    const saturation = 90 - branch.generation * 5;
    const width = lineWidth * Math.pow(0.7, branch.generation);
    const hue = ((branch.hue + hueOffset) % 1) * 360;

    ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness}%, ${glowIntensity})`;
    ctx.shadowBlur = 10 + branch.generation * 2;
    ctx.stroke();
  });
}

// Composite inverted fractal through pulse ring masks (only affects lines, not background)
function compositePulseRings(
  ctx: CanvasRenderingContext2D,
  invertedCanvas: HTMLCanvasElement,
  centerX: number, centerY: number,
  pulses: { radius: number; bandWidth: number; opacity: number }[]
) {
  if (pulses.length === 0) return;

  for (const pulse of pulses) {
    ctx.save();

    // Create ring clip path - only the inverted lines within this ring will show
    ctx.beginPath();
    ctx.arc(centerX, centerY, pulse.radius, 0, Math.PI * 2);
    ctx.arc(centerX, centerY, Math.max(0, pulse.radius - pulse.bandWidth), 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();

    // Draw the inverted fractal (transparent bg, so only lines show)
    ctx.globalAlpha = pulse.opacity;
    ctx.drawImage(invertedCanvas, 0, 0);

    ctx.restore();
  }
}

function renderEndpointDots(
  ctx: CanvasRenderingContext2D,
  branches: Branch[],
  maxGen: number,
  centerX: number, centerY: number,
  focalLength: number, elapsed: number
) {
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * Math.PI * 3);

  branches.filter(b => b.generation === maxGen - 1).forEach(branch => {
    const lastPoint = branch.points[branch.points.length - 1];
    const projected = project(lastPoint.x, lastPoint.y, lastPoint.z, centerX, centerY, focalLength);
    if (!projected) return;

    const dotRadius = Math.max(1, (2 + pulse * 1.5) * projected.scale * 0.8);

    ctx.beginPath();
    ctx.arc(projected.x, projected.y, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${branch.hue * 360}, 100%, 70%, 0.9)`;
    ctx.shadowColor = `hsla(${branch.hue * 360}, 100%, 70%, 1)`;
    ctx.shadowBlur = 15;
    ctx.fill();
  });
}


export function FractalTunnel({ state }: FractalTunnelProps) {
  const { viewport } = useThree();
  const bpm = useProjectStore((s) => s.project.bpm);
  const meshRef = useRef<THREE.Mesh>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenNormalRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenInvertedRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const elapsedRef = useRef(0);
  const virtualBeatRef = useRef(0);
  const hueOffsetRef = useRef(0);
  // Track pitch -> startTime to detect both new pitches and re-triggered same pitches
  const prevNoteStartsRef = useRef<Map<number, number>>(new Map());
  // Color pulses - expanding rings of inverted color
  const pulsesRef = useRef<ColorPulse[]>([]);
  const pulseIdRef = useRef(0);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    canvasRef.current = canvas;

    // Offscreen canvases for pulse effect: normal and inverted versions
    const offscreenNormal = document.createElement('canvas');
    offscreenNormal.width = 1024;
    offscreenNormal.height = 1024;
    offscreenNormalRef.current = offscreenNormal;

    const offscreenInverted = document.createElement('canvas');
    offscreenInverted.width = 1024;
    offscreenInverted.height = 1024;
    offscreenInvertedRef.current = offscreenInverted;

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

    elapsedRef.current += delta;
    const elapsed = elapsedRef.current;

    const beatsPerSecond = bpm / 60;
    const deltaBeat = delta * beatsPerSecond * CONFIG.oscSpeed;

    // Detect new note-on events by comparing pitch+startTimeInBeats with previous frame
    const currentNoteStarts = new Map<number, number>();
    let newNoteCount = 0;
    for (const [pitch, note] of state.activeNotes) {
      currentNoteStarts.set(pitch, note.startTimeInBeats);
      const prevStartTime = prevNoteStartsRef.current.get(pitch);
      // New note if: pitch wasn't active before, OR same pitch but different startTimeInBeats (re-triggered)
      if (prevStartTime === undefined || prevStartTime !== note.startTimeInBeats) {
        newNoteCount++;
      }
    }
    // Get params from state (merged instrument defaults + track overrides)
    const visualParams = state.params ?? {};
    const colorPulse = visualParams.colorPulse as boolean ?? false;
    const pulseSpeed = visualParams.pulseSpeed as number ?? 200;
    const pulseBandWidth = visualParams.pulseBandWidth as number ?? 40;
    const pulseFadeDuration = visualParams.pulseFadeDuration as number ?? 2.0;

    // Debug: log when we detect new notes (includes track ID from state)
    if (newNoteCount > 0) {
      console.log('[FractalTunnel]', state.instrumentId, 'New notes:', newNoteCount, 'colorPulse:', colorPulse, 'params:', state.params);
    }

    // Shift hue for each new note-on (default behavior when no pulse)
    if (newNoteCount > 0) {
      if (!colorPulse) {
        // Default: color shift on note
        hueOffsetRef.current = (hueOffsetRef.current + 30 * newNoteCount) % 360;
      }
    }
    prevNoteStartsRef.current = currentNoteStarts;

    // Accumulate virtual beat
    virtualBeatRef.current += deltaBeat;
    const beat = virtualBeatRef.current;

    const params: BranchParams = {
      symmetry: CONFIG.symmetry,
      branchCount: CONFIG.branchCount,
      generations: CONFIG.generations,
      spiralAmount: CONFIG.spiralAmount + Math.sin(beat * Math.PI / 4) * 0.3,
      lengthDecay: CONFIG.lengthDecay + Math.sin(beat * Math.PI / 16 + 2) * 0.15,
      spreadAngle: CONFIG.spreadAngle + Math.sin(beat * Math.PI / 8 + 1) * 0.4,
      hueShift: CONFIG.hueShift,
      baseHue: (CONFIG.baseHue + beat / 64 + hueOffsetRef.current / 360) % 1,
    };

    // Spawn color pulses on note-on when enabled
    if (colorPulse && newNoteCount > 0) {
      console.log('[FractalTunnel] Spawning pulse! colorPulse:', colorPulse, 'activePulses:', pulsesRef.current.length + 1);
      pulsesRef.current.push({
        id: pulseIdRef.current++,
        spawnTime: elapsed,
      });
    }

    // Update pulses and build active pulse list for rendering
    const activePulses: { radius: number; bandWidth: number; opacity: number }[] = [];
    if (colorPulse) {
      pulsesRef.current = pulsesRef.current.filter(pulse => {
        const age = elapsed - pulse.spawnTime;
        const radius = age * pulseSpeed;
        const opacity = Math.max(0, 1 - age / pulseFadeDuration);

        if (opacity <= 0) return false;

        activePulses.push({ radius, bandWidth: pulseBandWidth, opacity });
        return true;
      });
    }

    const frontBranches = generateBranches(
      CONFIG.baseLength, CONFIG.frontFlowerZ, 1, params, 1
    );
    const backBranches = generateBranches(
      CONFIG.baseLength, CONFIG.backFlowerZ, CONFIG.backFlowerScale, params, 1
    );

    const frontEndpoints = getEndpoints(frontBranches, CONFIG.generations);
    const backEndpoints = getEndpoints(backBranches, CONFIG.generations);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const offscreenNormal = offscreenNormalRef.current;
    const offscreenInverted = offscreenInvertedRef.current;
    const normalCtx = offscreenNormal?.getContext('2d');
    const invertedCtx = offscreenInverted?.getContext('2d');

    const hasPulses = activePulses.length > 0;

    if (hasPulses && offscreenNormal && offscreenInverted && normalCtx && invertedCtx) {
      // Render normal fractal to offscreen (transparent background)
      normalCtx.clearRect(0, 0, offscreenNormal.width, offscreenNormal.height);
      renderTunnelLines(normalCtx, frontEndpoints, backEndpoints, centerX, centerY,
        CONFIG.focalLength, CONFIG.tunnelLineOpacity, CONFIG.glowIntensity);
      renderBranches(normalCtx, backBranches, centerX, centerY,
        CONFIG.focalLength, CONFIG.lineWidth, CONFIG.glowIntensity, 0);
      renderBranches(normalCtx, frontBranches, centerX, centerY,
        CONFIG.focalLength, CONFIG.lineWidth, CONFIG.glowIntensity, 0);
      renderEndpointDots(normalCtx, frontBranches, CONFIG.generations, centerX, centerY,
        CONFIG.focalLength, elapsed);
      normalCtx.shadowBlur = 0;

      // Render inverted fractal to offscreen (transparent background, hue +180°)
      invertedCtx.clearRect(0, 0, offscreenInverted.width, offscreenInverted.height);
      renderTunnelLines(invertedCtx, frontEndpoints, backEndpoints, centerX, centerY,
        CONFIG.focalLength, CONFIG.tunnelLineOpacity, CONFIG.glowIntensity);
      renderBranches(invertedCtx, backBranches, centerX, centerY,
        CONFIG.focalLength, CONFIG.lineWidth, CONFIG.glowIntensity, 0.5);
      renderBranches(invertedCtx, frontBranches, centerX, centerY,
        CONFIG.focalLength, CONFIG.lineWidth, CONFIG.glowIntensity, 0.5);
      renderEndpointDots(invertedCtx, frontBranches, CONFIG.generations, centerX, centerY,
        CONFIG.focalLength, elapsed);
      invertedCtx.shadowBlur = 0;

      // Composite: background + normal fractal + inverted rings
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreenNormal, 0, 0);

      // Draw inverted fractal only within pulse ring areas
      compositePulseRings(ctx, offscreenInverted, centerX, centerY, activePulses);
    } else {
      // No pulses - fast path, render directly
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      renderTunnelLines(ctx, frontEndpoints, backEndpoints, centerX, centerY,
        CONFIG.focalLength, CONFIG.tunnelLineOpacity, CONFIG.glowIntensity);
      renderBranches(ctx, backBranches, centerX, centerY,
        CONFIG.focalLength, CONFIG.lineWidth, CONFIG.glowIntensity);
      renderBranches(ctx, frontBranches, centerX, centerY,
        CONFIG.focalLength, CONFIG.lineWidth, CONFIG.glowIntensity);
      renderEndpointDots(ctx, frontBranches, CONFIG.generations, centerX, centerY,
        CONFIG.focalLength, elapsed);

      ctx.shadowBlur = 0;
    }

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
