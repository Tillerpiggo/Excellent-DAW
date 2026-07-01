'use client';

import { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { virtualClock } from '@/core/virtualClock';
import { useUIStore } from '@/stores/uiStore';
import { Instrument } from '../types';
import { loadFont, isFontReady } from '@/utils/fonts';

const PITCH_BASS_POP = 47;
const PITCH_NEXT_WORD = 48;
const PITCH_HEIGHT_MIN = 60;  // C4
const PITCH_HEIGHT_MAX = 72;  // C5
const PITCH_HEIGHT_CENTER = 66; // F#4 = no offset
const MAX_DELAY_TAPS = 8;
const MAX_REVERB_REFLECTIONS = 16;

// Deterministic pseudo-random offsets per reverb reflection (seeded by index)
const REVERB_OFFSETS = Array.from({ length: MAX_REVERB_REFLECTIONS }, (_, i) => {
  // Simple seeded hash per index for deterministic values in 0..1
  const seed = (i + 1) * 2654435761;
  const hash = (n: number) => ((n >>> 0) & 0x7fffffff) / 0x7fffffff;
  return {
    t: hash((seed * 13) ^ 0xdeadbeef),       // time scatter 0..1
    x: hash((seed * 17) ^ 0xcafebabe) * 2 - 1, // X jitter -1..1
    y: hash((seed * 23) ^ 0xfeedface) * 2 - 1, // Y jitter -1..1
    s: hash((seed * 31) ^ 0xbaadf00d),        // scale variation 0..1
  };
});

const DEFAULTS = {
  text: 'Hello World',
  fontSize: 1,
  fontFamily: 'Impact',
  fontVariant: '900 normal',
  strokeWidth: 0.05,
  releaseDuration: 0.4,
  delayTaps: 0,
  delayTime: 0.3,
  delayScaleFalloff: 0.15,
  delayOpacityFalloff: 0.25,
  pingPongEnabled: false,
  pingPongWidth: 0.3,
  heightLegato: false,
  heightLegatoSpeed: 4,
  heightAmount: 0.35,
  opacity: 1,
  color: '#ffffff',
  strokeColor: '',
  reverbEnabled: false,
  reverbReflections: 12,
  reverbDecay: 1.5,
  reverbSpread: 0.15,
  onsetBounce: 0.08,
  onsetFadeIn: true,
  releaseFadeOut: true,
  flightEnabled: false,
  flightSpeed: 15,
  flightMaxDepth: 50,
  flightDrift: 0.3,
  flightTumble: 0.5,
  flightSubdivRate: 8,
  rainbowEnabled: false,
  rainbowCycleLength: 12,
};

interface WordHistoryEntry {
  word: string;
  sizeWord?: string; // full word for sizing (syllable mode)
  italic?: boolean;
  triggerTime: number;
  duration: number; // seconds the note was held
  yOffset: number;  // normalized Y offset at trigger time (-1 to 1)
}

const MAX_FLIGHT_SPRITES = 128;

interface FlightSprite {
  mesh: THREE.Mesh;
  texture: THREE.CanvasTexture;
  birthTime: number;
  vx: number;
  vy: number;
  tumbleX: number;
  tumbleY: number;
  targetScale: number;
  word: string;
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const TEXT_CANVAS_SIZE = 1024;

// Shared canvas cache keyed by (word, canvasSize, strokeWidth, fontFamily, color)
const canvasCache = new Map<string, HTMLCanvasElement>();
const CANVAS_CACHE_MAX = 64;

// sizeWord: optional full word used for font sizing (for syllable rendering)
// When provided, font is sized to fit sizeWord, but displayWord is drawn
// left-aligned from where sizeWord would start (so partial text stays in place).
function createTextCanvas(
  word: string,
  canvasSize: number,
  strokeWidth: number,
  fontFamily: string = DEFAULTS.fontFamily,
  color: string = DEFAULTS.color,
  fontVariant: string = DEFAULTS.fontVariant,
  strokeColor: string = DEFAULTS.strokeColor,
  sizeWord?: string,
): HTMLCanvasElement {
  const fontReady = isFontReady(fontFamily, fontVariant);
  const key = `${word}|${sizeWord ?? ''}|${canvasSize}|${strokeWidth}|${fontFamily}|${color}|${fontVariant}|${fontReady}|${strokeColor}`;
  const cached = canvasCache.get(key);
  if (cached) return cached;

  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize * dpr;
  canvas.height = canvasSize * dpr;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  const [weight, style] = fontVariant.split(' ');
  let fontSize = canvasSize * 0.35;
  const fontStr = (size: number) => `${style === 'italic' ? 'italic ' : ''}${weight} ${size}px "${fontFamily}", "Arial Black", sans-serif`;
  ctx.font = fontStr(fontSize);

  // Size based on sizeWord (full word) if provided, otherwise the displayed word
  const measureWord = sizeWord ?? word;
  const maxWidth = canvasSize * 0.9;
  const measured = ctx.measureText(measureWord);
  if (measured.width > maxWidth) {
    fontSize *= maxWidth / measured.width;
    ctx.font = fontStr(fontSize);
  }

  ctx.textBaseline = 'middle';

  const drawStroke = strokeWidth > 0;
  if (drawStroke) {
    const sw = Math.max(1, strokeWidth * fontSize);
    ctx.lineWidth = sw;
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
    } else {
      ctx.fillStyle = color;
      const tmp = ctx.fillStyle;
      const r = parseInt(tmp.slice(1, 3), 16);
      const g = parseInt(tmp.slice(3, 5), 16);
      const b = parseInt(tmp.slice(5, 7), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      ctx.strokeStyle = luminance > 0.5 ? 'black' : 'white';
    }
    ctx.lineJoin = 'round';
  }

  const cy = canvasSize / 2;

  if (sizeWord && word !== sizeWord) {
    // Syllable mode: left-align from where the full word would start
    const fullWidth = ctx.measureText(sizeWord).width;
    const startX = (canvasSize - fullWidth) / 2;
    ctx.textAlign = 'left';
    if (drawStroke) ctx.strokeText(word, startX, cy);
    ctx.fillStyle = color;
    ctx.fillText(word, startX, cy);
  } else {
    ctx.textAlign = 'center';
    const cx = canvasSize / 2;
    if (drawStroke) ctx.strokeText(word, cx, cy);
    ctx.fillStyle = color;
    ctx.fillText(word, cx, cy);
  }

  if (canvasCache.size >= CANVAS_CACHE_MAX) {
    const firstKey = canvasCache.keys().next().value!;
    canvasCache.delete(firstKey);
  }
  canvasCache.set(key, canvas);

  return canvas;
}

interface SyllableStep {
  display: string; // what to render (e.g. "di", "divide")
  fullWord: string; // full word for sizing (e.g. "divide")
  italic?: boolean; // true when word was wrapped in _underscores_
}

// Parse text into words, treating !...! groups as single entries.
// e.g. "Hello !big world! bye" → ["Hello", "big world", "bye"]
function parseWords(text: string): string[] {
  const result: string[] = [];
  const parts = text.split('!');
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Outside !...! — split by whitespace
      for (const w of parts[i].split(/\s+/)) {
        if (w) result.push(w);
      }
    } else {
      // Inside !...! — keep as one entry (trim edges)
      const grouped = parts[i].trim();
      if (grouped) result.push(grouped);
    }
  }
  return result;
}

