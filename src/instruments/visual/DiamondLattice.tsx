'use client';

import { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine, getPluginSettingsWithOverrides } from '@/core/visualPlayback';
import { virtualClock } from '@/core/virtualClock';
import { useProjectStore } from '@/stores/projectStore';
import { getPlugin } from '@/plugins';
import { Instrument } from '../types';

// ── Constants ───────────────────────────────────────────────────────────────

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const DEG = Math.PI / 180;

// MIDI pitch mapping — palette select (C1–G1)
const PAL_MONO = 24;
const PAL_NEON = 25;
const PAL_BRUTALIST = 26;
const PAL_VAPORWAVE = 27;
const PAL_MAGMA = 28;
const PAL_ACID = 29;
const PAL_SUNSET = 30;
const PAL_ICE = 31;

// MIDI pitch mapping — triggers (C2–D#3)
const KICK = 36;
const SNARE = 37;
const HAT = 38;
const SPREAD = 39;
const SWELL = 40;
const MIRROR = 41;
const SPAWN = 42;
const GLOW = 43;
const INVERT = 44;
const HUE_ROTATE = 45;
const SATURATE = 46;
const DESATURATE = 47;
const WARM = 48;
const COOL = 49;
const HIGH_CONTRAST = 50;
const BLEACH = 51;

const PITCH_MIN = PAL_MONO;   // 24
const PITCH_MAX = BLEACH;     // 51

// Canvas filter strings for creative color effects (toggle on/off)
const COLOR_FILTERS: Record<number, string> = {
  [INVERT]: 'invert(1)',
  [HUE_ROTATE]: 'hue-rotate(180deg)',
  [SATURATE]: 'saturate(3)',
  [DESATURATE]: 'saturate(0.15)',
  [WARM]: 'sepia(0.6) saturate(1.5)',
  [COOL]: 'hue-rotate(190deg) saturate(0.8)',
  [HIGH_CONTRAST]: 'contrast(2) brightness(1.1)',
  [BLEACH]: 'brightness(1.6) contrast(0.7) saturate(0.5)',
};

// Map palette pitches to scheme keys
const PALETTE_PITCH_MAP: Record<number, string> = {
  [PAL_MONO]: 'mono',
  [PAL_NEON]: 'neon',
  [PAL_BRUTALIST]: 'brutalist',
  [PAL_VAPORWAVE]: 'vaporwave',
  [PAL_MAGMA]: 'magma',
  [PAL_ACID]: 'acid',
  [PAL_SUNSET]: 'sunset',
  [PAL_ICE]: 'ice',
};

// ── Color palettes ──────────────────────────────────────────────────────────

interface ColorScheme {
  name: string;
  bg: string;
  colors: (layer: number, nLayers: number) => string;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
}

const ALPHA = 0.55;

const COLOR_SCHEMES: Record<string, ColorScheme> = {
  mono: {
    name: 'Mono',
    bg: '#0a0a0a',
    colors: (layer, nLayers) => {
      const l = 40 + (layer / Math.max(1, nLayers - 1)) * 50;
      return `hsla(0, 0%, ${l}%, ${ALPHA})`;
    },
  },
  neon: {
    name: 'Neon',
    bg: '#0a0a1a',
    colors: (layer, nLayers) => {
      const h = (layer / Math.max(1, nLayers)) * 360;
      return `hsla(${h}, 100%, 60%, ${ALPHA})`;
    },
  },
  brutalist: {
    name: 'Brutalist',
    bg: '#1a1a1a',
    colors: (layer) => {
      const c = ['#ff0000', '#ffffff', '#000000', '#ffff00', '#0000ff', '#ff00ff', '#00ff00', '#ff8800'][layer % 8];
      return hexWithAlpha(c, ALPHA);
    },
  },
  vaporwave: {
    name: 'Vaporwave',
    bg: '#1a0025',
    colors: (layer) => {
      const c = ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', '#fffb96', '#ff6b6b', '#54e5ff', '#ffc800'][layer % 8];
      return hexWithAlpha(c, ALPHA);
    },
  },
  magma: {
    name: 'Magma',
    bg: '#0d0000',
    colors: (layer) => {
      const c = ['#ff0000', '#ff4400', '#ff8800', '#ffcc00', '#ffff44', '#ffffff', '#ff2200', '#cc0000'][layer % 8];
      return hexWithAlpha(c, ALPHA);
    },
  },
  acid: {
    name: 'Acid',
    bg: '#001100',
    colors: (layer) => {
      const c = ['#00ff00', '#88ff00', '#ccff00', '#ffff00', '#00ff88', '#00ffcc', '#44ff44', '#aaff00'][layer % 8];
      return hexWithAlpha(c, ALPHA);
    },
  },
  sunset: {
    name: 'Sunset',
    bg: '#1a0a00',
    colors: (layer) => {
      const c = ['#ff4500', '#ff6347', '#ff7f50', '#ffa07a', '#ffb347', '#ffd700', '#ff69b4', '#da70d6'][layer % 8];
      return hexWithAlpha(c, ALPHA);
    },
  },
  ice: {
    name: 'Ice',
    bg: '#000a14',
    colors: (layer) => {
      const c = ['#e0f7fa', '#b2ebf2', '#80deea', '#4dd0e1', '#26c6da', '#00bcd4', '#00acc1', '#0097a7'][layer % 8];
      return hexWithAlpha(c, ALPHA);
    },
  },
};

