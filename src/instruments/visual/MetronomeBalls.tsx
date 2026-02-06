'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { Instrument } from '../types';

interface MetronomeBallsProps {
  trackId: string;
}

// Spec colors
const COL_FG = 0x1a2744;     // deep ink blue
const COL_ACCENT = 0xb5563e; // warm terracotta
const COL_MASK = 0xf5f2eb;   // paper white

const DEFAULTS = {
  balls: 24,
  kickStart: 37,      // degrees
  snareStart: 53,     // degrees
  kickStep: 1.5,      // degrees per trigger
  snareStep: 1.0,     // degrees per trigger
  speed: 2,
  dotSize: 2,
  lineOpacity: 0.2,
  bgMultiplier: 8,
};

// Simulation constants
const SIM_BEATS = 200;
const STEPS_PER_BEAT = 30;
const BG_BALLS = 32;
const BG_SPEED = 3;
const BG_LINE_OPACITY = 0.12;
const BG_SCALE = 1.8;
const PATTERN_EXTENT = 500; // pattern-space half-size
const MAX_EXTENT = PATTERN_EXTENT * 2; // ball cutoff distance

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

interface Trajectory {
  points: Float32Array; // interleaved x,y pairs
  count: number;        // number of points
}

/** Precompute all ball trajectories for the metronome pattern */
function computePattern(
  balls: number,
  kickAngle: number,  // radians
  snareAngle: number, // radians
  baseSpeed: number,
): Trajectory[] {
  const result: Trajectory[] = [];
  const maxPoints = SIM_BEATS * STEPS_PER_BEAT + 1;

  for (let i = 0; i < balls; i++) {
    let angle = (i / balls) * Math.PI * 2;
    let x = 0;
    let y = 0;
    const pts = new Float32Array(maxPoints * 2);
    pts[0] = 0;
    pts[1] = 0;
    let count = 1;
    let alive = true;

    for (let beat = 0; beat < SIM_BEATS && alive; beat++) {
      const bim = beat % 4;
      let speed: number;
      if (bim === 0 || bim === 2) {
        angle += kickAngle;
        speed = Math.abs(baseSpeed);
      } else {
        angle -= snareAngle;
        speed = -Math.abs(baseSpeed);
      }
      const dx = Math.cos(angle) * speed;
      const dy = Math.sin(angle) * speed;

      for (let s = 0; s < STEPS_PER_BEAT && alive; s++) {
        x += dx;
        y += dy;
        if (Math.abs(x) > MAX_EXTENT || Math.abs(y) > MAX_EXTENT) {
          alive = false;
        } else {
          pts[count * 2] = x;
          pts[count * 2 + 1] = y;
          count++;
        }
      }
    }

    result.push({ points: pts, count });
  }
  return result;
}

/** Build THREE.Line objects from trajectories and add to group */
function buildLines(
  parent: THREE.Group,
  trajectories: Trajectory[],
  scale: number,
  color: number,
  opacity: number,
  dotSize: number,
  disposables: (() => void)[],
) {
  for (const traj of trajectories) {
    if (traj.count < 2) continue;

    // Line
    const positions = new Float32Array(traj.count * 3);
    for (let i = 0; i < traj.count; i++) {
      positions[i * 3] = traj.points[i * 2] * scale;
      positions[i * 3 + 1] = traj.points[i * 2 + 1] * scale;
      positions[i * 3 + 2] = 0;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const line = new THREE.Line(geom, mat);
    parent.add(line);
    disposables.push(() => { geom.dispose(); mat.dispose(); });

    // Dot at final position
    const lx = traj.points[(traj.count - 1) * 2] * scale;
    const ly = traj.points[(traj.count - 1) * 2 + 1] * scale;
    const dotGeom = new THREE.CircleGeometry(dotSize * scale * 0.5, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color, depthWrite: false });
    const dot = new THREE.Mesh(dotGeom, dotMat);
    dot.position.set(lx, ly, 0.01);
    parent.add(dot);
    disposables.push(() => { dotGeom.dispose(); dotMat.dispose(); });
  }
}

