'use client';

import { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { Instrument } from '../types';

const PITCH_NEXT_WORD = 48;
const PITCH_HEIGHT_MIN = 60;  // C4
const PITCH_HEIGHT_MAX = 72;  // C5
const PITCH_HEIGHT_CENTER = 66; // F#4 = no offset
const MAX_DELAY_TAPS = 8;

const DEFAULTS = {
  text: 'Hello World',
  fontSize: 1,
  fontFamily: 'Impact',
  strokeWidth: 0.05,
  delayTaps: 3,
  delayTime: 0.3,
  delayScaleFalloff: 0.15,
  delayOpacityFalloff: 0.25,
  heightAmount: 0.35,
  opacity: 1,
  color: '#ffffff',
};

interface WordHistoryEntry {
  word: string;
  triggerTime: number;
  duration: number; // seconds the note was held
  yOffset: number;  // normalized Y offset at trigger time (-1 to 1)
}

// Shared canvas cache keyed by (word, canvasSize, strokeWidth, fontFamily, color)
const canvasCache = new Map<string, HTMLCanvasElement>();
const CANVAS_CACHE_MAX = 64;

function createTextCanvas(
  word: string,
  canvasSize: number,
  strokeWidth: number,
  fontFamily: string = DEFAULTS.fontFamily,
  color: string = DEFAULTS.color,
): HTMLCanvasElement {
  const key = `${word}|${canvasSize}|${strokeWidth}|${fontFamily}|${color}`;
  const cached = canvasCache.get(key);
  if (cached) return cached;

  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize * dpr;
  canvas.height = canvasSize * dpr;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  let fontSize = canvasSize * 0.35;
  const fontStr = (size: number) => `900 ${size}px "${fontFamily}", "Arial Black", sans-serif`;
  ctx.font = fontStr(fontSize);

  // Shrink font if text is wider than canvas (with padding for stroke)
  const maxWidth = canvasSize * 0.9;
  const measured = ctx.measureText(word);
  if (measured.width > maxWidth) {
    fontSize *= maxWidth / measured.width;
    ctx.font = fontStr(fontSize);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const sw = Math.max(1, strokeWidth * fontSize);
  ctx.lineWidth = sw;
  ctx.strokeStyle = 'black';
  ctx.lineJoin = 'round';
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  ctx.strokeText(word, cx, cy);

  ctx.fillStyle = color;
  ctx.fillText(word, cx, cy);

  // Evict oldest entries if cache is full
  if (canvasCache.size >= CANVAS_CACHE_MAX) {
    const firstKey = canvasCache.keys().next().value!;
    canvasCache.delete(firstKey);
  }
  canvasCache.set(key, canvas);

  return canvas;
}

function TextDisplayVisual({ trackId }: { trackId: string }) {
  const engineRef = useRef(getVisualPlaybackEngine());
  const meshRef = useRef<THREE.Mesh>(null);
  const prevCountRef = useRef(0);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const lastWordRef = useRef('');
  const lastStrokeRef = useRef(-1);
  const lastFontRef = useRef('');
  const lastColorRef = useRef('');
  const noteOnTimeRef = useRef(-1); // clock time when current note started
  const currentYOffsetRef = useRef(0); // current height offset (-1 to 1)
  const { viewport } = useThree();
  const [ready, setReady] = useState(false);

  // Delay echo state — each trigger spawns its own set of echoes
  const wordHistoryRef = useRef<WordHistoryEntry[]>([]);
  const echoMeshesRef = useRef<THREE.Mesh[]>([]);
  const echoTexturesRef = useRef<THREE.CanvasTexture[]>([]);
  const echoLastWordsRef = useRef<string[]>([]);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const tex = new THREE.CanvasTexture(createTextCanvas('Hello', 512, DEFAULTS.strokeWidth));
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    textureRef.current = tex;
    lastWordRef.current = 'Hello';
    lastStrokeRef.current = DEFAULTS.strokeWidth;

    // Pre-create one mesh per tap slot
    const meshes: THREE.Mesh[] = [];
    const textures: THREE.CanvasTexture[] = [];
    const lastWords: string[] = [];
    for (let i = 0; i < MAX_DELAY_TAPS; i++) {
      const echoTex = new THREE.CanvasTexture(createTextCanvas('', 512, DEFAULTS.strokeWidth));
      echoTex.minFilter = THREE.LinearFilter;
      echoTex.magFilter = THREE.LinearFilter;
      textures.push(echoTex);
      lastWords.push('');

      const mat = new THREE.MeshBasicMaterial({
        map: echoTex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.visible = false;
      meshes.push(mesh);
    }
    echoMeshesRef.current = meshes;
    echoTexturesRef.current = textures;
    echoLastWordsRef.current = lastWords;

    setReady(true);
    return () => {
      tex.dispose();
      for (const t of textures) t.dispose();
      for (const m of meshes) {
        (m.material as THREE.Material).dispose();
        m.geometry.dispose();
      }
    };
  }, []);

  // Add echo meshes to the group once ready
  useEffect(() => {
    if (!ready || !groupRef.current) return;
    for (const mesh of echoMeshesRef.current) {
      groupRef.current.add(mesh);
    }
    return () => {
      for (const mesh of echoMeshesRef.current) {
        groupRef.current?.remove(mesh);
      }
    };
  }, [ready]);

  useFrame(({ clock }) => {
    const state = engineRef.current.getTrackState(trackId);
    if (!state || !textureRef.current || !meshRef.current) return;

    const text = (state.params.text as string) ?? DEFAULTS.text;
    const fontSize = (state.params.fontSize as number) ?? DEFAULTS.fontSize;
    const fontFamily = (state.params.fontFamily as string) ?? DEFAULTS.fontFamily;
    const strokeWidth = (state.params.strokeWidth as number) ?? DEFAULTS.strokeWidth;
    const delayTaps = (state.params.delayTaps as number) ?? DEFAULTS.delayTaps;
    const delayTime = (state.params.delayTime as number) ?? DEFAULTS.delayTime;
    const delayScaleFalloff = (state.params.delayScaleFalloff as number) ?? DEFAULTS.delayScaleFalloff;
    const delayOpacityFalloff = (state.params.delayOpacityFalloff as number) ?? DEFAULTS.delayOpacityFalloff;
    const heightAmount = (state.params.heightAmount as number) ?? DEFAULTS.heightAmount;
    const textOpacity = (state.params.opacity as number) ?? DEFAULTS.opacity;
    const color = (state.params.color as string) ?? DEFAULTS.color;

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    const now = clock.getElapsedTime();

    // Detect new word triggers
    const currentCount = state.pitchNoteOnCounts.get(PITCH_NEXT_WORD) ?? 0;
    const wordIndex = currentCount > 0 ? (currentCount - 1) % words.length : 0;
    const currentWord = words[wordIndex];

    const isNoteHeld = state.activeNotes.has(PITCH_NEXT_WORD);

    // Compute current height offset from latest held height pitch
    let latestHeightPitch = -1;
    for (const pitch of state.activeNotes.keys()) {
      if (pitch >= PITCH_HEIGHT_MIN && pitch <= PITCH_HEIGHT_MAX) {
        latestHeightPitch = Math.max(latestHeightPitch, pitch);
      }
    }
    if (latestHeightPitch >= 0) {
      // Map pitch to -1..1, with PITCH_HEIGHT_CENTER = 0
      currentYOffsetRef.current = (latestHeightPitch - PITCH_HEIGHT_CENTER) / (PITCH_HEIGHT_MAX - PITCH_HEIGHT_CENTER);
    }

    if (currentCount !== prevCountRef.current && currentCount > 0) {
      wordHistoryRef.current.push({ word: currentWord, triggerTime: now, duration: 0, yOffset: currentYOffsetRef.current });
      noteOnTimeRef.current = now;
      prevCountRef.current = currentCount;
    }

    // Update duration of the latest entry while note is held
    const history = wordHistoryRef.current;
    if (isNoteHeld && history.length > 0 && noteOnTimeRef.current >= 0) {
      history[history.length - 1].duration = now - noteOnTimeRef.current;
    } else if (!isNoteHeld && noteOnTimeRef.current >= 0) {
      // Note released — finalize duration
      if (history.length > 0) {
        history[history.length - 1].duration = now - noteOnTimeRef.current;
      }
      noteOnTimeRef.current = -1;
    }

    // Prune old history entries whose echoes have fully expired
    const maxEchoLifetime = delayTaps * delayTime + 10; // generous buffer
    wordHistoryRef.current = history.filter(
      (e) => now - e.triggerTime < maxEchoLifetime
    );

    // Update main mesh texture
    if (currentWord !== lastWordRef.current || strokeWidth !== lastStrokeRef.current || fontFamily !== lastFontRef.current || color !== lastColorRef.current) {
      const canvas = createTextCanvas(currentWord, 512, strokeWidth, fontFamily, color);
      textureRef.current.image = canvas;
      textureRef.current.needsUpdate = true;
      lastWordRef.current = currentWord;
      lastStrokeRef.current = strokeWidth;
      lastFontRef.current = fontFamily;
      lastColorRef.current = color;
    }

    // Main mesh visibility and opacity — only while note is held
    meshRef.current.visible = isNoteHeld;
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = textOpacity;

    const baseScale = Math.min(viewport.width, viewport.height) * 0.6 * fontSize;
    meshRef.current.scale.set(baseScale, baseScale, 1);
    meshRef.current.position.y = currentYOffsetRef.current * viewport.height * heightAmount;

    for (let tap = 0; tap < MAX_DELAY_TAPS; tap++) {
      const mesh = echoMeshesRef.current[tap];
      if (!mesh) continue;

      if (tap >= delayTaps) {
        mesh.visible = false;
        continue;
      }

      const tapNum = tap + 1; // tap 1, 2, 3...
      const tapOffset = tapNum * delayTime;

      // Find the most recent trigger whose echo has arrived for this tap
      let bestEntry: WordHistoryEntry | null = null;
      let bestEchoAge = Infinity;
      for (let h = history.length - 1; h >= 0; h--) {
        const echoAge = now - (history[h].triggerTime + tapOffset);
        if (echoAge >= 0 && echoAge < bestEchoAge) {
          bestEntry = history[h];
          bestEchoAge = echoAge;
          break; // history is chronological, most recent match wins
        }
      }

      if (!bestEntry) {
        mesh.visible = false;
        continue;
      }

      // Echo is visible for the same duration as the original note was held
      const echoDuration = bestEntry.duration > 0 ? bestEntry.duration : delayTime;
      if (bestEchoAge > echoDuration) {
        mesh.visible = false;
        continue;
      }

      const tapOpacity = Math.max(0.01, 1 - delayOpacityFalloff * tapNum);
      const opacity = tapOpacity * textOpacity;

      // Update texture if word changed for this slot
      const tex = echoTexturesRef.current[tap];
      if (bestEntry.word !== echoLastWordsRef.current[tap]) {
        const canvas = createTextCanvas(bestEntry.word, 512, strokeWidth, fontFamily, color);
        tex.image = canvas;
        tex.needsUpdate = true;
        echoLastWordsRef.current[tap] = bestEntry.word;
      }

      const tapScale = baseScale * Math.max(0.1, 1 - delayScaleFalloff * tapNum);
      mesh.scale.set(tapScale, tapScale, 1);
      mesh.position.y = bestEntry.yOffset * viewport.height * heightAmount;
      mesh.position.z = -0.01 * tapNum;

      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = opacity;
      mesh.visible = true;
    }
  });

  if (!ready) return null;

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={textureRef.current}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export const TextDisplay: Instrument = {
  id: 'textDisplay',
  name: 'Text Display',
  description: 'Displays text words one at a time, advancing on each MIDI note',
  icon: '𝐓',
  color: '#ffffff',
  hasAudio: false,
  hasVisual: true,
  editorType: 'generic',
  noteRange: { min: 48, max: 72 },
  rangeLabels: [
    { startPitch: 48, endPitch: 48, label: 'Next Word' },
    { startPitch: 60, endPitch: 72, label: 'Height Offset' },
  ],

  defaultSettings: { ...DEFAULTS },

  settingsSchema: {
    text: {
      type: 'string', label: 'Text', default: DEFAULTS.text,
    },
    fontSize: {
      type: 'number', label: 'Font Size', min: 0.1, max: 5, step: 0.1,
      default: DEFAULTS.fontSize,
    },
    fontFamily: {
      type: 'select', label: 'Font Family',
      default: DEFAULTS.fontFamily,
      options: [
        { value: 'Impact', label: 'Impact' },
        { value: 'Arial Black', label: 'Arial Black' },
        { value: 'Georgia', label: 'Georgia' },
        { value: 'Courier New', label: 'Courier New' },
        { value: 'Times New Roman', label: 'Times New Roman' },
        { value: 'Verdana', label: 'Verdana' },
        { value: 'Comic Sans MS', label: 'Comic Sans MS' },
        { value: 'Trebuchet MS', label: 'Trebuchet MS' },
      ],
    },
    strokeWidth: {
      type: 'number', label: 'Stroke Width', min: 0, max: 0.2, step: 0.01,
      default: DEFAULTS.strokeWidth,
    },
    delayTaps: {
      type: 'number', label: 'Delay Taps', min: 0, max: MAX_DELAY_TAPS, step: 1,
      default: DEFAULTS.delayTaps,
    },
    delayTime: {
      type: 'number', label: 'Delay Time', min: 0.05, max: 2, step: 0.05,
      default: DEFAULTS.delayTime,
    },
    delayScaleFalloff: {
      type: 'number', label: 'Delay Scale Falloff', min: 0, max: 0.5, step: 0.02,
      default: DEFAULTS.delayScaleFalloff,
    },
    delayOpacityFalloff: {
      type: 'number', label: 'Delay Opacity Falloff', min: 0, max: 0.5, step: 0.02,
      default: DEFAULTS.delayOpacityFalloff,
    },
    opacity: {
      type: 'number', label: 'Opacity', min: 0, max: 1, step: 0.05,
      default: DEFAULTS.opacity,
    },
    color: {
      type: 'color', label: 'Color',
      default: DEFAULTS.color,
    },
    heightAmount: {
      type: 'number', label: 'Height Amount', min: 0, max: 1, step: 0.05,
      default: DEFAULTS.heightAmount,
    },
  },

  VisualComponent: TextDisplayVisual,
};
