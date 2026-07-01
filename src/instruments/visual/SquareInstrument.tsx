'use client';

import { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { virtualClock } from '@/core/virtualClock';
import { Instrument } from '../types';

// MIDI pitch assignments
const RETURN_ORIGIN_PITCH = 36;  // C2
const MOVE_LEFT_PITCH = 37;      // C#2
const MOVE_UP_PITCH = 38;        // D2
const MOVE_RIGHT_PITCH = 39;     // D#2
const MOVE_DOWN_PITCH = 40;      // E2
const STOP_MOVE_PITCH = 41;      // F2
const ROTATE_LEFT_PITCH = 42;    // F#2
const ROTATE_RIGHT_PITCH = 43;   // G2
const STOP_ROTATE_PITCH = 44;    // G#2
const SPLIT_PITCH = 45;          // A2
const UNSPLIT_PITCH = 46;        // A#2

const PITCH_MIN = RETURN_ORIGIN_PITCH;
const PITCH_MAX = UNSPLIT_PITCH;

const DEFAULTS = {
  squareSize: 0.3,
  lineWidth: 3,
  moveSpeed: 2,
  rotateSpeed: 1.5,
  splitSpeed: 4,
  splitDistance: 0.4,
  offsetX: 0,
  offsetY: 0,
  bgColor: '#8B00FF',
  bgOpacity: 1,
  lineColor: '#000000',
};

function SquareVisual({ trackId }: { trackId: string }) {
  const engineRef = useRef(getVisualPlaybackEngine());
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();
  const [ready, setReady] = useState(false);
  const lastTimeRef = useRef(-1);

  // State refs
  const posXRef = useRef(0);
  const posYRef = useRef(0);
  const velXRef = useRef(0);
  const velYRef = useRef(0);
  const rotationRef = useRef(0);
  const rotVelRef = useRef(0);
  const splitAmountRef = useRef(0); // 0 = together, 1 = fully split
  const splitTargetRef = useRef(0); // 0 or 1

  // Seek detection
  const prevSeekGenRef = useRef(0);

  // Edge detection refs
  const prevCounts = useRef(new Map<number, number>());

  // Mesh refs
  const topLineRef = useRef<THREE.LineSegments | null>(null);
  const bottomLineRef = useRef<THREE.LineSegments | null>(null);
  const bgMeshRef = useRef<THREE.Mesh | null>(null);
  const topLineMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const bottomLineMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const bgMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);

  useEffect(() => {
    // Background plane
    const bgGeo = new THREE.PlaneGeometry(1, 1);
    const bgMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(DEFAULTS.bgColor),
      transparent: true,
      opacity: DEFAULTS.bgOpacity,
      depthWrite: false,
    });
    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    bgMesh.position.z = -0.01;
    bgMeshRef.current = bgMesh;
    bgMaterialRef.current = bgMat;

    // Square line geometry - split into top half and bottom half
    // Top half: top edge + upper portions of left and right edges
    const topPositions = new Float32Array([
      // Top edge: TL -> TR
      -0.5, 0.5, 0, 0.5, 0.5, 0,
      // Left edge upper: TL -> midpoint
      -0.5, 0.5, 0, -0.5, 0, 0,
      // Right edge upper: TR -> midpoint
      0.5, 0.5, 0, 0.5, 0, 0,
      // Middle edge (visible when split): left mid -> right mid
      -0.5, 0, 0, 0.5, 0, 0,
    ]);

    // Bottom half: bottom edge + lower portions of left and right edges
    const bottomPositions = new Float32Array([
      // Bottom edge: BL -> BR
      -0.5, -0.5, 0, 0.5, -0.5, 0,
      // Left edge lower: midpoint -> BL
      -0.5, 0, 0, -0.5, -0.5, 0,
      // Right edge lower: midpoint -> BR
      0.5, 0, 0, 0.5, -0.5, 0,
      // Middle edge (visible when split): left mid -> right mid
      -0.5, 0, 0, 0.5, 0, 0,
    ]);

    const topGeo = new THREE.BufferGeometry();
    topGeo.setAttribute('position', new THREE.BufferAttribute(topPositions, 3));
    const topMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 });
    const topLine = new THREE.LineSegments(topGeo, topMat);
    topLineRef.current = topLine;
    topLineMaterialRef.current = topMat;

    const bottomGeo = new THREE.BufferGeometry();
    bottomGeo.setAttribute('position', new THREE.BufferAttribute(bottomPositions, 3));
    const bottomMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 });
    const bottomLine = new THREE.LineSegments(bottomGeo, bottomMat);
    bottomLineRef.current = bottomLine;
    bottomLineMaterialRef.current = bottomMat;

    setReady(true);

    return () => {
      bgGeo.dispose();
      bgMat.dispose();
      topGeo.dispose();
      topMat.dispose();
      bottomGeo.dispose();
      bottomMat.dispose();
    };
  }, []);

  // Add meshes to group
  useEffect(() => {
    if (!ready || !groupRef.current) return;
    const g = groupRef.current;
    if (bgMeshRef.current) g.add(bgMeshRef.current);
    if (topLineRef.current) g.add(topLineRef.current);
    if (bottomLineRef.current) g.add(bottomLineRef.current);

    return () => {
      if (bgMeshRef.current) g.remove(bgMeshRef.current);
      if (topLineRef.current) g.remove(topLineRef.current);
      if (bottomLineRef.current) g.remove(bottomLineRef.current);
    };
  }, [ready]);

  useFrame(() => {
    const state = engineRef.current.getTrackState(trackId);
    if (!state) return;

    // Seek detection: reset accumulated state
    if (state.seekGeneration !== prevSeekGenRef.current) {
      prevSeekGenRef.current = state.seekGeneration;
      prevCounts.current = new Map(state.pitchNoteOnCounts);
      posXRef.current = 0;
      posYRef.current = 0;
      velXRef.current = 0;
      velYRef.current = 0;
      rotationRef.current = 0;
      rotVelRef.current = 0;
      splitAmountRef.current = 0;
      splitTargetRef.current = 0;
      lastTimeRef.current = -1;
    }

    const squareSize = (state.params.squareSize as number) ?? DEFAULTS.squareSize;
    const moveSpeed = (state.params.moveSpeed as number) ?? DEFAULTS.moveSpeed;
    const rotateSpeed = (state.params.rotateSpeed as number) ?? DEFAULTS.rotateSpeed;
    const splitSpeed = (state.params.splitSpeed as number) ?? DEFAULTS.splitSpeed;
    const splitDistance = (state.params.splitDistance as number) ?? DEFAULTS.splitDistance;
    const offsetX = (state.params.offsetX as number) ?? DEFAULTS.offsetX;
    const offsetY = (state.params.offsetY as number) ?? DEFAULTS.offsetY;
    const bgColor = (state.params.bgColor as string) ?? DEFAULTS.bgColor;
    const bgOpacity = (state.params.bgOpacity as number) ?? DEFAULTS.bgOpacity;
    const lineColor = (state.params.lineColor as string) ?? DEFAULTS.lineColor;

    const now = virtualClock.now() / 1000;
    const dt = lastTimeRef.current < 0 ? 0 : now - lastTimeRef.current;
    lastTimeRef.current = now;

    const vMin = Math.min(viewport.width, viewport.height);
    const scale = vMin * squareSize;

    // Edge detection helper
    const wasTriggered = (pitch: number): boolean => {
      const count = state.pitchNoteOnCounts.get(pitch) ?? 0;
      const prev = prevCounts.current.get(pitch) ?? 0;
      prevCounts.current.set(pitch, count);
      return count > prev;
    };

    // Process MIDI triggers
    if (wasTriggered(RETURN_ORIGIN_PITCH)) {
      posXRef.current = 0;
      posYRef.current = 0;
      velXRef.current = 0;
      velYRef.current = 0;
    }
    if (wasTriggered(MOVE_LEFT_PITCH)) {
      velXRef.current = -moveSpeed;
    }
    if (wasTriggered(MOVE_UP_PITCH)) {
      velYRef.current = moveSpeed;
    }
    if (wasTriggered(MOVE_RIGHT_PITCH)) {
      velXRef.current = moveSpeed;
    }
    if (wasTriggered(MOVE_DOWN_PITCH)) {
      velYRef.current = -moveSpeed;
    }
    if (wasTriggered(STOP_MOVE_PITCH)) {
      velXRef.current = 0;
      velYRef.current = 0;
    }
    if (wasTriggered(ROTATE_LEFT_PITCH)) {
      rotVelRef.current = rotateSpeed;
    }
    if (wasTriggered(ROTATE_RIGHT_PITCH)) {
      rotVelRef.current = -rotateSpeed;
    }
    if (wasTriggered(STOP_ROTATE_PITCH)) {
      rotVelRef.current = 0;
    }
    if (wasTriggered(SPLIT_PITCH)) {
      splitTargetRef.current = 1;
    }
    if (wasTriggered(UNSPLIT_PITCH)) {
      splitTargetRef.current = 0;
    }

    // Update position
    posXRef.current += velXRef.current * dt;
    posYRef.current += velYRef.current * dt;

    // Update rotation
    rotationRef.current += rotVelRef.current * dt;

    // Update split (smooth lerp)
    const splitLerp = 1 - Math.exp(-splitSpeed * dt);
    splitAmountRef.current += (splitTargetRef.current - splitAmountRef.current) * splitLerp;

    const splitOffset = splitAmountRef.current * splitDistance * vMin * 0.5;

    // Update background
    if (bgMeshRef.current && bgMaterialRef.current) {
      bgMaterialRef.current.color.set(bgColor);
      bgMaterialRef.current.opacity = bgOpacity;
      bgMeshRef.current.scale.set(viewport.width, viewport.height, 1);
      bgMeshRef.current.position.set(offsetX * vMin, offsetY * vMin, -0.01);
    }

    // Update line colors
    if (topLineMaterialRef.current) {
      topLineMaterialRef.current.color.set(lineColor);
    }
    if (bottomLineMaterialRef.current) {
      bottomLineMaterialRef.current.color.set(lineColor);
    }

    // Position the square halves
    const baseX = posXRef.current + offsetX * vMin;
    const baseY = posYRef.current + offsetY * vMin;

    if (topLineRef.current) {
      topLineRef.current.position.set(baseX, baseY + splitOffset, 0);
      topLineRef.current.rotation.z = rotationRef.current;
      topLineRef.current.scale.set(scale, scale, 1);
    }
    if (bottomLineRef.current) {
      bottomLineRef.current.position.set(baseX, baseY - splitOffset, 0);
      bottomLineRef.current.rotation.z = rotationRef.current;
      bottomLineRef.current.scale.set(scale, scale, 1);
    }
  });

  if (!ready) return null;
  return <group ref={groupRef} />;
}

