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

// --- Geometry helpers ---

function gcd(a: number, b: number): number {
  let x = Math.round(a * 10000);
  let y = Math.round(b * 10000);
  while (y) { const t = y; y = x % y; x = t; }
  return x / 10000;
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

function evictCache() {
  if (geometryCache.size > 300) {
    const iter = geometryCache.keys();
    for (let i = 0; i < 80; i++) {
      const k = iter.next().value;
      if (k) {
        geometryCache.get(k)?.dispose();
        geometryCache.delete(k);
      }
    }
  }
}

// Regular polygon (N-gon)
function getPolygonGeometry(sides: number): THREE.BufferGeometry {
  const key = `poly_${sides}`;
  let geo = geometryCache.get(key);
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
  geometryCache.set(key, geo);
  return geo;
}

// Polar graph: r = cos(k*theta) + offset
function getPolarGeometry(petals: number, offset: number): THREE.BufferGeometry {
  const oQ = Math.round(offset * 100) / 100;
  const key = `polar_${petals}_${oQ}`;
  let geo = geometryCache.get(key);
  if (geo) return geo;

  const segments = 256;
  const tMax = Math.PI * 2;
  const positions = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * tMax;
    const r = Math.cos(petals * theta) + oQ;
    positions[i * 3] = r * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(theta);
    positions[i * 3 + 2] = 0;
  }
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometryCache.set(key, geo);
  evictCache();
  return geo;
}

// Spirograph (hypotrochoid)
function getSpirographGeometry(petals: number, r: number, d: number): THREE.BufferGeometry {
  const rQ = Math.round(r * 100) / 100;
  const dQ = Math.round(d * 100) / 100;
  const key = `spiro_${petals}_${rQ}_${dQ}`;

  let geo = geometryCache.get(key);
  if (geo) return geo;

  const R = 1;
  const innerR = rQ;
  const segments = 256;
  const revolutions = Math.max(1, Math.round(innerR / gcd(R, innerR)));
  const tMax = revolutions * Math.PI * 2;

  const positions = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * tMax;
    const x = (R - innerR) * Math.cos(t) + dQ * Math.cos(((R - innerR) / innerR) * t);
    const y = (R - innerR) * Math.sin(t) - dQ * Math.sin(((R - innerR) / innerR) * t);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = 0;
  }

  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometryCache.set(key, geo);
  evictCache();
  return geo;
}

type ShapeMode = 'spirograph' | 'polygon' | 'polar';

function getShapeGeometry(mode: ShapeMode, petals: number, r: number, d: number): THREE.BufferGeometry {
  switch (mode) {
    case 'polygon':
      return getPolygonGeometry(petals);
    case 'polar':
      return getPolarGeometry(petals, d);
    case 'spirograph':
    default:
      return getSpirographGeometry(petals, r, d);
  }
}

// --- Pooled LineLoop ---

interface PooledLineLoop {
  lineLoop: THREE.LineLoop;
  material: THREE.LineBasicMaterial;
  active: boolean;
}

const _tmpColor = new THREE.Color();
const _pulseColor = new THREE.Color();

// Pitch routing:
// 12-23: shake triggers
// 24-35: color pulse triggers
// 36+:   shape spawners
const SHAKE_PITCH_MIN = 12;
const SHAKE_PITCH_MAX = 23;
const PULSE_PITCH_MIN = 24;
const PULSE_PITCH_MAX = 35;
const SHAPE_PITCH_MIN = 36;