const SCHEME_KEYS = Object.keys(COLOR_SCHEMES);

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  colorScheme: 'neon',
  symmetry: 6,
  numLayers: 3,
  unitSize: 100,
  swingDeg: 40,
  rotSpeed: 20,
  rotStagger: 0,
  layerGap: 50,
  spreadRange: 60,
  swellRange: 80,
  sizeSlope: 0,
  breathAmount: 30,
  breathMult: 1,
  sizeOsc: 0,
  swingOsc: 0,
  wiggle: 0,
  depthCopy: false,
  depthScale: 1.6,
  depthSpread: 1.5,
  depthOpacity: 0.25,
  glowAmount: 30,
  mirrorX: false,
  mirrorY: false,
  mirrorSpacing: 0,
  opacity: 1,
};

// ── Spawn layer type ────────────────────────────────────────────────────────

interface SpawnLayer {
  currentRadius: number;
  currentSlot: number;  // smooth interpolated slot position
  age: number;          // discrete target slot (0 = center)
  opacity: number;
}

// ── Visual component ────────────────────────────────────────────────────────

function DiamondLatticeVisual({ trackId }: { trackId: string }) {
  const engineRef = useRef(getVisualPlaybackEngine());
  const meshRef = useRef<THREE.Mesh>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const { viewport } = useThree();
  const [ready, setReady] = useState(false);

  // Animation state refs
  const lastTimeRef = useRef(0);
  const lastNoteOnCountsRef = useRef(new Map<number, number>());
  const prevSeekGenRef = useRef(0);

  // Kick/snare arm swing state
  const kickAngleRef = useRef(0);    // current interpolated angle
  const snareAngleRef = useRef(0);
  const kickDirRef = useRef(1);      // +1 or -1, flipped on trigger
  const snareDirRef = useRef(1);

  // Rotation state
  const rotAccumRef = useRef(0);
  const rotDirRef = useRef(1);       // +1 or -1, reversed on Hat

  // Toggle states
  const spreadActiveRef = useRef(false);
  const swellActiveRef = useRef(false);
  const mirrorActiveRef = useRef(false);

  // Palette override (null = use settings value)
  const paletteOverrideRef = useRef<string | null>(null);

  // Active color filters (toggled on/off independently)
  const activeFiltersRef = useRef(new Set<number>());

  // Gap chase state
  const currentGapRef = useRef(DEFAULTS.layerGap);

  // Size slope chase state
  const currentSlopeRef = useRef(0);

  // Spawn layers
  const spawnLayersRef = useRef<SpawnLayer[]>([]);

  // Glow state
  const glowActiveRef = useRef(false);
  const currentGlowRef = useRef(0);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    canvasRef.current = canvas;

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    textureRef.current = tex;
    setReady(true);

    return () => {
      tex.dispose();
    };
  }, []);

  useFrame(() => {
    const engine = engineRef.current;
    const state = engine.getTrackState(trackId);
    if (!state || !canvasRef.current || !textureRef.current || !meshRef.current) return;

    // Seek detection via seekGeneration
    if (state.seekGeneration !== prevSeekGenRef.current) {
      prevSeekGenRef.current = state.seekGeneration;
      // Reset all accumulated state
      lastNoteOnCountsRef.current = new Map(state.pitchNoteOnCounts);
      kickAngleRef.current = 0;
      snareAngleRef.current = 0;
      kickDirRef.current = 1;
      snareDirRef.current = 1;
      rotAccumRef.current = 0;
      rotDirRef.current = 1;
      spreadActiveRef.current = false;
      swellActiveRef.current = false;
      mirrorActiveRef.current = false;
      currentGapRef.current = DEFAULTS.layerGap;
      currentSlopeRef.current = DEFAULTS.sizeSlope;
      spawnLayersRef.current = [];
      glowActiveRef.current = false;
      currentGlowRef.current = 0;
      paletteOverrideRef.current = null;
      activeFiltersRef.current = new Set();
    }

    const ctx = canvasRef.current.getContext('2d')!;
    const params = state.params;

    // Read settings
    const colorScheme = (params.colorScheme as string) ?? DEFAULTS.colorScheme;
    const symmetry = (params.symmetry as number) ?? DEFAULTS.symmetry;
    const numLayers = (params.numLayers as number) ?? DEFAULTS.numLayers;
    const unitSize = (params.unitSize as number) ?? DEFAULTS.unitSize;
    const swingDeg = (params.swingDeg as number) ?? DEFAULTS.swingDeg;
    const rotSpeed = (params.rotSpeed as number) ?? DEFAULTS.rotSpeed;
    const rotStagger = (params.rotStagger as number) ?? DEFAULTS.rotStagger;
    const layerGap = (params.layerGap as number) ?? DEFAULTS.layerGap;
    const spreadRange = (params.spreadRange as number) ?? DEFAULTS.spreadRange;
    const swellRange = (params.swellRange as number) ?? DEFAULTS.swellRange;
    const sizeSlope = (params.sizeSlope as number) ?? DEFAULTS.sizeSlope;
    const breathAmount = (params.breathAmount as number) ?? DEFAULTS.breathAmount;
    const breathMultSetting = (params.breathMult as number) ?? DEFAULTS.breathMult;
    const sizeOsc = (params.sizeOsc as number) ?? DEFAULTS.sizeOsc;
    const swingOsc = (params.swingOsc as number) ?? DEFAULTS.swingOsc;
    const wiggle = (params.wiggle as number) ?? DEFAULTS.wiggle;
    const depthCopy = (params.depthCopy as boolean) ?? DEFAULTS.depthCopy;
    const depthScale = (params.depthScale as number) ?? DEFAULTS.depthScale;
    const depthSpread = (params.depthSpread as number) ?? DEFAULTS.depthSpread;
    const depthOpacity = (params.depthOpacity as number) ?? DEFAULTS.depthOpacity;
    const glowAmount = (params.glowAmount as number) ?? DEFAULTS.glowAmount;
    const mirrorX = (params.mirrorX as boolean) ?? DEFAULTS.mirrorX;
    const mirrorY = (params.mirrorY as boolean) ?? DEFAULTS.mirrorY;
    const mirrorSpacing = (params.mirrorSpacing as number) ?? DEFAULTS.mirrorSpacing;
    const opacity = (params.opacity as number) ?? DEFAULTS.opacity;

    const activeSchemeKey = paletteOverrideRef.current ?? colorScheme;
    const scheme = COLOR_SCHEMES[activeSchemeKey] ?? COLOR_SCHEMES.neon;

    // Time
    const now = virtualClock.now();
    const dt = lastTimeRef.current === 0 ? 0 : (now - lastTimeRef.current) / 1000;
    lastTimeRef.current = now;
    const clampedDt = Math.min(dt, 0.1);
    const timeMs = now;

    // Detect new note-ons per pitch
    const newTriggers = new Map<number, number>();
    for (const [pitch, count] of state.pitchNoteOnCounts) {
      const prev = lastNoteOnCountsRef.current.get(pitch) ?? 0;
      if (count > prev) {
        newTriggers.set(pitch, count - prev);
      }
    }
    lastNoteOnCountsRef.current = new Map(state.pitchNoteOnCounts);

    // Process MIDI triggers
    for (const [pitch] of newTriggers) {
      // Palette switches
      if (PALETTE_PITCH_MAP[pitch]) {
        paletteOverrideRef.current = PALETTE_PITCH_MAP[pitch];
        continue;
      }
      switch (pitch) {
        case KICK:
          kickDirRef.current *= -1;
          break;
        case SNARE:
          snareDirRef.current *= -1;
          break;
        case HAT:
          rotDirRef.current *= -1;
          break;
        case SPREAD:
          spreadActiveRef.current = !spreadActiveRef.current;
          break;
        case SWELL:
          swellActiveRef.current = !swellActiveRef.current;
          break;
        case MIRROR:
          mirrorActiveRef.current = !mirrorActiveRef.current;
          break;
        case GLOW:
          glowActiveRef.current = !glowActiveRef.current;
          break;
        case INVERT:
        case HUE_ROTATE:
        case SATURATE:
        case DESATURATE:
        case WARM:
        case COOL:
        case HIGH_CONTRAST:
        case BLEACH: {
          const filters = activeFiltersRef.current;
          if (filters.has(pitch)) filters.delete(pitch);
          else filters.add(pitch);
          break;
        }
        case SPAWN: {
          // Push all existing layers outward
          const layers = spawnLayersRef.current;
          for (const sl of layers) {
            sl.age += 1;
          }
          // Insert new layer at center
          layers.unshift({
            currentRadius: 0,
            currentSlot: 0,
            age: 0,
            opacity: 1,
          });
          break;
        }
      }
    }

    // ── Update animation state ──────────────────────────────────────────

    // Swing oscillation
    const effectiveSwingOsc = 1 + (swingOsc / 100) * Math.sin(timeMs / 700);
    const effectiveSwing = swingDeg * effectiveSwingOsc;

    // Frame-rate-independent exponential chase. Lower rate = longer settle.
    // Exponential decay is inherently asymptotic — it never truly arrives,
    // so the tail always feels smooth. Rate controls how fast it gets "most of the way there".
    const chase = (rate: number) => 1 - Math.exp(-rate * clampedDt);

    // Kick/snare angle — rate 5: reaches ~95% in 0.6s, last 5% drifts over another second
    const kickTarget = kickDirRef.current * effectiveSwing;
    const snareTarget = snareDirRef.current * effectiveSwing;
    kickAngleRef.current += (kickTarget - kickAngleRef.current) * chase(5);
    snareAngleRef.current += (snareTarget - snareAngleRef.current) * chase(5);

    // Accumulated rotation
    rotAccumRef.current += clampedDt * rotDirRef.current;

    // Gap chase — rate 2: reaches ~86% in 1s, visible long glide to rest
    const gapTarget = spreadActiveRef.current ? layerGap + spreadRange : layerGap - spreadRange;
    currentGapRef.current += (gapTarget - currentGapRef.current) * chase(2);

    // Size slope chase
    const slopeTarget = swellActiveRef.current ? sizeSlope + swellRange : sizeSlope - swellRange;
    currentSlopeRef.current += (slopeTarget - currentSlopeRef.current) * chase(2);

    // Update spawn layers — rate 1.5: slow organic drift, ~78% in 1s
    const spawnLayers = spawnLayersRef.current;
    const spawnSlotFactor = chase(1.5);
    const spawnOpacityFactor = chase(1.2);
    for (const sl of spawnLayers) {
      sl.currentSlot += (sl.age - sl.currentSlot) * spawnSlotFactor;
      const targetOpacity = Math.max(0, 1 - sl.currentSlot / numLayers);
      sl.opacity += (targetOpacity - sl.opacity) * spawnOpacityFactor;
    }
    // Remove faded-out layers
    spawnLayersRef.current = spawnLayers.filter(sl => sl.opacity > 0.01);

    // Glow chase
    const glowTarget = glowActiveRef.current ? 1 : 0;
    currentGlowRef.current += (glowTarget - currentGlowRef.current) * chase(3);

    // ── Dimension-relative sizing ───────────────────────────────────────

    const dim = Math.min(CANVAS_W, CANVAS_H);
    const baseRadius = dim * 0.12;
    const unitScale = unitSize / 100;
    const baseCentral = dim * 0.10 * unitScale;
    const baseArm = dim * 0.07 * unitScale;
    const basePerp = dim * 0.07 * unitScale;

    // Size oscillation
    const sizeOscMult = 1 + (sizeOsc / 100) * Math.sin(timeMs / 600);

    // Breath oscillation (radius)
    // Breath rate synced to BPM: one full cycle = breathMultSetting beats
    const bpm = useProjectStore.getState().project.bpm;
    const beatMs = 60000 / bpm; // ms per beat
    const breathPeriodMs = beatMs * breathMultSetting;
    const breathOsc = 1 + (breathAmount / 100) * Math.sin((timeMs / breathPeriodMs) * Math.PI * 2);

    // ── Draw ────────────────────────────────────────────────────────────

    ctx.fillStyle = scheme.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.globalAlpha = opacity;

    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;

    const altRot = mirrorActiveRef.current;
    const halfStep = (Math.PI * 2) / symmetry / 2;
    const slopeFrac = currentSlopeRef.current / 100;
    const kickAng = kickAngleRef.current * DEG;
    const snareAng = snareAngleRef.current * DEG;
    const glowIntensity = currentGlowRef.current * glowAmount;

    // Draw function for a single kite-quad unit
    const drawUnit = (
      unitCx: number, unitCy: number,
      angle: number,  // angle from center
      central: number, arm: number, perp: number,
      fillColor: string, unitOpacity: number,
    ) => {
      // Central segment A→B along the radial direction (angle)
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const ax = unitCx - cosA * central * 0.5;
      const ay = unitCy - sinA * central * 0.5;
      const bx = unitCx + cosA * central * 0.5;
      const by = unitCy + sinA * central * 0.5;

      // Kick arm (C): extends backward from A, rotated by kickAng
      const kickDir = angle + Math.PI + kickAng;
      const cxP = ax + Math.cos(kickDir) * arm;
      const cyP = ay + Math.sin(kickDir) * arm;

      // Snare arm (D): extends forward from B, rotated by snareAng
      const snareDir = angle + snareAng;
      const dxP = bx + Math.cos(snareDir) * arm;
      const dyP = by + Math.sin(snareDir) * arm;

      // Perpendicular vertices (E, F) through midpoint of A-B
      const perpDir = angle + Math.PI / 2;
      const ex = unitCx + Math.cos(perpDir) * perp;
      const ey = unitCy + Math.sin(perpDir) * perp;
      const fx = unitCx - Math.cos(perpDir) * perp;
      const fy = unitCy - Math.sin(perpDir) * perp;

      // Glow effect via canvas shadow
      if (glowIntensity > 0.5) {
        ctx.shadowColor = fillColor;
        ctx.shadowBlur = glowIntensity;
      }

      // Build path (reused for base fill + gradient overlay)
      const buildPath = () => {
        ctx.beginPath();
        ctx.moveTo(cxP, cyP);
        ctx.lineTo(ex, ey);
        ctx.lineTo(dxP, dyP);
        ctx.lineTo(fx, fy);
        ctx.closePath();
      };

      // Base fill (with glow shadow if active)
      ctx.globalAlpha = opacity * unitOpacity;
      ctx.fillStyle = fillColor;
      buildPath();
      ctx.fill();

      // Reset shadow before gradient overlay so it doesn't double-glow
      if (glowIntensity > 0.5) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      // Subtle top-to-bottom gradient overlay: lighter at top, darker at bottom
      const extent = Math.max(central, arm, perp) * 1.2;
      const grad = ctx.createLinearGradient(unitCx, unitCy - extent, unitCx, unitCy + extent);
      grad.addColorStop(0, 'rgba(255,255,255,0.3)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = grad;
      buildPath();
      ctx.fill();
    };

    // Build sorted layer list: base layers + spawn layers
    interface RenderLayer {
      slot: number;   // position index (determines radius)
      layerIdx: number; // color index
      layerOpacity: number;
      isSpawn: boolean;
    }

    const renderLayers: RenderLayer[] = [];

    // Base layers
    for (let L = 0; L < numLayers; L++) {
      renderLayers.push({
        slot: L,
        layerIdx: L,
        layerOpacity: 1,
        isSpawn: false,
      });
    }

    // Spawn layers
    for (const sl of spawnLayersRef.current) {
      renderLayers.push({
        slot: sl.currentSlot,
        layerIdx: 0,
        layerOpacity: sl.opacity,
        isSpawn: true,
      });
    }

    // Sort by slot (back to front, outermost first)
    renderLayers.sort((a, b) => b.slot - a.slot);

    // Render a full lattice at a given canvas center, overall scale, opacity, and optional axis flips
    const renderLattice = (
      latticeCx: number, latticeCy: number,
      latticeScale: number, latticeOpacity: number,
      sizeMult: number, radiusMult: number,
      flipX = 1, flipY = 1,
    ) => {
      for (const rl of renderLayers) {
        const slot = rl.slot;
        const lt = numLayers > 1 ? slot / (numLayers - 1) : 0.5;

        const sizeScale = Math.pow(2, slopeFrac * (2 * lt - 1)) * sizeOscMult * sizeMult * latticeScale;

        const layerCentral = baseCentral * sizeScale;
        const layerArm = baseArm * sizeScale;
        const layerPerp = basePerp * sizeScale;

        const layerRadius = (baseRadius + slot * Math.max(10, currentGapRef.current)) * breathOsc * radiusMult * latticeScale;

        const layerDir = altRot ? Math.cos(slot * Math.PI) : 1;
        const layerRot = rotAccumRef.current * (rotSpeed + slot * rotStagger) * layerDir * DEG + slot * halfStep;

        const angleStep = (Math.PI * 2) / symmetry;
        const fillColor = scheme.colors(rl.isSpawn ? Math.floor(slot) % numLayers : rl.layerIdx, numLayers);

        for (let i = 0; i < symmetry; i++) {
          const angle = angleStep * i + layerRot;

          // Wiggle: per-unit sine offsets to position and size
          let posOffset = 0;
          let wiggleSizeMult = 1;
          if (wiggle > 0) {
            // Each unit gets a unique phase based on layer slot + index
            const unitPhase = slot * 3.7 + i * 2.3;
            posOffset = Math.sin(timeMs / 500 + unitPhase) * wiggle * dim * 0.008;
            wiggleSizeMult = 1 + Math.sin(timeMs / 600 + unitPhase * 1.4) * wiggle * 0.04;
          }

          // Flip positions around lattice center for mirror duplicates
          const ux = latticeCx + Math.cos(angle) * (layerRadius + posOffset) * flipX;
          const uy = latticeCy + Math.sin(angle) * (layerRadius + posOffset) * flipY;
          // Flip the unit angle to match
          const flippedAngle = Math.atan2(Math.sin(angle) * flipY, Math.cos(angle) * flipX);

          drawUnit(ux, uy, flippedAngle, layerCentral * wiggleSizeMult, layerArm * wiggleSizeMult, layerPerp * wiggleSizeMult, fillColor, rl.layerOpacity * latticeOpacity);
        }
      }
    };

    // Collect clone plugin transforms (rendered on canvas instead of 3D duplication)
    const track = useProjectStore.getState().project.tracks[trackId];
    const clonePlugins = (track?.visualPlugins ?? []).filter(inst => {
      const p = getPlugin(inst.pluginId);
      return p?.category === 'clone' && p.getClones;
    });

    // Build list of clone instances: [{canvasCx, canvasCy, scale}]
    interface CloneInstance { canvasCx: number; canvasCy: number; scale: number; opacity: number }
    const cloneInstances: CloneInstance[] = [];

    if (clonePlugins.length > 0) {
      // Compute total clone count (product of all clone plugin counts)
      const cloneData = clonePlugins.map(inst => {
        const plugin = getPlugin(inst.pluginId)!;
        const settings = getPluginSettingsWithOverrides(trackId, inst.id, inst.settings);
        const enabled = settings.enabled !== undefined ? (settings.enabled as number) >= 0.5 : inst.enabled;
        if (!enabled) return null;
        const config = plugin.getClones!(settings);
        return { config, settings, opacityFalloff: (settings.opacityFalloff as number) ?? 0.2 };
      }).filter(Boolean) as { config: ReturnType<NonNullable<typeof getPlugin extends (id: string) => infer R ? (R extends { getClones?: infer G } ? G : never) : never>>; settings: Record<string, unknown>; opacityFalloff: number }[];

      if (cloneData.length > 0) {
        const totalClones = cloneData.reduce((acc, d) => acc * d.config.count, 1);
        const elapsed = virtualClock.now() / 1000;

        // Scratch objects for matrix decomposition
        const _pos = new THREE.Vector3();
        const _scl = new THREE.Vector3();
        const _quat = new THREE.Quaternion();
        const _combined = new THREE.Matrix4();

        for (let ci = 0; ci < totalClones; ci++) {
          let remaining = ci;
          _combined.identity();

          for (let pi = cloneData.length - 1; pi >= 0; pi--) {
            const d = cloneData[pi];
            const subIdx = remaining % d.config.count;
            remaining = Math.floor(remaining / d.config.count);
            const transform = d.config.getTransform(subIdx, d.settings, elapsed);
            _combined.premultiply(transform);
          }

          _combined.decompose(_pos, _quat, _scl);

          // Map 3D position to canvas pixels:
          // The mesh fills the viewport. viewport.width maps to CANVAS_W pixels.
          const pxPerUnit = CANVAS_W / viewport.width;
          const canvasCx = cx + _pos.x * pxPerUnit;
          const canvasCy = cy - _pos.y * pxPerUnit; // Y flipped
          const scale = (_scl.x + _scl.y) / 2; // average XY scale

          cloneInstances.push({ canvasCx, canvasCy, scale, opacity: 1 });
        }
      }
    }

    // If no clones, just render at center
    if (cloneInstances.length === 0) {
      cloneInstances.push({ canvasCx: cx, canvasCy: cy, scale: 1, opacity: 1 });
    }

    // Sort clones: render furthest from center first (painter's order)
    cloneInstances.sort((a, b) => {
      const da = (a.canvasCx - cx) ** 2 + (a.canvasCy - cy) ** 2;
      const db = (b.canvasCx - cx) ** 2 + (b.canvasCy - cy) ** 2;
      return db - da;
    });

    // Build mirror flip variants: [{flipX, flipY, offsetX, offsetY}]
    // mirrorSpacing pushes mirrored copies apart from center (in pixels, relative to dim)
    const mirrorVariants: { flipX: number; flipY: number; ox: number; oy: number }[] = [];
    const spacingPx = mirrorSpacing * (dim / 100);

    if (mirrorX && mirrorY) {
      // 4 copies: original, X-flipped, Y-flipped, both-flipped
      mirrorVariants.push({ flipX:  1, flipY:  1, ox: -spacingPx, oy: -spacingPx });
      mirrorVariants.push({ flipX: -1, flipY:  1, ox:  spacingPx, oy: -spacingPx });
      mirrorVariants.push({ flipX:  1, flipY: -1, ox: -spacingPx, oy:  spacingPx });
      mirrorVariants.push({ flipX: -1, flipY: -1, ox:  spacingPx, oy:  spacingPx });
    } else if (mirrorX) {
      // 2 copies: original + X-flipped
      mirrorVariants.push({ flipX:  1, flipY: 1, ox: -spacingPx, oy: 0 });
      mirrorVariants.push({ flipX: -1, flipY: 1, ox:  spacingPx, oy: 0 });
    } else if (mirrorY) {
      // 2 copies: original + Y-flipped
      mirrorVariants.push({ flipX: 1, flipY:  1, ox: 0, oy: -spacingPx });
      mirrorVariants.push({ flipX: 1, flipY: -1, ox: 0, oy:  spacingPx });
    } else {
      // No mirror — single copy
      mirrorVariants.push({ flipX: 1, flipY: 1, ox: 0, oy: 0 });
    }

    // Render all clone instances × mirror variants
    for (const clone of cloneInstances) {
      for (const mv of mirrorVariants) {
        const mcx = clone.canvasCx + mv.ox;
        const mcy = clone.canvasCy + mv.oy;
        if (depthCopy) {
          renderLattice(mcx, mcy, clone.scale, clone.opacity * depthOpacity, depthScale, depthSpread, mv.flipX, mv.flipY);
        }
        renderLattice(mcx, mcy, clone.scale, clone.opacity, 1, 1, mv.flipX, mv.flipY);
      }
    }

    ctx.globalAlpha = 1;

    // Apply active color filters by redrawing canvas onto itself
    if (activeFiltersRef.current.size > 0) {
      // Compose all active filters into a single filter string
      const filterStr = Array.from(activeFiltersRef.current)
        .map(pitch => COLOR_FILTERS[pitch])
        .filter(Boolean)
        .join(' ');
      if (filterStr) {
        ctx.save();
        ctx.filter = filterStr;
        ctx.drawImage(canvasRef.current, 0, 0);
        ctx.filter = 'none';
        ctx.restore();
      }
    }

    // Update texture
    textureRef.current.needsUpdate = true;

    // Scale mesh to fill viewport
    const aspect = CANVAS_W / CANVAS_H;
    const vpAspect = viewport.width / viewport.height;
    if (vpAspect > aspect) {
      meshRef.current.scale.set(viewport.width, viewport.width / aspect, 1);
    } else {
      meshRef.current.scale.set(viewport.height * aspect, viewport.height, 1);
    }
  });

  if (!ready) return null;

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={textureRef.current}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// ── Instrument export ───────────────────────────────────────────────────────

export const DiamondLattice: Instrument = {
  id: 'diamondLattice',
  name: 'Diamond Lattice',
  description: 'Radial kite-quad lattice with kick/snare arm morphing, spawn layers, and rotation control',
  icon: '💎',
  color: '#ff69b4',
  hasAudio: false,
  hasVisual: true,
  disableBloom: false,
  handlesCloning: true,
  editorType: 'generic',
  noteRange: { min: PITCH_MIN, max: PITCH_MAX },
  rangeLabels: [
    { startPitch: PAL_MONO, endPitch: PAL_MONO, label: 'Mono' },
    { startPitch: PAL_NEON, endPitch: PAL_NEON, label: 'Neon' },
    { startPitch: PAL_BRUTALIST, endPitch: PAL_BRUTALIST, label: 'Brutalist' },
    { startPitch: PAL_VAPORWAVE, endPitch: PAL_VAPORWAVE, label: 'Vaporwave' },
    { startPitch: PAL_MAGMA, endPitch: PAL_MAGMA, label: 'Magma' },
    { startPitch: PAL_ACID, endPitch: PAL_ACID, label: 'Acid' },
    { startPitch: PAL_SUNSET, endPitch: PAL_SUNSET, label: 'Sunset' },
    { startPitch: PAL_ICE, endPitch: PAL_ICE, label: 'Ice' },
    { startPitch: KICK, endPitch: KICK, label: 'Kick' },
    { startPitch: SNARE, endPitch: SNARE, label: 'Snare' },
    { startPitch: HAT, endPitch: HAT, label: 'Hat' },
    { startPitch: SPREAD, endPitch: SPREAD, label: 'Spread' },
    { startPitch: SWELL, endPitch: SWELL, label: 'Swell' },
    { startPitch: MIRROR, endPitch: MIRROR, label: 'Mirror' },
    { startPitch: SPAWN, endPitch: SPAWN, label: 'Spawn' },
    { startPitch: GLOW, endPitch: GLOW, label: 'Glow' },
    { startPitch: INVERT, endPitch: INVERT, label: 'Invert' },
    { startPitch: HUE_ROTATE, endPitch: HUE_ROTATE, label: 'Hue Rotate' },
    { startPitch: SATURATE, endPitch: SATURATE, label: 'Saturate' },
    { startPitch: DESATURATE, endPitch: DESATURATE, label: 'Desaturate' },
    { startPitch: WARM, endPitch: WARM, label: 'Warm' },
    { startPitch: COOL, endPitch: COOL, label: 'Cool' },
    { startPitch: HIGH_CONTRAST, endPitch: HIGH_CONTRAST, label: 'Hi Contrast' },
    { startPitch: BLEACH, endPitch: BLEACH, label: 'Bleach' },
  ],

  defaultSettings: { ...DEFAULTS },

  settingsSchema: {
    colorScheme: {
      type: 'select',
      label: 'Color Scheme',
      options: SCHEME_KEYS.map(k => ({
        value: k,
        label: COLOR_SCHEMES[k].name,
      })),
      default: DEFAULTS.colorScheme,
    },
    symmetry: {
      type: 'number', label: 'Symmetry', min: 1, max: 16, step: 1,
      default: DEFAULTS.symmetry,
    },
    numLayers: {
      type: 'number', label: 'Layers', min: 1, max: 8, step: 1,
      default: DEFAULTS.numLayers,
    },
    unitSize: {
      type: 'number', label: 'Diamond Size (%)', min: 20, max: 300, step: 5,
      default: DEFAULTS.unitSize,
    },
    swingDeg: {
      type: 'number', label: 'Swing Amplitude (°)', min: 10, max: 90, step: 1,
      default: DEFAULTS.swingDeg,
    },
    rotSpeed: {
      type: 'number', label: 'Rotation Speed (°/s)', min: 0, max: 120, step: 1,
      default: DEFAULTS.rotSpeed,
    },
    rotStagger: {
      type: 'number', label: 'Rotation Stagger (°/s)', min: -40, max: 40, step: 1,
      default: DEFAULTS.rotStagger,
    },
    layerGap: {
      type: 'number', label: 'Layer Gap', min: 20, max: 120, step: 1,
      default: DEFAULTS.layerGap,
    },
    spreadRange: {
      type: 'number', label: 'Spread Range', min: 10, max: 100, step: 1,
      default: DEFAULTS.spreadRange,
    },
    swellRange: {
      type: 'number', label: 'Swell Range', min: 10, max: 100, step: 1,
      default: DEFAULTS.swellRange,
    },
    sizeSlope: {
      type: 'number', label: 'Size Slope', min: -100, max: 100, step: 1,
      default: DEFAULTS.sizeSlope,
    },
    breathAmount: {
      type: 'number', label: 'Breath Amount (%)', min: 0, max: 80, step: 1,
      default: DEFAULTS.breathAmount,
    },
    breathMult: {
      type: 'select', label: 'Breath Rate',
      options: [
        { value: 0.25, label: '1/4 beat' },
        { value: 0.5, label: '1/2 beat' },
        { value: 1, label: '1 beat' },
        { value: 2, label: '2 beats' },
        { value: 4, label: '1 bar' },
        { value: 8, label: '2 bars' },
        { value: 16, label: '4 bars' },
      ],
      default: DEFAULTS.breathMult,
    },
    sizeOsc: {
      type: 'number', label: 'Size Oscillation (%)', min: 0, max: 50, step: 1,
      default: DEFAULTS.sizeOsc,
    },
    swingOsc: {
      type: 'number', label: 'Swing Oscillation (%)', min: 0, max: 100, step: 1,
      default: DEFAULTS.swingOsc,
    },
    wiggle: {
      type: 'number', label: 'Wiggle', min: 0, max: 10, step: 0.5,
      default: DEFAULTS.wiggle,
    },
    glowAmount: {
      type: 'number', label: 'Glow Amount', min: 0, max: 80, step: 1,
      default: DEFAULTS.glowAmount,
    },
    mirrorX: {
      type: 'boolean', label: 'Mirror X',
      default: DEFAULTS.mirrorX,
    },
    mirrorY: {
      type: 'boolean', label: 'Mirror Y',
      default: DEFAULTS.mirrorY,
    },
    mirrorSpacing: {
      type: 'number', label: 'Mirror Spacing', min: 0, max: 100, step: 1,
      default: DEFAULTS.mirrorSpacing,
    },
    depthCopy: {
      type: 'boolean', label: 'Depth Copy',
      default: DEFAULTS.depthCopy,
    },
    depthScale: {
      type: 'number', label: 'Depth Scale', min: 1.1, max: 3, step: 0.1,
      default: DEFAULTS.depthScale,
    },
    depthSpread: {
      type: 'number', label: 'Depth Spread', min: 1, max: 3, step: 0.1,
      default: DEFAULTS.depthSpread,
    },
    depthOpacity: {
      type: 'number', label: 'Depth Opacity', min: 0.05, max: 0.6, step: 0.05,
      default: DEFAULTS.depthOpacity,
    },
    opacity: {
      type: 'number', label: 'Opacity', min: 0, max: 1, step: 0.05,
      default: DEFAULTS.opacity,
    },
  },

  VisualComponent: DiamondLatticeVisual,
};
