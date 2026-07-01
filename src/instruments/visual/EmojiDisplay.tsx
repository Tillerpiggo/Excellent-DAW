'use client';

import { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { virtualClock } from '@/core/virtualClock';
import { Instrument } from '../types';

// MIDI pitch assignments - trigger rows below emoji selector
const SWITCH_CORNERS_PITCH = 35; // B1
const SWAP_HALVES_PITCH = 34; // A#1
const ROTATE_CW_PITCH = 33; // A1
const ROTATE_CCW_PITCH = 32; // G#1
const FLIP_AXIS_PITCH = 31; // G1
const DEPTH_3D_PITCH = 30; // F#1
const WHOLE_180_PITCH = 29; // F1
const TOP_ROW_CW_PITCH = 28; // E1
const TOP_ROW_CCW_PITCH = 27; // D#1
const BOTTOM_ROW_CW_PITCH = 26; // D1
const BOTTOM_ROW_CCW_PITCH = 25; // C#1

const EMOJI_PITCH_MIN = 36; // C2 - first emoji selector
const EMOJI_PITCH_MAX = 83; // B5

const PITCH_MIN = BOTTOM_ROW_CCW_PITCH;

const NUM_TRAIL = 6; // trail copies per emoji for 3D effect
const TRAIL_MAX_Z = 3; // max Z distance towards camera
const TRAIL_SPEED = 1.5; // how fast trails cycle through Z
const PITCH_MAX = EMOJI_PITCH_MAX;

const NUM_EMOJIS = 8;

const DEFAULT_EMOJIS =
  '😀 😎 🔥 💀 👻 🎉 🌈 ⭐ 💖 🎵 🚀 🌊 🍕 🎸 👑 💎 🦋 🌺 🎭 🤖 👽 🦄 🐉 🌙 ' +
  '🎪 🧊 🫧 🪩 🎯 🧿 🔮 🪬 🫀 🧠 👁️ 🦑 🐙 🪸 🍄 🌵 🪻 🫠 🥶 🤯 🥳 😈 🤡 🛸';

const DEFAULTS = {
  emojis: DEFAULT_EMOJIS,
  fontSize: 0.15,
  opacity: 1,
  moveSpeed: 8,
  padding: 0.1,
  spread: 1,
};

const CANVAS_SIZE = 512;

const canvasCache = new Map<string, HTMLCanvasElement>();
const CACHE_MAX = 64;

function createEmojiCanvas(token: string, size: number): HTMLCanvasElement {
  const key = `${token}|${size}`;
  const cached = canvasCache.get(key);
  if (cached) return cached;

  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  let fontSize = size * 0.6;
  ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

  const maxWidth = size * 0.9;
  const measured = ctx.measureText(token);
  if (measured.width > maxWidth) {
    fontSize *= maxWidth / measured.width;
    ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(token, size / 2, size / 2);

  if (canvasCache.size >= CACHE_MAX) {
    const firstKey = canvasCache.keys().next().value!;
    canvasCache.delete(firstKey);
  }
  canvasCache.set(key, canvas);
  return canvas;
}

// Corner indices within a 2x2 half: TL=0, TR=1, BL=2, BR=3
// Corner offsets from half center (dx, dy multipliers)
const CORNER_SIGNS: [number, number][] = [
  [-1, 1], // TL
  [1, 1], // TR
  [-1, -1], // BL
  [1, -1], // BR
];

interface TrailEntity {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

interface EmojiEntity {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  lastToken: string;
  currentX: number;
  currentY: number;
  trails: TrailEntity[];
}

function EmojiDisplayVisual({ trackId }: { trackId: string }) {
  const engineRef = useRef(getVisualPlaybackEngine());
  const entitiesRef = useRef<EmojiEntity[]>([]);
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();
  const [ready, setReady] = useState(false);
  const lastTimeRef = useRef(-1);

  // Logical state: which emoji index occupies each corner of each half
  // Indices into the 8-emoji array
  const leftCornersRef = useRef([0, 1, 2, 3]); // TL, TR, BL, BR
  const rightCornersRef = useRef([4, 5, 6, 7]);
  const halvesSwappedRef = useRef(false);
  const verticalRef = useRef(false);

  // 3D depth effect state
  const depthPhaseRef = useRef(0); // cycles 0→1 continuously while held
  const depthFadeRef = useRef(0); // 0 = hidden, 1 = fully visible (smoothly transitions)

  // Whole structure and row rotation state (multiples of 90°: 0,1,2,3)
  const whole180Ref = useRef(false); // toggled each hit
  const topRowAngleRef = useRef(0); // 0,1,2,3 = 0°,90°,180°,270° CW
  const bottomRowAngleRef = useRef(0);

  // Edge detection for trigger rows
  const prevCornersCount = useRef(0);
  const prevSwapCount = useRef(0);
  const prevCWCount = useRef(0);
  const prevCCWCount = useRef(0);
  const prevFlipCount = useRef(0);
  const prevWhole180Count = useRef(0);
  const prevTopCWCount = useRef(0);
  const prevTopCCWCount = useRef(0);
  const prevBottomCWCount = useRef(0);
  const prevBottomCCWCount = useRef(0);

  // Seek detection
  const prevSeekGenRef = useRef(0);

  // Emoji selector state
  const prevEmojiCounts = useRef(new Map<number, number>());
  const currentTokenRef = useRef('😀');

  useEffect(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const entities: EmojiEntity[] = [];

    for (let i = 0; i < NUM_EMOJIS; i++) {
      const tex = new THREE.CanvasTexture(createEmojiCanvas('😀', CANVAS_SIZE));
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);

      // Create trail copies for 3D depth effect
      const trails: TrailEntity[] = [];
      for (let t = 0; t < NUM_TRAIL; t++) {
        const trailMat = new THREE.MeshBasicMaterial({
          map: tex, // share texture with parent
          transparent: true,
          depthWrite: false,
          opacity: 0,
        });
        const trailMesh = new THREE.Mesh(geo, trailMat);
        trailMesh.visible = false;
        trails.push({ mesh: trailMesh, material: trailMat });
      }

      entities.push({
        mesh,
        material: mat,
        texture: tex,
        lastToken: '',
        currentX: 0,
        currentY: 0,
        trails,
      });
    }
    entitiesRef.current = entities;
    setReady(true);

    return () => {
      for (const e of entities) {
        e.texture.dispose();
        e.material.dispose();
        for (const tr of e.trails) {
          tr.material.dispose();
        }
      }
      geo.dispose();
    };
  }, []);

  // Add meshes to group once ready (trails first so they render behind)
  useEffect(() => {
    if (!ready || !groupRef.current) return;
    for (const e of entitiesRef.current) {
      for (const tr of e.trails) {
        groupRef.current.add(tr.mesh);
      }
      groupRef.current.add(e.mesh);
    }
    return () => {
      for (const e of entitiesRef.current) {
        groupRef.current?.remove(e.mesh);
        for (const tr of e.trails) {
          groupRef.current?.remove(tr.mesh);
        }
      }
    };
  }, [ready]);

  // Initialize positions once we have viewport
  const initializedRef = useRef(false);

  useFrame(({ clock }) => {
    const state = engineRef.current.getTrackState(trackId);
    if (!state) return;

    // Seek detection: reset all accumulated state when user seeks/scrubs
    if (state.seekGeneration !== prevSeekGenRef.current) {
      prevSeekGenRef.current = state.seekGeneration;
      // Reset all edge detection refs to current counts
      prevCornersCount.current = state.pitchNoteOnCounts.get(SWITCH_CORNERS_PITCH) ?? 0;
      prevSwapCount.current = state.pitchNoteOnCounts.get(SWAP_HALVES_PITCH) ?? 0;
      prevCWCount.current = state.pitchNoteOnCounts.get(ROTATE_CW_PITCH) ?? 0;
      prevCCWCount.current = state.pitchNoteOnCounts.get(ROTATE_CCW_PITCH) ?? 0;
      prevFlipCount.current = state.pitchNoteOnCounts.get(FLIP_AXIS_PITCH) ?? 0;
      prevWhole180Count.current = state.pitchNoteOnCounts.get(WHOLE_180_PITCH) ?? 0;
      prevTopCWCount.current = state.pitchNoteOnCounts.get(TOP_ROW_CW_PITCH) ?? 0;
      prevTopCCWCount.current = state.pitchNoteOnCounts.get(TOP_ROW_CCW_PITCH) ?? 0;
      prevBottomCWCount.current = state.pitchNoteOnCounts.get(BOTTOM_ROW_CW_PITCH) ?? 0;
      prevBottomCCWCount.current = state.pitchNoteOnCounts.get(BOTTOM_ROW_CCW_PITCH) ?? 0;
      prevEmojiCounts.current = new Map(state.pitchNoteOnCounts);
      // Reset accumulated layout state
      leftCornersRef.current = [0, 1, 2, 3];
      rightCornersRef.current = [4, 5, 6, 7];
      halvesSwappedRef.current = false;
      verticalRef.current = false;
      whole180Ref.current = false;
      topRowAngleRef.current = 0;
      bottomRowAngleRef.current = 0;
      depthPhaseRef.current = 0;
      depthFadeRef.current = 0;
      initializedRef.current = false;
      lastTimeRef.current = -1;
    }

    const emojisStr = (state.params.emojis as string) ?? DEFAULTS.emojis;
    const fontSize = (state.params.fontSize as number) ?? DEFAULTS.fontSize;
    const baseOpacity = (state.params.opacity as number) ?? DEFAULTS.opacity;
    const moveSpeed = (state.params.moveSpeed as number) ?? DEFAULTS.moveSpeed;
    const padding = (state.params.padding as number) ?? DEFAULTS.padding;
    const spread = (state.params.spread as number) ?? DEFAULTS.spread;

    const tokens = emojisStr.split(/\s+/).filter(Boolean);
    const now = virtualClock.now() / 1000;
    const dt = lastTimeRef.current < 0 ? 0 : now - lastTimeRef.current;
    lastTimeRef.current = now;

    const vMin = Math.min(viewport.width, viewport.height);
    const scale = vMin * 0.5 * fontSize;

    // Grid layout computation
    const usableW = viewport.width * (1 - 2 * padding);
    const usableH = viewport.height * (1 - 2 * padding);
    const cellW = usableW / 4;
    const cellH = usableH / 2;

    // Half centers (before swap)
    const leftCenterX = -usableW / 4;
    const rightCenterX = usableW / 4;

    // Corner offsets from half center
    const dx = cellW / 2;
    const dy = cellH / 2;

    // --- Emoji selection: highest active emoji pitch sets the token ---
    for (let p = EMOJI_PITCH_MAX; p >= EMOJI_PITCH_MIN; p--) {
      const count = state.pitchNoteOnCounts.get(p) ?? 0;
      const prev = prevEmojiCounts.current.get(p) ?? 0;
      if (count > prev && count > 0) {
        const idx = p - EMOJI_PITCH_MIN;
        currentTokenRef.current = tokens[idx % tokens.length] ?? '❓';
      }
      prevEmojiCounts.current.set(p, count);
    }

    // --- Detect trigger row hits ---
    const cornersCount = state.pitchNoteOnCounts.get(SWITCH_CORNERS_PITCH) ?? 0;
    const swapCount = state.pitchNoteOnCounts.get(SWAP_HALVES_PITCH) ?? 0;
    const cwCount = state.pitchNoteOnCounts.get(ROTATE_CW_PITCH) ?? 0;
    const ccwCount = state.pitchNoteOnCounts.get(ROTATE_CCW_PITCH) ?? 0;

    // Switch corners: diagonal swap within each half (TL↔BR, TR↔BL)
    if (cornersCount > prevCornersCount.current) {
      const l = leftCornersRef.current;
      leftCornersRef.current = [l[3], l[2], l[1], l[0]];
      const r = rightCornersRef.current;
      rightCornersRef.current = [r[3], r[2], r[1], r[0]];
    }
    prevCornersCount.current = cornersCount;

    // Swap halves: toggle which side each half is on
    if (swapCount > prevSwapCount.current) {
      halvesSwappedRef.current = !halvesSwappedRef.current;
    }
    prevSwapCount.current = swapCount;

    // Rotate CW: TL→TR→BR→BL→TL (what was at BL goes to TL, etc.)
    if (cwCount > prevCWCount.current) {
      const l = leftCornersRef.current;
      leftCornersRef.current = [l[2], l[0], l[3], l[1]];
      const r = rightCornersRef.current;
      rightCornersRef.current = [r[2], r[0], r[3], r[1]];
    }
    prevCWCount.current = cwCount;

    // Rotate CCW: TL→BL→BR→TR→TL (what was at TR goes to TL, etc.)
    if (ccwCount > prevCCWCount.current) {
      const l = leftCornersRef.current;
      leftCornersRef.current = [l[1], l[3], l[0], l[2]];
      const r = rightCornersRef.current;
      rightCornersRef.current = [r[1], r[3], r[0], r[2]];
    }
    prevCCWCount.current = ccwCount;

    // Flip axis: toggle between horizontal (left/right) and vertical (top/bottom) layout
    const flipCount = state.pitchNoteOnCounts.get(FLIP_AXIS_PITCH) ?? 0;
    if (flipCount > prevFlipCount.current) {
      verticalRef.current = !verticalRef.current;
    }
    prevFlipCount.current = flipCount;

    // --- Compute target positions for each emoji ---
    const targetX = new Float64Array(NUM_EMOJIS);
    const targetY = new Float64Array(NUM_EMOJIS);

    const isVertical = verticalRef.current;

    // Half centers and corner offsets depend on axis orientation
    let halfACX: number, halfACY: number;
    let halfBCX: number, halfBCY: number;
    let cdx: number, cdy: number;

    if (isVertical) {
      // Vertical: halves stacked top/bottom, each half is 2 cols × 2 rows in a 2×4-row grid
      halfACX = 0;
      halfACY = usableH / 4 * spread;
      halfBCX = 0;
      halfBCY = -usableH / 4 * spread;
      cdx = usableW / 4 * spread;
      cdy = usableH / 8 * spread;
    } else {
      // Horizontal: halves side by side left/right (default)
      halfACX = leftCenterX * spread;
      halfACY = 0;
      halfBCX = rightCenterX * spread;
      halfBCY = 0;
      cdx = dx * spread;
      cdy = dy * spread;
    }

    // Apply halves swap
    const lCX = halvesSwappedRef.current ? halfBCX : halfACX;
    const lCY = halvesSwappedRef.current ? halfBCY : halfACY;
    const rCX = halvesSwappedRef.current ? halfACX : halfBCX;
    const rCY = halvesSwappedRef.current ? halfACY : halfBCY;

    for (let c = 0; c < 4; c++) {
      const lEmojiIdx = leftCornersRef.current[c];
      targetX[lEmojiIdx] = lCX + CORNER_SIGNS[c][0] * cdx;
      targetY[lEmojiIdx] = lCY + CORNER_SIGNS[c][1] * cdy;

      const rEmojiIdx = rightCornersRef.current[c];
      targetX[rEmojiIdx] = rCX + CORNER_SIGNS[c][0] * cdx;
      targetY[rEmojiIdx] = rCY + CORNER_SIGNS[c][1] * cdy;
    }

    // --- Detect new rotation triggers ---
    const whole180Count = state.pitchNoteOnCounts.get(WHOLE_180_PITCH) ?? 0;
    if (whole180Count > prevWhole180Count.current) {
      whole180Ref.current = !whole180Ref.current;
    }
    prevWhole180Count.current = whole180Count;

    const topCWCount = state.pitchNoteOnCounts.get(TOP_ROW_CW_PITCH) ?? 0;
    if (topCWCount > prevTopCWCount.current) {
      topRowAngleRef.current = (topRowAngleRef.current + 1) % 8;
    }
    prevTopCWCount.current = topCWCount;

    const topCCWCount = state.pitchNoteOnCounts.get(TOP_ROW_CCW_PITCH) ?? 0;
    if (topCCWCount > prevTopCCWCount.current) {
      topRowAngleRef.current = (topRowAngleRef.current + 7) % 8; // +7 = -1 mod 8
    }
    prevTopCCWCount.current = topCCWCount;

    const bottomCWCount = state.pitchNoteOnCounts.get(BOTTOM_ROW_CW_PITCH) ?? 0;
    if (bottomCWCount > prevBottomCWCount.current) {
      bottomRowAngleRef.current = (bottomRowAngleRef.current + 1) % 8;
    }
    prevBottomCWCount.current = bottomCWCount;

    const bottomCCWCount = state.pitchNoteOnCounts.get(BOTTOM_ROW_CCW_PITCH) ?? 0;
    if (bottomCCWCount > prevBottomCCWCount.current) {
      bottomRowAngleRef.current = (bottomRowAngleRef.current + 7) % 8;
    }
    prevBottomCCWCount.current = bottomCCWCount;

    // --- Apply per-row rotations around each row's center ---
    // Top row = emojis at TL/TR corners (CORNER_SIGNS indices 0,1) from each half
    // Bottom row = emojis at BL/BR corners (CORNER_SIGNS indices 2,3) from each half
    const topEmojis = [
      leftCornersRef.current[0], leftCornersRef.current[1],
      rightCornersRef.current[0], rightCornersRef.current[1],
    ];
    const bottomEmojis = [
      leftCornersRef.current[2], leftCornersRef.current[3],
      rightCornersRef.current[2], rightCornersRef.current[3],
    ];

    // Helper: rotate a set of emoji indices around their center by 45° steps
    const applyRowRotation = (emojiIndices: number[], angleSteps: number) => {
      if (angleSteps === 0) return;
      // Compute center of the row
      let cx = 0, cy = 0;
      for (const idx of emojiIndices) {
        cx += targetX[idx];
        cy += targetY[idx];
      }
      cx /= emojiIndices.length;
      cy /= emojiIndices.length;

      // Apply rotation: each step = 45° CW
      const angle = -(angleSteps * Math.PI / 4); // negative for CW
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (const idx of emojiIndices) {
        const dx = targetX[idx] - cx;
        const dy = targetY[idx] - cy;
        targetX[idx] = cx + dx * cos - dy * sin;
        targetY[idx] = cy + dx * sin + dy * cos;
      }
    };

    applyRowRotation(topEmojis, topRowAngleRef.current);
    applyRowRotation(bottomEmojis, bottomRowAngleRef.current);

    // --- Apply whole structure 180° rotation around center ---
    if (whole180Ref.current) {
      for (let i = 0; i < NUM_EMOJIS; i++) {
        targetX[i] = -targetX[i];
        targetY[i] = -targetY[i];
      }
    }

    // --- 3D depth: held = show trails, released = fade out ---
    const depthHeld = state.activeNotes.has(DEPTH_3D_PITCH);
    const fadeLerp = 1 - Math.exp(-6 * dt);
    depthFadeRef.current += ((depthHeld ? 1 : 0) - depthFadeRef.current) * fadeLerp;
    if (depthHeld) {
      depthPhaseRef.current = (depthPhaseRef.current + dt * TRAIL_SPEED) % 1;
    }
    const depthVisible = depthFadeRef.current > 0.01;

    // --- Update each emoji ---
    const activeToken = currentTokenRef.current;
    const lerpFactor = dt > 0 ? 1 - Math.exp(-moveSpeed * dt) : 1;

    for (let i = 0; i < NUM_EMOJIS; i++) {
      const entity = entitiesRef.current[i];
      if (!entity) continue;

      // Update texture (shared with trails via same CanvasTexture reference)
      if (activeToken !== entity.lastToken) {
        const canvas = createEmojiCanvas(activeToken, CANVAS_SIZE);
        entity.texture.image = canvas;
        entity.texture.needsUpdate = true;
        entity.lastToken = activeToken;
        // Update trail material map references (they share the texture object,
        // but reassign in case it was recreated)
        for (const tr of entity.trails) {
          tr.material.map = entity.texture;
          tr.material.needsUpdate = true;
        }
      }

      // Snap to target on first frame, lerp after
      if (!initializedRef.current) {
        entity.currentX = targetX[i];
        entity.currentY = targetY[i];
      } else {
        entity.currentX += (targetX[i] - entity.currentX) * lerpFactor;
        entity.currentY += (targetY[i] - entity.currentY) * lerpFactor;
      }

      // Apply to mesh
      entity.material.opacity = baseOpacity;
      entity.mesh.visible = true;
      entity.mesh.scale.set(scale, scale, 1);
      entity.mesh.position.set(entity.currentX, entity.currentY, -0.001 * i);

      // --- Update trail copies for 3D depth ---
      for (let t = 0; t < NUM_TRAIL; t++) {
        const trail = entity.trails[t];
        if (!depthVisible) {
          trail.mesh.visible = false;
          continue;
        }

        // Each trail copy has an evenly spaced phase offset
        const copyPhase = (depthPhaseRef.current + t / NUM_TRAIL) % 1;
        const z = copyPhase * TRAIL_MAX_Z;
        // Scale increases as it approaches camera (perspective-like growth)
        const trailScale = scale * (1 + copyPhase * 0.8);
        // Opacity fades as it gets closer to camera
        const trailOpacity = baseOpacity * (1 - copyPhase) * depthFadeRef.current * 0.6;

        trail.material.opacity = trailOpacity;
        trail.mesh.visible = trailOpacity > 0.005;
        trail.mesh.scale.set(trailScale, trailScale, 1);
        trail.mesh.position.set(entity.currentX, entity.currentY, z);
      }
    }

    initializedRef.current = true;
  });

  if (!ready) return null;
  return <group ref={groupRef} />;
}

export const EmojiDisplay: Instrument = {
  id: 'emojiDisplay',
  name: 'Emoji Display',
  description: '8 emojis in a 2×4 grid with corner-swap, half-swap, and rotation triggers',
  icon: '😀',
  color: '#ffcc00',
  hasAudio: false,
  hasVisual: true,
  editorType: 'generic',
  noteRange: { min: PITCH_MIN, max: PITCH_MAX },
  rangeLabels: [
    { startPitch: BOTTOM_ROW_CCW_PITCH, endPitch: BOTTOM_ROW_CCW_PITCH, label: 'Bottom Row CCW' },
    { startPitch: BOTTOM_ROW_CW_PITCH, endPitch: BOTTOM_ROW_CW_PITCH, label: 'Bottom Row CW' },
    { startPitch: TOP_ROW_CCW_PITCH, endPitch: TOP_ROW_CCW_PITCH, label: 'Top Row CCW' },
    { startPitch: TOP_ROW_CW_PITCH, endPitch: TOP_ROW_CW_PITCH, label: 'Top Row CW' },
    { startPitch: WHOLE_180_PITCH, endPitch: WHOLE_180_PITCH, label: 'Whole 180°' },
    { startPitch: DEPTH_3D_PITCH, endPitch: DEPTH_3D_PITCH, label: '3D Depth' },
    { startPitch: FLIP_AXIS_PITCH, endPitch: FLIP_AXIS_PITCH, label: 'Flip Axis' },
    { startPitch: ROTATE_CCW_PITCH, endPitch: ROTATE_CCW_PITCH, label: 'Rotate CCW' },
    { startPitch: ROTATE_CW_PITCH, endPitch: ROTATE_CW_PITCH, label: 'Rotate CW' },
    { startPitch: SWAP_HALVES_PITCH, endPitch: SWAP_HALVES_PITCH, label: 'Swap Halves' },
    { startPitch: SWITCH_CORNERS_PITCH, endPitch: SWITCH_CORNERS_PITCH, label: 'Switch Corners' },
    ...(() => {
      const defaultTokens = DEFAULT_EMOJIS.split(/\s+/).filter(Boolean);
      return defaultTokens.map((token, i) => ({
        startPitch: EMOJI_PITCH_MIN + i,
        endPitch: EMOJI_PITCH_MIN + i,
        label: token,
      }));
    })(),
  ],

  defaultSettings: { ...DEFAULTS },

  settingsSchema: {
    emojis: {
      type: 'string',
      label: 'Emojis (space-separated)',
      default: DEFAULTS.emojis,
    },
    fontSize: {
      type: 'number',
      label: 'Size',
      min: 0.05,
      max: 2,
      step: 0.05,
      default: DEFAULTS.fontSize,
    },
    opacity: {
      type: 'number',
      label: 'Opacity',
      min: 0,
      max: 1,
      step: 0.05,
      default: DEFAULTS.opacity,
    },
    moveSpeed: {
      type: 'number',
      label: 'Move Speed',
      min: 1,
      max: 30,
      step: 1,
      default: DEFAULTS.moveSpeed,
    },
    padding: {
      type: 'number',
      label: 'Padding',
      min: 0,
      max: 0.4,
      step: 0.02,
      default: DEFAULTS.padding,
    },
    spread: {
      type: 'number',
      label: 'Spread',
      min: 0,
      max: 3,
      step: 0.05,
      default: DEFAULTS.spread,
    },
  },

  VisualComponent: EmojiDisplayVisual,
};