function ShapeFlightVisual({ trackId }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const engineRef = useRef(getVisualPlaybackEngine());
  const poolRef = useRef<PooledLineLoop[]>([]);
  // Accumulated rotation: integrates rotationStep over time so automation
  // changes are continuous (only changes the rate, never jumps).
  const accRotationRef = useRef(0);
  const lastBeatRef = useRef(-1);
  // Accumulated hue offset — pulse events permanently jump this forward
  const accHueOffsetRef = useRef(0);
  const lastPulseCountRef = useRef(0);

  // Cleanup on unmount
  useEffect(() => () => {
    const g = groupRef.current;
    if (g) {
      for (const p of poolRef.current) {
        g.remove(p.lineLoop);
        p.material.dispose();
      }
    }
    poolRef.current = [];
  }, []);

  // Acquire a pooled LineLoop (or create a new one)
  function acquireLineLoop(group: THREE.Group): PooledLineLoop {
    for (const p of poolRef.current) {
      if (!p.active) {
        p.active = true;
        p.lineLoop.visible = true;
        return p;
      }
    }
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    material.blending = THREE.AdditiveBlending;
    material.fog = false;
    const lineLoop = new THREE.LineLoop(new THREE.BufferGeometry(), material);
    group.add(lineLoop);
    const entry: PooledLineLoop = { lineLoop, material, active: true };
    poolRef.current.push(entry);
    return entry;
  }

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const engine = engineRef.current;
    const vs = engine.getTrackState(trackId);
    if (!vs) return;

    const events = engine.getTrackEvents(trackId);
    if (!events || events.length === 0) return;

    const par = vs.params;
    const speed         = (par.speed as number)         ?? 12;
    const spread        = (par.spread as number)        ?? 0;
    const farZ          = (par.farZ as number)          ?? 40;
    const shapeSize     = (par.shapeSize as number)     ?? 0.4;
    const hueStep       = (par.hueStep as number)       ?? 0.08;
    const baseHue       = (par.baseHue as number)       ?? 0.55;
    const saturation    = (par.saturation as number)    ?? 0.9;
    const lightness     = (par.lightness as number)     ?? 0.85;
    const rotationStep  = (par.rotationStep as number)  ?? 0.15;
    const rBase         = (par.rBase as number)         ?? 0.25;
    const dBase         = (par.dBase as number)         ?? 0.7;
    const shapeMode     = (par.shapeMode as ShapeMode)  ?? 'spirograph';
    const spawnRateDefault = (par.spawnRate as number)  ?? 8;
    const scaleDefault  = (par.scale as number)         ?? 1;
    const fadeOutZ      = (par.fadeOutZ as number)       ?? 10;
    const pulseSpeed    = (par.pulseSpeed as number)     ?? 200;
    const pulseDuration = (par.pulseDuration as number)  ?? 0.4;
    const pulseHue      = (par.pulseHue as number)       ?? 0.1;
    const shakeAmount   = (par.shakeAmount as number)    ?? 0.5;
    const shakeDecaySpd = (par.shakeDecay as number)     ?? 20;
    const shakeScale    = (par.shakeScale as number)     ?? 0.5;

    const currentBeat = useUIStore.getState().currentBeat;
    const bpm = useProjectStore.getState().project.bpm;
    const secPerBeat = 60 / bpm;

    // Accumulate rotation: integrate rotationStep over beat deltas.
    // This way automation curves only change the rate — no discontinuities.
    const prevBeat = lastBeatRef.current;
    if (prevBeat >= 0) {
      const beatDelta = currentBeat - prevBeat;
      // Only accumulate for forward playback (small positive deltas).
      // On scrub/seek (large jumps), keep current accumulated value.
      if (beatDelta > 0 && beatDelta < 2) {
        accRotationRef.current += rotationStep * beatDelta;
      }
    }
    lastBeatRef.current = currentBeat;

    // --- Collect effect events (pulse + shake) ---
    // We scan events once to separate shape events from effect triggers.
    // Effect events only matter if they started recently (within a time window).
    const pulseWindow = pulseDuration + farZ / pulseSpeed; // max time a pulse can still be visible
    interface PulseEvent { startSec: number; velocity: number; pitch: number; }
    interface ShakeEvent { startSec: number; velocity: number; }
    const activePulses: PulseEvent[] = [];
    const activeShakes: ShakeEvent[] = [];
    let pulseTotal = 0; // total pulse events that have started <= currentBeat

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.pitch < SHAKE_PITCH_MIN || ev.pitch >= SHAPE_PITCH_MIN) continue;

      const timeSinceBeats = currentBeat - ev.startTimeInBeats;
      const timeSinceSec = timeSinceBeats * secPerBeat;
      if (timeSinceSec < 0) continue; // hasn't started yet

      if (ev.pitch <= SHAKE_PITCH_MAX) {
        // Shake trigger
        if (timeSinceSec < 0.5) { // shakes are always short-lived
          activeShakes.push({ startSec: timeSinceSec, velocity: ev.velocity });
        }
      } else if (ev.pitch <= PULSE_PITCH_MAX) {
        pulseTotal++;
        // Color pulse trigger
        if (timeSinceSec < pulseWindow) {
          activePulses.push({ startSec: timeSinceSec, velocity: ev.velocity, pitch: ev.pitch });
        }
      }
    }

    // Permanently jump accumulated hue offset for each new pulse event
    const prevPulseCount = lastPulseCountRef.current;
    if (pulseTotal > prevPulseCount) {
      accHueOffsetRef.current += (pulseTotal - prevPulseCount) * pulseHue;
    } else if (pulseTotal < prevPulseCount) {
      // Seek/rewind: recount
      accHueOffsetRef.current = pulseTotal * pulseHue;
    }
    lastPulseCountRef.current = pulseTotal;

    // --- Shake: apply jitter to the whole group + scale bump ---
    let shakeX = 0, shakeY = 0;
    let shakeScaleBump = 0;
    for (let si = 0; si < activeShakes.length; si++) {
      const s = activeShakes[si];
      const decay = Math.exp(-s.startSec * shakeDecaySpd);
      const intensity = (s.velocity / 127) * shakeAmount * decay;
      // High-frequency oscillation with two incommensurate frequencies for organic feel
      shakeX += Math.sin(s.startSec * 80 + si * 1.7) * intensity;
      shakeY += Math.cos(s.startSec * 97 + si * 2.3) * intensity;
      // Scale bump: sudden increase that decays quickly
      shakeScaleBump += (s.velocity / 127) * shakeScale * decay;
    }
    group.position.set(shakeX, shakeY, 0);

    // Mark all pool entries as inactive
    for (const p of poolRef.current) {
      p.active = false;
      p.lineLoop.visible = false;
    }

    // For each MIDI note, spawn copies at regular intervals during its duration.
    // Each copy has a fixed rotation offset, creating apparent rotation as they fly by.
    // The dissolve point (z ~ 0) is synced to the note onset.
    let shapeIdx = 0; // running index for shape events only (for hue/spread)
    for (let ei = 0; ei < events.length; ei++) {
      const ev = events[ei];

      // Skip effect pitches
      if (ev.pitch < SHAPE_PITCH_MIN) continue;

      // Derive shape from pitch
      const petals = Math.min(Math.max(ev.pitch - 45, 3), 20);
      // Derive spirograph r/d from pitch (deterministic per-pitch shape)
      const pitchNorm = (ev.pitch % 24) / 24;
      const r = rBase + pitchNorm * 0.3;
      const d = dBase + pitchNorm * 0.25;

      // Per-note angular spacing between copies: derived from pitch so each
      // note has a visually distinct copy spread. This is a fixed geometric
      // property, not the rotation speed (which is handled by accRotationRef).
      const copySpacing = 0.1 * (0.5 + (ev.pitch % 12) / 12 * 1.5);

      // Sample spawnRate at note onset — determines copy count for this note's lifetime
      const noteSpawnRate = engine.getParamAtBeat(trackId, 'spawnRate', ev.startTimeInBeats, spawnRateDefault);
      const spawnInterval = 1 / noteSpawnRate;
      const noteEnd = ev.startTimeInBeats + ev.duration;
      const numCopies = Math.floor(ev.duration * noteSpawnRate);

      // Color for this note: hue from pitch + accumulated pulse offset
      const hue = (baseHue + shapeIdx * hueStep + accHueOffsetRef.current) % 1;
      _tmpColor.setHSL(hue, saturation, lightness);

      // Spread: deterministic per-event
      const spreadX = spread > 0 ? (Math.sin(shapeIdx * 7.31 + 0.5) * spread) : 0;
      const spreadY = spread > 0 ? (Math.cos(shapeIdx * 13.17 + 0.3) * spread) : 0;

      const geo = getShapeGeometry(shapeMode, petals, r, d);

      for (let ci = 0; ci <= numCopies; ci++) {
        const copyBeat = ev.startTimeInBeats + ci * spawnInterval;
        if (copyBeat > noteEnd) break;

        // z position: how far this copy is from the dissolve point (z=0 at copyBeat == currentBeat)
        const beatsAgo = currentBeat - copyBeat;
        const secondsAgo = beatsAgo * secPerBeat;
        const z = secondsAgo * speed;

        // Visibility: approaching from -farZ, fades out after passing camera
        if (z < -farZ || z > fadeOutZ) continue;

        const pooled = acquireLineLoop(group);
        pooled.lineLoop.geometry = geo;

        pooled.lineLoop.position.set(spreadX, spreadY, z);

        // Scale: sample scale param at this copy's spawn beat, then grow as it approaches
        const copyScale = engine.getParamAtBeat(trackId, 'scale', copyBeat, scaleDefault);
        const approachProgress = 1 - Math.max(0, -z) / farZ; // 0 at far, 1 at z=0
        const baseScale = shapeSize * copyScale;
        const finalScale = (baseScale + approachProgress * baseScale * 2) * (1 + shakeScaleBump);
        pooled.lineLoop.scale.setScalar(finalScale);

        // Rotation: accumulated base (continuous under automation) + per-copy spacing
        pooled.lineLoop.rotation.z = accRotationRef.current + ci * copySpacing;

        // --- Color pulse: propagating wavefront from z=0 outward ---
        let pulseBlend = 0;
        for (let pi = 0; pi < activePulses.length; pi++) {
          const pulse = activePulses[pi];
          const distFromCamera = Math.max(0, -z);
          const travelTime = distFromCamera / pulseSpeed;
          const timeSinceArrival = pulse.startSec - travelTime;
          if (timeSinceArrival >= 0 && timeSinceArrival < pulseDuration) {
            const norm = timeSinceArrival / pulseDuration;
            const envelope = Math.exp(-norm * 3);
            // Pitch controls brightness: lower pitches (24) = dim, higher (35) = full
            const pitchNorm = (pulse.pitch - PULSE_PITCH_MIN) / (PULSE_PITCH_MAX - PULSE_PITCH_MIN);
            const pitchIntensity = 0.15 + pitchNorm * 0.85; // range [0.15 .. 1.0]
            // Fade with distance: full intensity at camera, dies off toward far end
            const distanceFade = 1 - distFromCamera / farZ;
            const intensity = envelope * distanceFade * pitchIntensity * (pulse.velocity / 127);
            pulseBlend = Math.min(1, pulseBlend + intensity);
          }
        }

        // Glow: push lightness to white and HDR-multiply for searing bloom
        const glowLightness = lightness + pulseBlend * (1 - lightness);
        const glowBoost = 1 + pulseBlend * 25;
        _tmpColor.setHSL(hue, saturation * (1 - pulseBlend * 0.7), glowLightness);
        _tmpColor.multiplyScalar(glowBoost);

        // Color
        pooled.material.color.copy(_tmpColor);

        // Opacity: full while approaching, fade after passing camera
        if (z > 0) {
          pooled.material.opacity = Math.max(0, 1 - z / fadeOutZ);
        } else {
          pooled.material.opacity = 1;
        }
      }
      shapeIdx++;
    }
  });

  return <group ref={groupRef} />;
}