export const SquareInstrument: Instrument = {
  id: 'squareInstrument',
  name: 'Square',
  description: 'Black square outline on purple background with MIDI-controlled movement, rotation, and split',
  icon: '⬛',
  color: '#8B00FF',
  hasAudio: false,
  hasVisual: true,
  editorType: 'generic',
  noteRange: { min: PITCH_MIN, max: PITCH_MAX },
  rangeLabels: [
    { startPitch: RETURN_ORIGIN_PITCH, endPitch: RETURN_ORIGIN_PITCH, label: 'Return to Origin' },
    { startPitch: MOVE_LEFT_PITCH, endPitch: MOVE_LEFT_PITCH, label: 'Move Left' },
    { startPitch: MOVE_UP_PITCH, endPitch: MOVE_UP_PITCH, label: 'Move Up' },
    { startPitch: MOVE_RIGHT_PITCH, endPitch: MOVE_RIGHT_PITCH, label: 'Move Right' },
    { startPitch: MOVE_DOWN_PITCH, endPitch: MOVE_DOWN_PITCH, label: 'Move Down' },
    { startPitch: STOP_MOVE_PITCH, endPitch: STOP_MOVE_PITCH, label: 'Stop Movement' },
    { startPitch: ROTATE_LEFT_PITCH, endPitch: ROTATE_LEFT_PITCH, label: 'Rotate Left' },
    { startPitch: ROTATE_RIGHT_PITCH, endPitch: ROTATE_RIGHT_PITCH, label: 'Rotate Right' },
    { startPitch: STOP_ROTATE_PITCH, endPitch: STOP_ROTATE_PITCH, label: 'Stop Rotating' },
    { startPitch: SPLIT_PITCH, endPitch: SPLIT_PITCH, label: 'Split' },
    { startPitch: UNSPLIT_PITCH, endPitch: UNSPLIT_PITCH, label: 'Unsplit' },
  ],

  defaultSettings: { ...DEFAULTS },

  settingsSchema: {
    squareSize: {
      type: 'number',
      label: 'Square Size',
      min: 0.05,
      max: 1,
      step: 0.05,
      default: DEFAULTS.squareSize,
    },
    moveSpeed: {
      type: 'number',
      label: 'Move Speed',
      min: 0.1,
      max: 10,
      step: 0.1,
      default: DEFAULTS.moveSpeed,
    },
    rotateSpeed: {
      type: 'number',
      label: 'Rotate Speed',
      min: 0.1,
      max: 10,
      step: 0.1,
      default: DEFAULTS.rotateSpeed,
    },
    splitSpeed: {
      type: 'number',
      label: 'Split Speed',
      min: 0.5,
      max: 20,
      step: 0.5,
      default: DEFAULTS.splitSpeed,
    },
    splitDistance: {
      type: 'number',
      label: 'Split Distance',
      min: 0.05,
      max: 1,
      step: 0.05,
      default: DEFAULTS.splitDistance,
    },
    offsetX: {
      type: 'number',
      label: 'X Offset',
      min: -2,
      max: 2,
      step: 0.05,
      default: DEFAULTS.offsetX,
    },
    offsetY: {
      type: 'number',
      label: 'Y Offset',
      min: -2,
      max: 2,
      step: 0.05,
      default: DEFAULTS.offsetY,
    },
    bgColor: {
      type: 'color',
      label: 'Background Color',
      default: DEFAULTS.bgColor,
    },
    bgOpacity: {
      type: 'number',
      label: 'Background Opacity',
      min: 0,
      max: 1,
      step: 0.05,
      default: DEFAULTS.bgOpacity,
    },
    lineColor: {
      type: 'color',
      label: 'Line Color',
      default: DEFAULTS.lineColor,
    },
  },

  colorRoleMapping: [
    { role: 'background', param: 'bgColor', type: 'hex' },
    { role: 'primary', param: 'lineColor', type: 'hex' },
  ],

  VisualComponent: SquareVisual,
};