function MetronomeBallsVisual({ trackId }: MetronomeBallsProps) {
  const rootRef = useRef<THREE.Group>(null);
  const engineRef = useRef(getVisualPlaybackEngine());
  const lastNoteOnCountRef = useRef(0);
  const initRef = useRef(false);

  // Mutable angle state
  const fgKickAngle = useRef(0);
  const fgSnareAngle = useRef(0);
  const bgKickAngle = useRef(0);
  const bgSnareAngle = useRef(0);
  const bgRotation = useRef(0);

  // Track params to detect changes
  const prevParamsRef = useRef('');

  // Disposable cleanup functions
  const disposablesRef = useRef<(() => void)[]>([]);

  const { viewport } = useThree();

  function clearScene() {
    for (const fn of disposablesRef.current) fn();
    disposablesRef.current = [];
    const root = rootRef.current;
    if (!root) return;
    // Remove all children recursively
    while (root.children.length > 0) {
      root.remove(root.children[0]);
    }
  }

  function buildScene(p: {
    balls: number; kickStep: number; snareStep: number;
    speed: number; dotSize: number; lineOpacity: number; bgMultiplier: number;
  }) {
    const root = rootRef.current;
    if (!root) return;
    clearScene();

    const vw = viewport.width;
    const vh = viewport.height;
    const panelWidth = vw / 3;
    const fgScale = panelWidth / PATTERN_EXTENT;

    // === 1. Background flower (z = -0.5, renderOrder 0) ===
    const bgGroup = new THREE.Group();
    bgGroup.renderOrder = 0;
    bgGroup.position.z = -0.5;
    bgGroup.rotation.z = bgRotation.current;

    const bgS = fgScale * BG_SCALE;
    const bgTrajs = computePattern(BG_BALLS, bgKickAngle.current, bgSnareAngle.current, BG_SPEED);
    buildLines(bgGroup, bgTrajs, bgS, COL_ACCENT, BG_LINE_OPACITY, p.dotSize, disposablesRef.current);
    root.add(bgGroup);

    // === 2. Compute foreground trajectories (shared by all 3 panels) ===
    const fgTrajs = computePattern(p.balls, fgKickAngle.current, fgSnareAngle.current, p.speed);

    // Compute bounding box of foreground pattern
    let bbMinX = Infinity, bbMinY = Infinity, bbMaxX = -Infinity, bbMaxY = -Infinity;
    for (const t of fgTrajs) {
      for (let i = 0; i < t.count; i++) {
        const px = t.points[i * 2];
        const py = t.points[i * 2 + 1];
        if (px < bbMinX) bbMinX = px;
        if (py < bbMinY) bbMinY = py;
        if (px > bbMaxX) bbMaxX = px;
        if (py > bbMaxY) bbMaxY = py;
      }
    }
    // Add padding (10 pattern-units)
    const pad = 10;
    bbMinX -= pad; bbMinY -= pad; bbMaxX += pad; bbMaxY += pad;
    const maskW = (bbMaxX - bbMinX) * fgScale;
    const maskH = (bbMaxY - bbMinY) * fgScale;
    const maskCx = ((bbMaxX + bbMinX) / 2) * fgScale;
    const maskCy = ((bbMaxY + bbMinY) / 2) * fgScale;

    // === 3. Mask rectangles (z = -0.25, renderOrder 1) ===
    for (let pi = 0; pi < 3; pi++) {
      const panelX = (pi - 1) * panelWidth;
      const mGeom = new THREE.PlaneGeometry(maskW, maskH);
      const mMat = new THREE.MeshBasicMaterial({ color: COL_MASK, depthWrite: false });
      const mask = new THREE.Mesh(mGeom, mMat);
      mask.renderOrder = 1;
      mask.position.set(panelX + maskCx, maskCy, -0.25);
      root.add(mask);
      disposablesRef.current.push(() => { mGeom.dispose(); mMat.dispose(); });
    }

    // === 4. Foreground panels (z = 0, renderOrder 2) ===
    for (let pi = 0; pi < 3; pi++) {
      const panelGroup = new THREE.Group();
      panelGroup.renderOrder = 2;
      panelGroup.position.x = (pi - 1) * panelWidth;
      buildLines(panelGroup, fgTrajs, fgScale, COL_FG, p.lineOpacity, p.dotSize, disposablesRef.current);
      root.add(panelGroup);
    }
  }

  useFrame(() => {
    const root = rootRef.current;
    if (!root) return;
    const state = engineRef.current.getTrackState(trackId);
    if (!state) return;

    const balls = (state.params.balls as number) ?? DEFAULTS.balls;
    const kickStep = (state.params.kickStep as number) ?? DEFAULTS.kickStep;
    const snareStep = (state.params.snareStep as number) ?? DEFAULTS.snareStep;
    const speed = (state.params.speed as number) ?? DEFAULTS.speed;
    const dotSize = (state.params.dotSize as number) ?? DEFAULTS.dotSize;
    const lineOpacity = (state.params.lineOpacity as number) ?? DEFAULTS.lineOpacity;
    const bgMultiplier = (state.params.bgMultiplier as number) ?? DEFAULTS.bgMultiplier;

    const p = { balls, kickStep, snareStep, speed, dotSize, lineOpacity, bgMultiplier };

    // Check if params changed (rebuild without angle change)
    const paramsKey = `${balls},${speed},${dotSize},${lineOpacity},${bgMultiplier}`;

    // Initial build
    if (!initRef.current) {
      initRef.current = true;
      const kickStart = (state.params.kickStart as number) ?? DEFAULTS.kickStart;
      const snareStart = (state.params.snareStart as number) ?? DEFAULTS.snareStart;
      fgKickAngle.current = deg2rad(kickStart);
      fgSnareAngle.current = deg2rad(snareStart);
      bgKickAngle.current = deg2rad(kickStart);
      bgSnareAngle.current = deg2rad(snareStart);
      prevParamsRef.current = paramsKey;
      buildScene(p);
      return;
    }

    // Rebuild on param change
    if (paramsKey !== prevParamsRef.current) {
      prevParamsRef.current = paramsKey;
      buildScene(p);
      return;
    }

    // Detect note-on events (any drum hit acts as trigger)
    const rawDelta = state.noteOnCount - lastNoteOnCountRef.current;
    lastNoteOnCountRef.current = state.noteOnCount;

    if (rawDelta > 0 && rawDelta <= 8) {
      const kicks = Math.min(rawDelta, 4);
      for (let k = 0; k < kicks; k++) {
        // Foreground: increment angles
        fgKickAngle.current += deg2rad(kickStep);
        fgSnareAngle.current += deg2rad(snareStep);

        // Background: tick bgMultiplier times per kick
        for (let b = 0; b < bgMultiplier; b++) {
          bgKickAngle.current += deg2rad(kickStep);
          bgSnareAngle.current += deg2rad(snareStep);
          bgRotation.current += (Math.PI * 2) / 32;
        }
      }
      buildScene(p);
    }
  });

  useEffect(() => {
    return () => clearScene();
  }, []);

  return <group ref={rootRef} />;
}