export const ShapeFlight: Instrument = {
  id: 'shapeFlight',
  name: 'Shape Flight',
  description: 'Spirograph shapes stream toward the camera during MIDI notes, dissolving on arrival',
  icon: '🔷',
  color: '#8b5cf6',
  hasAudio: false,
  hasVisual: true,
  editorType: 'generic',

  noteRange: { min: 12, max: 84 },
  rangeLabels: [
    { startPitch: 12, endPitch: 23, label: 'Shake' },
    { startPitch: 24, endPitch: 35, label: 'Pulse' },
    { startPitch: 36, endPitch: 84, label: 'Shapes' },
  ],

  defaultSettings: {
    speed: 12,
    spread: 0,
    farZ: 40,
    shapeSize: 0.4,
    shapeMode: 'spirograph',
    spawnRate: 8,
    scale: 1,
    rotationStep: 0.15,
    fadeOutZ: 10,
    hueStep: 0.08,
    baseHue: 0.55,
    saturation: 0.9,
    lightness: 0.85,
    rBase: 0.25,
    dBase: 0.7,
    pulseSpeed: 200,
    pulseDuration: 0.4,
    pulseHue: 0.25,
    shakeAmount: 0.5,
    shakeDecay: 20,
    shakeScale: 0.5,
  },

  settingsSchema: {
    shapeMode:     { type: 'select', label: 'Shape Mode', options: [{ value: 'spirograph', label: 'Spirograph' }, { value: 'polygon', label: 'Polygon' }, { value: 'polar', label: 'Polar Graph' }], default: 'spirograph' },
    speed:         { type: 'number', label: 'Flight Speed',      min: 2,    max: 40,   step: 1,     default: 12 },
    spawnRate:     { type: 'number', label: 'Copies per Beat',    min: 1,    max: 32,   step: 1,     default: 8 },
    scale:         { type: 'number', label: 'Scale',              min: 0.1,  max: 5,    step: 0.1,   default: 1 },
    rotationStep:  { type: 'number', label: 'Rotation Step',      min: -1,   max: 1,    step: 0.01,  default: 0.15 },
    spread:        { type: 'number', label: 'Spread',             min: 0,    max: 10,   step: 0.5,   default: 0 },
    farZ:          { type: 'number', label: 'Spawn Depth',        min: 10,   max: 100,  step: 5,     default: 40 },
    shapeSize:     { type: 'number', label: 'Shape Size',         min: 0.1,  max: 2,    step: 0.1,   default: 0.4 },
    fadeOutZ:      { type: 'number', label: 'Fade Out Distance',  min: 2,    max: 30,   step: 1,     default: 10 },
    hueStep:       { type: 'number', label: 'Hue Step',           min: 0,    max: 0.5,  step: 0.01,  default: 0.08 },
    baseHue:       { type: 'number', label: 'Base Hue',           min: 0,    max: 1,    step: 0.05,  default: 0.55 },
    saturation:    { type: 'number', label: 'Saturation',         min: 0,    max: 1,    step: 0.05,  default: 0.9 },
    lightness:     { type: 'number', label: 'Lightness',          min: 0.1,  max: 1,    step: 0.05,  default: 0.85 },
    rBase:         { type: 'number', label: 'R Base',              min: 0.05, max: 0.5,  step: 0.01,  default: 0.25 },
    dBase:         { type: 'number', label: 'D Base',              min: 0.1,  max: 1.0,  step: 0.05,  default: 0.7 },
    pulseSpeed:    { type: 'number', label: 'Pulse Speed',         min: 5,    max: 500,  step: 5,     default: 200 },
    pulseDuration: { type: 'number', label: 'Pulse Duration',      min: 0.1,  max: 2,    step: 0.05,  default: 0.4 },
    pulseHue:      { type: 'number', label: 'Pulse Hue Jump',        min: -0.5, max: 0.5,  step: 0.05,  default: 0.25 },
    shakeAmount:   { type: 'number', label: 'Shake Amount',        min: 0.1,  max: 3,    step: 0.1,   default: 0.5 },
    shakeDecay:    { type: 'number', label: 'Shake Decay',         min: 5,    max: 50,   step: 1,     default: 20 },
    shakeScale:    { type: 'number', label: 'Shake Scale Bump',    min: 0,    max: 2,    step: 0.1,   default: 0.5 },
  },

  VisualComponent: ShapeFlightVisual,
};
