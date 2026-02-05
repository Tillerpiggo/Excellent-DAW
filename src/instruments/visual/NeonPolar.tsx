'use client';

import { useRef, useEffect } from 'react';
import { useFrame, extend, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { Instrument } from '../types';

// Extend r3f to recognize Line2
extend({ Line2, LineMaterial, LineGeometry });

interface NeonPolarProps {
  trackId: string;
}

interface PolarCurve {
  id: number;
  birthTime: number;
  phaseOffset: number;
  radiusOffset: number;
  opacity: number;
  hue: number;
  line: Line2;
  geometry: LineGeometry;
  material: LineMaterial;
}

// Configuration
const CONFIG = {
  pointCount: 512, // More points for smoother curves
  initialRadius: 0.6,
  expansionSpeed: 0.5,
  maxRadiusOffset: 5,
  fadeStartOffset: 2,
  zWobbleAmplitude: 0.12,
  zWobbleFrequency: 6,
  lineWidth: 4, // Thick lines!
  // Oscillation parameters for symmetric rose curve
  oscSpeed: 0.25,
  // Symmetric rose: r = 1 + amp * cos(petals * θ)
  petalsBase: 6, // Base number of petals (6-fold symmetry)
  petalsRange: 2, // Oscillates between 4-8 petals
  ampBase: 0.5,
  ampRange: 0.15,
  // Secondary modulation for more complex shapes
  secondaryPetals: 3,
  secondaryAmpBase: 0.2,
  secondaryAmpRange: 0.1,
};

let curveIdCounter = 0;

interface OscParams {
  oscSpeed: number;
  zWobble: number;
  lineWidth: number;
}

// Oscillation for number of petals (stays integer-ish for cleaner symmetry)
function oscillatePetals(time: number, phaseOffset: number, oscSpeed: number): number {
  const t = time * oscSpeed + phaseOffset;
  const raw = CONFIG.petalsBase + Math.sin(t * 0.4) * CONFIG.petalsRange;
  return Math.round(raw); // Keep it integer for clean symmetry
}

// Oscillation for amplitude
function oscillateAmp(time: number, phaseOffset: number, oscSpeed: number): number {
  const t = time * oscSpeed + phaseOffset;
  return CONFIG.ampBase + Math.sin(t * 0.7 + 0.3) * CONFIG.ampRange;
}

// Secondary amplitude oscillation
function oscillateSecondaryAmp(time: number, phaseOffset: number, oscSpeed: number): number {
  const t = time * oscSpeed + phaseOffset;
  return CONFIG.secondaryAmpBase + Math.sin(t * 0.5 + 1.1) * CONFIG.secondaryAmpRange;
}

// Generate points for symmetric polar rose curve
// r = 1 + amp1 * cos(n1 * θ) + amp2 * cos(n2 * θ)
function generateCurvePoints(
  time: number,
  phaseOffset: number,
  radiusOffset: number,
  params: OscParams
): number[] {
  const positions: number[] = [];

  const petals = oscillatePetals(time, phaseOffset, params.oscSpeed);
  const amp = oscillateAmp(time, phaseOffset, params.oscSpeed);
  const secondaryAmp = oscillateSecondaryAmp(time, phaseOffset, params.oscSpeed);

  for (let i = 0; i <= CONFIG.pointCount; i++) {
    const theta = (i / CONFIG.pointCount) * Math.PI * 2;

    // Symmetric rose curve: r = 1 + amp * cos(petals * θ) + secondaryAmp * cos(secondaryPetals * θ)
    // This is inherently symmetric with n-fold rotational symmetry
    const baseR = 1 + amp * Math.cos(petals * theta) + secondaryAmp * Math.cos(CONFIG.secondaryPetals * theta);

    // Add to radius for outward expansion
    const r = (baseR * CONFIG.initialRadius) + radiusOffset;

    // Convert to cartesian
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);

    // Z wobble - symmetric pattern
    const zWobblePhase = theta * CONFIG.zWobbleFrequency + time * 0.4 + phaseOffset * 0.2;
    const z = Math.sin(zWobblePhase) * params.zWobble * (1 + radiusOffset * 0.08);

    positions.push(x, y, z);
  }

  return positions;
}

// Bright, glowy color for bloom
function getColorForDistance(baseHue: number, radiusOffset: number): THREE.Color {
  const hueShift = radiusOffset * 0.04;
  const hue = (baseHue + hueShift) % 1;
  // High saturation and lightness for maximum glow
  const saturation = 1.0;
  const lightness = 0.65 + radiusOffset * 0.03;

  const color = new THREE.Color();
  color.setHSL(hue, saturation, Math.min(lightness, 0.75));
  return color;
}

function createCurveLine(
  scene: THREE.Group,
  resolution: THREE.Vector2,
  lineWidth: number,
  initialPositions: number[]
): { line: Line2; geometry: LineGeometry; material: LineMaterial } {
  const geometry = new LineGeometry();
  geometry.setPositions(initialPositions);

  const material = new LineMaterial({
    color: 0xffffff,
    linewidth: lineWidth,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    // Required for LineMaterial
    resolution,
    worldUnits: false, // Use screen-space width
  });

  const line = new Line2(geometry, material);
  line.computeLineDistances();
  scene.add(line);

  return { line, geometry, material };
}

