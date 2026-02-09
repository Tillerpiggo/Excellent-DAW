'use client';

import { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { Instrument } from '../types';

const PITCH_NEXT_WORD = 48;

const DEFAULTS = {
  text: 'Hello World',
  fontSize: 1,
  strokeWidth: 0.05,
};

function createTextCanvas(
  word: string,
  canvasSize: number,
  strokeWidth: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, canvasSize, canvasSize);

  const fontSize = canvasSize * 0.35;
  ctx.font = `900 ${fontSize}px "Impact", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Black stroke
  const sw = Math.max(1, strokeWidth * fontSize);
  ctx.lineWidth = sw;
  ctx.strokeStyle = 'black';
  ctx.lineJoin = 'round';
  ctx.strokeText(word, canvasSize / 2, canvasSize / 2);

  // White fill
  ctx.fillStyle = 'white';
  ctx.fillText(word, canvasSize / 2, canvasSize / 2);

  return canvas;
}

function TextDisplayVisual({ trackId }: { trackId: string }) {
  const engineRef = useRef(getVisualPlaybackEngine());
  const meshRef = useRef<THREE.Mesh>(null);
  const wordIndexRef = useRef(0);
  const prevCountRef = useRef(0);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const lastWordRef = useRef('');
  const lastStrokeRef = useRef(-1);
  const { viewport } = useThree();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const tex = new THREE.CanvasTexture(createTextCanvas('Hello', 512, DEFAULTS.strokeWidth));
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    textureRef.current = tex;
    lastWordRef.current = 'Hello';
    lastStrokeRef.current = DEFAULTS.strokeWidth;
    setReady(true);
    return () => { tex.dispose(); };
  }, []);

  useFrame(() => {
    const state = engineRef.current.getTrackState(trackId);
    if (!state || !textureRef.current || !meshRef.current) return;

    const text = (state.params.text as string) ?? DEFAULTS.text;
    const fontSize = (state.params.fontSize as number) ?? DEFAULTS.fontSize;
    const strokeWidth = (state.params.strokeWidth as number) ?? DEFAULTS.strokeWidth;

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    // Use the cumulative count directly as the word index (first note = word 0)
    const currentCount = state.pitchNoteOnCounts.get(PITCH_NEXT_WORD) ?? 0;
    const wordIndex = currentCount > 0 ? (currentCount - 1) % words.length : 0;
    const currentWord = words[wordIndex];

    // Re-render canvas only when word or stroke changes
    if (currentWord !== lastWordRef.current || strokeWidth !== lastStrokeRef.current) {
      const canvas = createTextCanvas(currentWord, 512, strokeWidth);
      textureRef.current.image = canvas;
      textureRef.current.needsUpdate = true;
      lastWordRef.current = currentWord;
      lastStrokeRef.current = strokeWidth;
    }

    // Only visible while a note is held on pitch 48
    const isNoteHeld = state.activeNotes.has(PITCH_NEXT_WORD);
    meshRef.current.visible = isNoteHeld;

    // Scale the quad to fill a good portion of the viewport
    const scale = Math.min(viewport.width, viewport.height) * 0.6 * fontSize;
    meshRef.current.scale.set(scale, scale, 1);
  });

  if (!ready) return null;

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={textureRef.current}
        transparent
        depthWrite={false}
      />
    </mesh>
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
  noteRange: { min: 48, max: 48 },
  rangeLabels: [
    { startPitch: 48, endPitch: 48, label: 'Next Word' },
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
    strokeWidth: {
      type: 'number', label: 'Stroke Width', min: 0, max: 0.2, step: 0.01,
      default: DEFAULTS.strokeWidth,
    },
  },

  VisualComponent: TextDisplayVisual,
};