function buildSteps(words: string[]): SyllableStep[] {
  const steps: SyllableStep[] = [];
  for (let word of words) {
    // Detect _underscore_ italic markers
    const italic = word.startsWith('_') && word.endsWith('_') && word.length > 2;
    if (italic) word = word.slice(1, -1);

    if (word.includes('|')) {
      const syllables = word.split('|');
      let cumulative = '';
      const fullWord = syllables.join('');
      for (const syl of syllables) {
        cumulative += syl;
        steps.push({ display: cumulative, fullWord, italic });
      }
    } else {
      steps.push({ display: word, fullWord: word, italic });
    }
  }
  return steps;
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
  const lastStrokeColorRef = useRef('');
  const lastVariantRef = useRef('');
  const lastFontReadyRef = useRef(false);
  const noteOnTimeRef = useRef(-1); // clock time when current note started
  const currentYOffsetRef = useRef(0); // current height offset (-1 to 1)
  const targetYOffsetRef = useRef(0); // legato target
  const lastFrameTimeRef = useRef(0);
  const onsetTimeRef = useRef(-1);
  const bassPopTimeRef = useRef(-1);
  const prevBassPopCountRef = useRef(0);
  const releaseTimeRef = useRef(-1);
  const { viewport } = useThree();
  const [ready, setReady] = useState(false);

  // Delay echo state — each trigger spawns its own set of echoes
  const wordHistoryRef = useRef<WordHistoryEntry[]>([]);
  const echoMeshesRef = useRef<THREE.Mesh[]>([]);
  const echoTexturesRef = useRef<THREE.CanvasTexture[]>([]);
  const echoLastWordsRef = useRef<string[]>([]);
  const groupRef = useRef<THREE.Group>(null);

  // Reverb reflection state
  const reverbMeshesRef = useRef<THREE.Mesh[]>([]);
  const reverbTexturesRef = useRef<THREE.CanvasTexture[]>([]);
  const reverbLastWordsRef = useRef<string[]>([]);

  const lastRenderKeyRef = useRef('');

  // Seek detection
  const prevSeekGenRef = useRef(0);

  // Flight mode state
  const flightSpritesRef = useRef<FlightSprite[]>([]);
  const flightLastSubdivRef = useRef(-1);

  useEffect(() => {
    const tex = new THREE.CanvasTexture(createTextCanvas('Hello', TEXT_CANVAS_SIZE, DEFAULTS.strokeWidth));
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
      const echoTex = new THREE.CanvasTexture(createTextCanvas('', TEXT_CANVAS_SIZE, DEFAULTS.strokeWidth));
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

    // Pre-create reverb reflection meshes
    const reverbMeshes: THREE.Mesh[] = [];
    const reverbTextures: THREE.CanvasTexture[] = [];
    const reverbLastWords: string[] = [];
    for (let i = 0; i < MAX_REVERB_REFLECTIONS; i++) {
      const rTex = new THREE.CanvasTexture(createTextCanvas('', TEXT_CANVAS_SIZE, DEFAULTS.strokeWidth));
      rTex.minFilter = THREE.LinearFilter;
      rTex.magFilter = THREE.LinearFilter;
      reverbTextures.push(rTex);
      reverbLastWords.push('');

      const rMat = new THREE.MeshBasicMaterial({
        map: rTex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const rMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), rMat);
      rMesh.visible = false;
      reverbMeshes.push(rMesh);
    }
    reverbMeshesRef.current = reverbMeshes;
    reverbTexturesRef.current = reverbTextures;
    reverbLastWordsRef.current = reverbLastWords;

    setReady(true);
    return () => {
      tex.dispose();
      for (const t of textures) t.dispose();
      for (const m of meshes) {
        (m.material as THREE.Material).dispose();
        m.geometry.dispose();
      }
      for (const t of reverbTextures) t.dispose();
      for (const m of reverbMeshes) {
        (m.material as THREE.Material).dispose();
        m.geometry.dispose();
      }
      for (const spr of flightSpritesRef.current) {
        spr.texture.dispose();
        (spr.mesh.material as THREE.Material).dispose();
        spr.mesh.geometry.dispose();
      }
      flightSpritesRef.current = [];
    };
  }, []);

  // Add echo meshes to the group once ready
  useEffect(() => {
    if (!ready || !groupRef.current) return;
    for (const mesh of echoMeshesRef.current) {
      groupRef.current.add(mesh);
    }
    for (const mesh of reverbMeshesRef.current) {
      groupRef.current.add(mesh);
    }
    return () => {
      for (const mesh of echoMeshesRef.current) {
        groupRef.current?.remove(mesh);
      }
      for (const mesh of reverbMeshesRef.current) {
        groupRef.current?.remove(mesh);
      }
    };
  }, [ready]);

  useFrame(({ clock }) => {
    const state = engineRef.current.getTrackState(trackId);
    if (!state || !textureRef.current || !meshRef.current) return;

    // Seek detection: reset all accumulated state when seekGeneration changes
    if (state.seekGeneration !== prevSeekGenRef.current) {
      prevSeekGenRef.current = state.seekGeneration;

      // Reset edge detection refs to current counts (skip all triggers)
      prevCountRef.current = state.pitchNoteOnCounts.get(PITCH_NEXT_WORD) ?? 0;
      prevBassPopCountRef.current = state.pitchNoteOnCounts.get(PITCH_BASS_POP) ?? 0;

      // Reset note timing state
      noteOnTimeRef.current = -1;
      onsetTimeRef.current = -1;
      bassPopTimeRef.current = -1;
      releaseTimeRef.current = -1;
      lastFrameTimeRef.current = 0;

      // Reset height/position state
      currentYOffsetRef.current = 0;
      targetYOffsetRef.current = 0;

      // Reset word history (clears all delay/reverb echo state)
      wordHistoryRef.current = [];

      // Reset render cache keys to force texture re-renders
      lastWordRef.current = '';
      lastStrokeRef.current = -1;
      lastFontRef.current = '';
      lastColorRef.current = '';
      lastStrokeColorRef.current = '';
      lastVariantRef.current = '';
      lastFontReadyRef.current = false;
      lastRenderKeyRef.current = '';
      echoLastWordsRef.current.fill('');
      reverbLastWordsRef.current.fill('');

      // Reset flight mode state
      flightLastSubdivRef.current = -1;
      if (flightSpritesRef.current.length > 0) {
        for (const spr of flightSpritesRef.current) {
          groupRef.current?.remove(spr.mesh);
          spr.texture.dispose();
          (spr.mesh.material as THREE.Material).dispose();
          spr.mesh.geometry.dispose();
        }
        flightSpritesRef.current = [];
      }

      // Hide all echo and reverb meshes
      for (const mesh of echoMeshesRef.current) mesh.visible = false;
      for (const mesh of reverbMeshesRef.current) mesh.visible = false;
    }

    const text = (state.params.text as string) ?? DEFAULTS.text;
    const fontSize = (state.params.fontSize as number) ?? DEFAULTS.fontSize;
    const fontFamily = (state.params.fontFamily as string) ?? DEFAULTS.fontFamily;
    const fontVariant = (state.params.fontVariant as string) ?? DEFAULTS.fontVariant;
    loadFont(fontFamily);
    const strokeWidth = (state.params.strokeWidth as number) ?? DEFAULTS.strokeWidth;
    const releaseDuration = (state.params.releaseDuration as number) ?? DEFAULTS.releaseDuration;
    const delayTaps = (state.params.delayTaps as number) ?? DEFAULTS.delayTaps;
    const delayTime = (state.params.delayTime as number) ?? DEFAULTS.delayTime;
    const delayScaleFalloff = (state.params.delayScaleFalloff as number) ?? DEFAULTS.delayScaleFalloff;
    const delayOpacityFalloff = (state.params.delayOpacityFalloff as number) ?? DEFAULTS.delayOpacityFalloff;
    const pingPongEnabled = (state.params.pingPongEnabled as boolean) ?? DEFAULTS.pingPongEnabled;
    const pingPongWidth = (state.params.pingPongWidth as number) ?? DEFAULTS.pingPongWidth;
    const heightLegato = (state.params.heightLegato as boolean) ?? DEFAULTS.heightLegato;
    const heightLegatoSpeed = (state.params.heightLegatoSpeed as number) ?? DEFAULTS.heightLegatoSpeed;
    const heightAmount = (state.params.heightAmount as number) ?? DEFAULTS.heightAmount;
    const textOpacity = (state.params.opacity as number) ?? DEFAULTS.opacity;
    const color = (state.params.color as string) ?? DEFAULTS.color;
    const strokeColor = (state.params.strokeColor as string) ?? DEFAULTS.strokeColor;
    const reverbEnabled = (state.params.reverbEnabled as boolean) ?? DEFAULTS.reverbEnabled;
    const reverbReflections = (state.params.reverbReflections as number) ?? DEFAULTS.reverbReflections;
    const reverbDecay = (state.params.reverbDecay as number) ?? DEFAULTS.reverbDecay;
    const reverbSpread = (state.params.reverbSpread as number) ?? DEFAULTS.reverbSpread;
    const onsetBounce = (state.params.onsetBounce as number) ?? DEFAULTS.onsetBounce;
    const onsetFadeIn = (state.params.onsetFadeIn as boolean) ?? DEFAULTS.onsetFadeIn;
    const releaseFadeOut = (state.params.releaseFadeOut as boolean) ?? DEFAULTS.releaseFadeOut;
    const flightEnabled = (state.params.flightEnabled as boolean) ?? DEFAULTS.flightEnabled;
    const flightSpeed = (state.params.flightSpeed as number) ?? DEFAULTS.flightSpeed;
    const flightMaxDepth = (state.params.flightMaxDepth as number) ?? DEFAULTS.flightMaxDepth;
    const flightDrift = (state.params.flightDrift as number) ?? DEFAULTS.flightDrift;
    const flightTumble = (state.params.flightTumble as number) ?? DEFAULTS.flightTumble;
    const flightSubdivRate = (state.params.flightSubdivRate as number) ?? DEFAULTS.flightSubdivRate;
    const rainbowEnabled = (state.params.rainbowEnabled as boolean) ?? DEFAULTS.rainbowEnabled;
    const rainbowCycleLength = (state.params.rainbowCycleLength as number) ?? DEFAULTS.rainbowCycleLength;

    const currentBeat = useUIStore.getState().currentBeat;

    const words = parseWords(text);
    if (words.length === 0) return;
    const steps = buildSteps(words);
    if (steps.length === 0) return;

    const now = virtualClock.now() / 1000;

    // Detect new word/syllable triggers
    const currentCount = state.pitchNoteOnCounts.get(PITCH_NEXT_WORD) ?? 0;

    // Compute effective color — rainbow cycles hue based on subdivision ticks
    const rainbowSubdiv = Math.floor(currentBeat * flightSubdivRate);
    const rainbowHue = rainbowEnabled
      ? ((rainbowSubdiv % rainbowCycleLength) / rainbowCycleLength) * 360
      : 0;
    const effectiveColor = rainbowEnabled ? hslToHex(rainbowHue, 1, 0.55) : color;

    // Build a render key from all visual params — when any change, force
    // echo/reverb textures to re-render (not just on word change)
    const fontReady = isFontReady(fontFamily, fontVariant);
    const renderKey = `${strokeWidth}|${fontFamily}|${effectiveColor}|${fontVariant}|${fontReady}|${strokeColor}`;

    // When visual params change, invalidate all echo/reverb caches
    // so they re-render with the new stroke/color/font on next use
    if (renderKey !== lastRenderKeyRef.current) {
      lastRenderKeyRef.current = renderKey;
      echoLastWordsRef.current.fill('');
      reverbLastWordsRef.current.fill('');
    }
    const stepIndex = currentCount > 0 ? (currentCount - 1) % steps.length : 0;
    const currentStep = steps[stepIndex];
    const currentWord = currentStep.display;
    const currentSizeWord = currentStep.fullWord !== currentStep.display ? currentStep.fullWord : undefined;
    // Per-word italic: override fontVariant when _underscores_ detected
    const currentItalic = currentStep.italic ?? false;
    const effectiveVariant = currentItalic
      ? fontVariant.replace(/normal$/, 'italic').replace(/^(\d+)$/, '$1 italic')
      : fontVariant;

    const isNoteHeld = state.activeNotes.has(PITCH_NEXT_WORD);

    // Compute current height offset from latest held height pitch
    const dt = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;

    let latestHeightPitch = -1;
    for (const pitch of state.activeNotes.keys()) {
      if (pitch >= PITCH_HEIGHT_MIN && pitch <= PITCH_HEIGHT_MAX) {
        latestHeightPitch = Math.max(latestHeightPitch, pitch);
      }
    }
    if (latestHeightPitch >= 0) {
      const target = (latestHeightPitch - PITCH_HEIGHT_CENTER) / (PITCH_HEIGHT_MAX - PITCH_HEIGHT_CENTER);
      targetYOffsetRef.current = target;

      if (heightLegato && dt > 0 && dt < 0.5) {
        // Exponential lerp toward target
        const t = 1 - Math.exp(-heightLegatoSpeed * dt);
        currentYOffsetRef.current += (target - currentYOffsetRef.current) * t;
      } else {
        currentYOffsetRef.current = target;
      }
    }

    const isNewTrigger = currentCount !== prevCountRef.current && currentCount > 0;
    if (isNewTrigger) {
      wordHistoryRef.current.push({ word: currentWord, sizeWord: currentSizeWord, italic: currentItalic, triggerTime: now, duration: 0, yOffset: currentYOffsetRef.current });
      noteOnTimeRef.current = now;
      onsetTimeRef.current = now;
      releaseTimeRef.current = -1; // cancel any fade-out
      prevCountRef.current = currentCount;
    }

    // Track note release for fade-out
    if (!isNoteHeld && releaseTimeRef.current < 0 && noteOnTimeRef.current >= 0) {
      releaseTimeRef.current = now;
    }

    // Detect bass pop trigger
    const bassPopCount = state.pitchNoteOnCounts.get(PITCH_BASS_POP) ?? 0;
    if (bassPopCount > prevBassPopCountRef.current && bassPopCount > 0) {
      bassPopTimeRef.current = now;
    }
    prevBassPopCountRef.current = bassPopCount;

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
    const maxReverbLifetime = reverbEnabled ? reverbDecay + 5 : 0;
    const maxEchoLifetime = Math.max(delayTaps * delayTime + 10, maxReverbLifetime); // generous buffer
    wordHistoryRef.current = history.filter(
      (e) => now - e.triggerTime < maxEchoLifetime
    );

    const baseScale = Math.min(viewport.width, viewport.height) * 0.6 * fontSize;

    // --- Flight mode: spawn + update ---
    if (flightEnabled) {
      // Spawn continuously while note is held, on each beat subdivision
      const flightSubdiv = Math.floor(currentBeat * flightSubdivRate);
      if (flightSubdiv !== flightLastSubdivRef.current) {
        flightLastSubdivRef.current = flightSubdiv;
        if (isNoteHeld && groupRef.current && flightSpritesRef.current.length < MAX_FLIGHT_SPRITES) {
          const canvas = createTextCanvas(currentWord, TEXT_CANVAS_SIZE, strokeWidth, fontFamily, effectiveColor, effectiveVariant, strokeColor, currentSizeWord);
          const tex = new THREE.CanvasTexture(canvas);
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: textOpacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            toneMapped: false,
          });
          const geo = new THREE.PlaneGeometry(1, 1);
          const mesh = new THREE.Mesh(geo, mat);
          const spawnY = currentYOffsetRef.current * viewport.height * heightAmount;
          mesh.position.set(0, spawnY, 0);
          mesh.scale.setScalar(baseScale);
          groupRef.current.add(mesh);

          const seed = flightSubdiv * 13 + 7;
          const pseudoRand = (n: number) => {
            const x = Math.sin(n * 9301 + 49297) * 233280;
            return x - Math.floor(x);
          };

          flightSpritesRef.current.push({
            mesh,
            texture: tex,
            birthTime: now,
            vx: (pseudoRand(seed) - 0.5) * flightDrift,
            vy: (pseudoRand(seed + 1) - 0.5) * flightDrift * 0.6,
            tumbleX: (pseudoRand(seed + 2) - 0.5) * flightTumble,
            tumbleY: (pseudoRand(seed + 3) - 0.5) * flightTumble,
            targetScale: baseScale,
            word: currentWord,
          });
        }
      }

      // Update flight sprites
      const flightDt = Math.min(dt, 0.05);
      const toRemove: number[] = [];
      for (let i = 0; i < flightSpritesRef.current.length; i++) {
        const spr = flightSpritesRef.current[i];
        const m = spr.mesh;

        m.position.z -= flightSpeed * flightDt;
        m.position.x += spr.vx * flightDt;
        m.position.y += spr.vy * flightDt;
        m.rotation.x += spr.tumbleX * flightDt;
        m.rotation.y += spr.tumbleY * flightDt;

        // Fade out near max depth
        const depth = -m.position.z;
        const fadeStart = flightMaxDepth * 0.7;
        const mat = m.material as THREE.MeshBasicMaterial;
        if (depth > fadeStart) {
          mat.opacity = textOpacity * Math.max(0, 1 - (depth - fadeStart) / (flightMaxDepth - fadeStart));
        } else {
          mat.opacity = textOpacity;
        }

        if (depth > flightMaxDepth) {
          toRemove.push(i);
        }
      }

      // Remove culled sprites
      for (let i = toRemove.length - 1; i >= 0; i--) {
        const idx = toRemove[i];
        const spr = flightSpritesRef.current[idx];
        groupRef.current?.remove(spr.mesh);
        spr.texture.dispose();
        (spr.mesh.material as THREE.Material).dispose();
        spr.mesh.geometry.dispose();
        flightSpritesRef.current.splice(idx, 1);
      }
    } else {
      // Clean up flight sprites when disabled
      if (flightSpritesRef.current.length > 0) {
        for (const spr of flightSpritesRef.current) {
          groupRef.current?.remove(spr.mesh);
          spr.texture.dispose();
          (spr.mesh.material as THREE.Material).dispose();
          spr.mesh.geometry.dispose();
        }
        flightSpritesRef.current = [];
      }
    }

    {
      // Update main mesh texture
      if (currentWord !== lastWordRef.current || strokeWidth !== lastStrokeRef.current || fontFamily !== lastFontRef.current || effectiveColor !== lastColorRef.current || strokeColor !== lastStrokeColorRef.current || effectiveVariant !== lastVariantRef.current || fontReady !== lastFontReadyRef.current) {
        const canvas = createTextCanvas(currentWord, TEXT_CANVAS_SIZE, strokeWidth, fontFamily, effectiveColor, effectiveVariant, strokeColor, currentSizeWord);
        textureRef.current.image = canvas;
        textureRef.current.needsUpdate = true;
        lastWordRef.current = currentWord;
        lastStrokeRef.current = strokeWidth;
        lastFontRef.current = fontFamily;
        lastColorRef.current = effectiveColor;
        lastStrokeColorRef.current = strokeColor;
        lastVariantRef.current = effectiveVariant;
        lastFontReadyRef.current = fontReady;

      }

      // Main mesh visibility — visible while held or fading out
      let releaseOpacity = 1;
      if (isNoteHeld) {
        releaseOpacity = 1;
      } else if (releaseFadeOut && releaseTimeRef.current >= 0) {
        const releaseAge = now - releaseTimeRef.current;
        releaseOpacity = Math.max(0, 1 - releaseAge / releaseDuration);
      } else if (!releaseFadeOut && !isNoteHeld) {
        releaseOpacity = 0;
      }
      meshRef.current.visible = isNoteHeld || releaseOpacity > 0;

      // Subtle onset animation: quick scale punch + fade in
      const onsetDuration = 0.12;
      const onsetAge = onsetTimeRef.current >= 0 ? now - onsetTimeRef.current : onsetDuration;
      const onsetT = Math.min(onsetAge / onsetDuration, 1);
      const onsetScale = 1 + onsetBounce * (1 - onsetT); // scale punch that settles
      const onsetOpacity = onsetFadeIn ? 0.7 + 0.3 * onsetT : 1; // fade from 70% to 100%

      // Bass pop: prominent scale punch + shake
      const bassPopDuration = 0.25;
      const bassPopAge = bassPopTimeRef.current >= 0 ? now - bassPopTimeRef.current : bassPopDuration;
      const bassPopT = Math.min(bassPopAge / bassPopDuration, 1);
      const bassPopDecay = 1 - bassPopT;
      const bassPopScale = 1 + 0.25 * bassPopDecay * bassPopDecay; // 25% scale punch
      const shakeFreq = 35;
      const shakeAmount = 0.02 * bassPopDecay * bassPopDecay; // rapid shake that decays
      const shakeX = Math.sin(bassPopAge * shakeFreq * Math.PI * 2) * shakeAmount * viewport.width;
      const shakeY = Math.cos(bassPopAge * shakeFreq * Math.PI * 2 * 0.7) * shakeAmount * viewport.height;

      (meshRef.current.material as THREE.MeshBasicMaterial).opacity = textOpacity * onsetOpacity * releaseOpacity;
      const scale = baseScale * onsetScale * bassPopScale;
      meshRef.current.scale.set(scale, scale, 1);
      meshRef.current.position.x = shakeX;
      meshRef.current.position.y = currentYOffsetRef.current * viewport.height * heightAmount + shakeY;

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
          const entryVariant = bestEntry.italic
            ? fontVariant.replace(/normal$/, 'italic').replace(/^(\d+)$/, '$1 italic')
            : fontVariant;
          const canvas = createTextCanvas(bestEntry.word, TEXT_CANVAS_SIZE, strokeWidth, fontFamily, effectiveColor, entryVariant, strokeColor, bestEntry.sizeWord);
          tex.image = canvas;
          tex.needsUpdate = true;
          echoLastWordsRef.current[tap] = bestEntry.word;
        }

        const tapScale = baseScale * Math.max(0.1, 1 - delayScaleFalloff * tapNum);
        mesh.scale.set(tapScale, tapScale, 1);
        // Ping-pong: odd taps go left, even taps go right
        mesh.position.x = pingPongEnabled
          ? (tapNum % 2 === 1 ? -1 : 1) * pingPongWidth * viewport.width * 0.5
          : 0;
        mesh.position.y = bestEntry.yOffset * viewport.height * heightAmount;
        mesh.position.z = -0.01 * tapNum;

        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = opacity;
        mesh.visible = true;
      }

      // --- Reverb reflections ---
      for (let r = 0; r < MAX_REVERB_REFLECTIONS; r++) {
        const rMesh = reverbMeshesRef.current[r];
        if (!rMesh) continue;

        if (!reverbEnabled || r >= reverbReflections) {
          rMesh.visible = false;
          continue;
        }

        const offsets = REVERB_OFFSETS[r];
        const timeOffset = offsets.t * reverbDecay;
        const dx = offsets.x * reverbSpread * viewport.width;
        const dy = offsets.y * reverbSpread * viewport.height;

        // Find most recent word entry whose reverb reflection has arrived
        let bestEntry: WordHistoryEntry | null = null;
        let bestAge = Infinity;
        for (let h = history.length - 1; h >= 0; h--) {
          const age = now - (history[h].triggerTime + timeOffset);
          if (age >= 0 && age < bestAge) {
            bestEntry = history[h];
            bestAge = age;
            break;
          }
        }

        if (!bestEntry) {
          rMesh.visible = false;
          continue;
        }

        // Visible for same duration as original note was held
        const echoDuration = bestEntry.duration > 0 ? bestEntry.duration : reverbDecay;
        if (bestAge > echoDuration) {
          rMesh.visible = false;
          continue;
        }

        // Exponential opacity decay based on time offset
        const reverbOpacity = textOpacity * Math.exp(-3 * timeOffset / reverbDecay);

        // Update texture if word changed
        const rTex = reverbTexturesRef.current[r];
        if (bestEntry.word !== reverbLastWordsRef.current[r]) {
          const entryVariant = bestEntry.italic
            ? fontVariant.replace(/normal$/, 'italic').replace(/^(\d+)$/, '$1 italic')
            : fontVariant;
          const canvas = createTextCanvas(bestEntry.word, TEXT_CANVAS_SIZE, strokeWidth, fontFamily, effectiveColor, entryVariant, strokeColor, bestEntry.sizeWord);
          rTex.image = canvas;
          rTex.needsUpdate = true;
          reverbLastWordsRef.current[r] = bestEntry.word;
        }

        const reverbScale = baseScale * (1 - 0.1 * offsets.s);
        rMesh.scale.set(reverbScale, reverbScale, 1);
        rMesh.position.x = dx;
        rMesh.position.y = bestEntry.yOffset * viewport.height * heightAmount + dy;
        rMesh.position.z = -0.02 - 0.001 * r; // behind delay taps

        const rMat = rMesh.material as THREE.MeshBasicMaterial;
        rMat.opacity = reverbOpacity;
        rMesh.visible = true;
      }
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
  noteRange: { min: PITCH_BASS_POP, max: 72 },
  rangeLabels: [
    { startPitch: PITCH_BASS_POP, endPitch: PITCH_BASS_POP, label: 'Pop' },
    { startPitch: PITCH_NEXT_WORD, endPitch: PITCH_NEXT_WORD, label: 'Next' },
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
      type: 'font', label: 'Font Family',
      default: DEFAULTS.fontFamily,
    },
    fontVariant: {
      type: 'fontVariant', label: 'Font Style',
      default: DEFAULTS.fontVariant,
    },
    strokeWidth: {
      type: 'number', label: 'Stroke Width', min: 0, max: 0.2, step: 0.01,
      default: DEFAULTS.strokeWidth,
    },
    releaseDuration: {
      type: 'number', label: 'Release Fade', min: 0, max: 2, step: 0.05,
      default: DEFAULTS.releaseDuration,
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
    pingPongEnabled: {
      type: 'boolean', label: 'Ping Pong Delay', default: DEFAULTS.pingPongEnabled,
    },
    pingPongWidth: {
      type: 'number', label: 'Ping Pong Width', min: 0.05, max: 1, step: 0.05,
      default: DEFAULTS.pingPongWidth,
    },
    opacity: {
      type: 'number', label: 'Opacity', min: 0, max: 1, step: 0.05,
      default: DEFAULTS.opacity,
    },
    color: {
      type: 'color', label: 'Color',
      default: DEFAULTS.color,
    },
    strokeColor: {
      type: 'color', label: 'Stroke Color',
      default: DEFAULTS.strokeColor,
    },
    heightAmount: {
      type: 'number', label: 'Height Amount', min: 0, max: 1, step: 0.05,
      default: DEFAULTS.heightAmount,
    },
    heightLegato: {
      type: 'boolean', label: 'Height Legato', default: DEFAULTS.heightLegato,
    },
    heightLegatoSpeed: {
      type: 'number', label: 'Legato Speed', min: 0.5, max: 20, step: 0.5,
      default: DEFAULTS.heightLegatoSpeed,
    },
    reverbEnabled: {
      type: 'boolean', label: 'Reverb', default: DEFAULTS.reverbEnabled,
    },
    reverbReflections: {
      type: 'number', label: 'Reverb Reflections', min: 1, max: 16, step: 1,
      default: DEFAULTS.reverbReflections,
    },
    reverbDecay: {
      type: 'number', label: 'Reverb Decay', min: 0.1, max: 5, step: 0.1,
      default: DEFAULTS.reverbDecay,
    },
    reverbSpread: {
      type: 'number', label: 'Reverb Spread', min: 0, max: 0.5, step: 0.02,
      default: DEFAULTS.reverbSpread,
    },
    onsetBounce: {
      type: 'number', label: 'Onset Bounce', min: 0, max: 0.5, step: 0.01,
      default: DEFAULTS.onsetBounce,
    },
    onsetFadeIn: {
      type: 'boolean', label: 'Onset Fade In', default: DEFAULTS.onsetFadeIn,
    },
    releaseFadeOut: {
      type: 'boolean', label: 'Release Fade Out', default: DEFAULTS.releaseFadeOut,
    },
    flightEnabled: {
      type: 'boolean', label: 'Flight Mode', default: DEFAULTS.flightEnabled,
    },
    flightSpeed: {
      type: 'number', label: 'Flight Speed', min: 2, max: 60, step: 1,
      default: DEFAULTS.flightSpeed,
    },
    flightMaxDepth: {
      type: 'number', label: 'Flight Max Depth', min: 10, max: 200, step: 5,
      default: DEFAULTS.flightMaxDepth,
    },
    flightDrift: {
      type: 'number', label: 'Flight Drift', min: 0, max: 3, step: 0.1,
      default: DEFAULTS.flightDrift,
    },
    flightTumble: {
      type: 'number', label: 'Flight Tumble', min: 0, max: 5, step: 0.1,
      default: DEFAULTS.flightTumble,
    },
    flightSubdivRate: {
      type: 'number', label: 'Flight Spawns/Beat', min: 1, max: 32, step: 1,
      default: DEFAULTS.flightSubdivRate,
    },
    rainbowEnabled: {
      type: 'boolean', label: 'Rainbow', default: DEFAULTS.rainbowEnabled,
    },
    rainbowCycleLength: {
      type: 'number', label: 'Rainbow Cycle Length', min: 2, max: 64, step: 1,
      default: DEFAULTS.rainbowCycleLength,
    },
  },

  colorRoleMapping: [
    { role: 'text', param: 'color', type: 'hex' },
    { role: 'textStroke', param: 'strokeColor', type: 'hex' },
  ],

  VisualComponent: TextDisplayVisual,
};