export const MetronomeBalls: Instrument = {
  id: 'metronomeBalls',
  name: 'Metronome Balls',
  description: 'Generative line-drawing patterns driven by drum MIDI input — three panels with a rotating background flower',
  icon: '◉',
  color: '#1a2744',
  hasAudio: false,
  hasVisual: true,
  editorType: 'generic',

  defaultSettings: {
    balls: DEFAULTS.balls,
    kickStart: DEFAULTS.kickStart,
    snareStart: DEFAULTS.snareStart,
    kickStep: DEFAULTS.kickStep,
    snareStep: DEFAULTS.snareStep,
    speed: DEFAULTS.speed,
    dotSize: DEFAULTS.dotSize,
    lineOpacity: DEFAULTS.lineOpacity,
    bgMultiplier: DEFAULTS.bgMultiplier,
  },

  settingsSchema: {
    balls: { type: 'number', label: 'Balls', min: 1, max: 80, step: 1, default: DEFAULTS.balls },
    kickStart: { type: 'number', label: 'Kick Start (°)', min: 1, max: 180, step: 1, default: DEFAULTS.kickStart },
    snareStart: { type: 'number', label: 'Snare Start (°)', min: 1, max: 180, step: 1, default: DEFAULTS.snareStart },
    kickStep: { type: 'number', label: 'Kick Step (°)', min: -10, max: 10, step: 0.1, default: DEFAULTS.kickStep },
    snareStep: { type: 'number', label: 'Snare Step (°)', min: -10, max: 10, step: 0.1, default: DEFAULTS.snareStep },
    speed: { type: 'number', label: 'Speed', min: 0.5, max: 8, step: 0.1, default: DEFAULTS.speed },
    dotSize: { type: 'number', label: 'Dot Size', min: 0.5, max: 8, step: 0.5, default: DEFAULTS.dotSize },
    lineOpacity: { type: 'number', label: 'Line Opacity', min: 0.02, max: 0.6, step: 0.02, default: DEFAULTS.lineOpacity },
    bgMultiplier: {
      type: 'select', label: 'BG Multiplier',
      options: [
        { value: 2, label: '2x' },
        { value: 4, label: '4x' },
        { value: 8, label: '8x' },
        { value: 16, label: '16x' },
      ],
      default: DEFAULTS.bgMultiplier,
    },
  },

  VisualComponent: MetronomeBallsVisual,
};