function NeonPolarVisual({ trackId }: NeonPolarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const engineRef = useRef(getVisualPlaybackEngine());
  const curvesRef = useRef<PolarCurve[]>([]);
  const lastNoteOnCountRef = useRef(0);
  const timeRef = useRef(0);
  const hueCounterRef = useRef(0);
  const { size } = useThree();
  const resolutionRef = useRef(new THREE.Vector2(size.width, size.height));

  // Update resolution when size changes
  useEffect(() => {
    resolutionRef.current.set(size.width, size.height);
    // Update all existing materials
    for (const curve of curvesRef.current) {
      curve.material.resolution.set(size.width, size.height);
    }
  }, [size.width, size.height]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const state = engineRef.current.getTrackState(trackId);
    if (!state) return;

    // Get params from state
    const expansionSpeed = (state.params.expansionSpeed as number) ?? CONFIG.expansionSpeed;
    const zWobble = (state.params.zWobble as number) ?? CONFIG.zWobbleAmplitude;
    const oscSpeed = (state.params.oscSpeed as number) ?? CONFIG.oscSpeed;
    const lineWidth = (state.params.lineWidth as number) ?? CONFIG.lineWidth;
    const oscParams: OscParams = { oscSpeed, zWobble, lineWidth };

    timeRef.current += delta;
    const time = timeRef.current;

    // Spawn new curve on MIDI event
    if (state.noteOnCount > lastNoteOnCountRef.current) {
      const newCount = state.noteOnCount - lastNoteOnCountRef.current;
      lastNoteOnCountRef.current = state.noteOnCount;

      for (let i = 0; i < newCount; i++) {
        const phaseOffset = (hueCounterRef.current * 0.7) + Math.random() * 0.3;
        const baseHue = (hueCounterRef.current * 0.12) % 1;
        hueCounterRef.current++;

        // Generate initial positions before creating the line
        const initialPositions = generateCurvePoints(time, phaseOffset, 0, oscParams);
        const { line, geometry, material } = createCurveLine(group, resolutionRef.current, lineWidth, initialPositions);

        const curve: PolarCurve = {
          id: curveIdCounter++,
          birthTime: time,
          phaseOffset,
          radiusOffset: 0,
          opacity: 1,
          hue: baseHue,
          line,
          geometry,
          material,
        };

        curvesRef.current.push(curve);
      }
    }

    // Update all curves
    const deadCurves: PolarCurve[] = [];

    for (const curve of curvesRef.current) {
      curve.radiusOffset += expansionSpeed * delta;

      // Fade based on distance
      if (curve.radiusOffset > CONFIG.fadeStartOffset) {
        const fadeProg = (curve.radiusOffset - CONFIG.fadeStartOffset) /
                         (CONFIG.maxRadiusOffset - CONFIG.fadeStartOffset);
        curve.opacity = Math.max(0, 1 - fadeProg);
      }

      if (curve.radiusOffset > CONFIG.maxRadiusOffset || curve.opacity <= 0) {
        deadCurves.push(curve);
        continue;
      }

      // Update geometry
      const positions = generateCurvePoints(time, curve.phaseOffset, curve.radiusOffset, oscParams);
      curve.geometry.setPositions(positions);
      curve.line.computeLineDistances();

      // Update color and opacity
      const color = getColorForDistance(curve.hue, curve.radiusOffset);
      curve.material.color.copy(color);
      curve.material.opacity = curve.opacity;
      curve.material.linewidth = lineWidth;
    }

    // Remove dead curves
    for (const curve of deadCurves) {
      group.remove(curve.line);
      curve.geometry.dispose();
      curve.material.dispose();
    }
    curvesRef.current = curvesRef.current.filter(c => !deadCurves.includes(c));
  });

  return <group ref={groupRef} />;
}

export const NeonPolar: Instrument = {
  id: 'neonPolar',
  name: 'Neon Polar',
  description: 'Symmetric neon rose curves spawn on MIDI events and expand outward',
  icon: '💫',
  color: '#ff6b9d',
  hasAudio: false,
  hasVisual: true,
  editorType: 'generic',

  defaultSettings: {
    expansionSpeed: 0.5,
    zWobble: 0.12,
    oscSpeed: 0.25,
    lineWidth: 4,
  },

  settingsSchema: {
    expansionSpeed: { type: 'number', label: 'Expansion Speed', min: 0.1, max: 2, step: 0.1, default: 0.5 },
    zWobble: { type: 'number', label: 'Z Wobble', min: 0, max: 0.4, step: 0.02, default: 0.12 },
    oscSpeed: { type: 'number', label: 'Oscillation Speed', min: 0.1, max: 1, step: 0.05, default: 0.25 },
    lineWidth: { type: 'number', label: 'Line Width', min: 1, max: 10, step: 0.5, default: 4 },
  },

  VisualComponent: NeonPolarVisual,
};
