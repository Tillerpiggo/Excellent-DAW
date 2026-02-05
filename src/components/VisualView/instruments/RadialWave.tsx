'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';

interface RadialWaveProps {
  trackId: string;
}

const CONFIG = {
  waveFrequency: 6,      // Number of wave peaks around the circle
  waveAmplitude: 0.3,    // Oscillation amplitude
  waveSpeed: 1.5,        // Animation speed
  glowIntensity: 0.8,    // Glow amount
  rotationAmount: 45,    // Degrees per MIDI event
  baseHue: 0.55,         // Starting hue
  baseRadius: 0.35,      // Base radius of the wave
};

function renderRadialWave(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  rotation: number,
  params: Record<string, unknown>
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const scale = Math.min(width, height) * 0.4;

  const waveFrequency = (params.waveFrequency as number) ?? CONFIG.waveFrequency;
  const waveAmplitude = (params.waveAmplitude as number) ?? CONFIG.waveAmplitude;
  const waveSpeed = (params.waveSpeed as number) ?? CONFIG.waveSpeed;
  const glowIntensity = (params.glowIntensity as number) ?? CONFIG.glowIntensity;
  const baseHue = (params.baseHue as number) ?? CONFIG.baseHue;
  const baseRadius = CONFIG.baseRadius;

  ctx.globalCompositeOperation = 'lighter';

  // Animate wave phase
  const wavePhase = time * waveSpeed;

  // Draw multiple glow layers for the radial wave
  const glowPasses = [
    { lineWidth: 24 * glowIntensity, alpha: 0.04 },
    { lineWidth: 16 * glowIntensity, alpha: 0.08 },
    { lineWidth: 10 * glowIntensity, alpha: 0.12 },
    { lineWidth: 6 * glowIntensity, alpha: 0.2 },
    { lineWidth: 3 * glowIntensity, alpha: 0.4 },
    { lineWidth: 1.5, alpha: 0.8 },
  ];

  for (const pass of glowPasses) {
    ctx.beginPath();

    const points = 360;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;

      // Calculate wave: radially symmetric sine wave
      const wave = Math.sin(angle * waveFrequency + wavePhase) * waveAmplitude;
      const radius = baseRadius + wave;

      // Apply rotation
      const rotatedAngle = angle + rotation;
      const x = centerX + Math.cos(rotatedAngle) * radius * scale;
      const y = centerY + Math.sin(rotatedAngle) * radius * scale;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();

    // Color shifts slightly with position for more visual interest
    const hue = ((baseHue + time * 0.02) % 1) * 360;
    ctx.strokeStyle = `hsla(${hue}, 80%, 60%, ${pass.alpha})`;
    ctx.lineWidth = pass.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function renderVignette(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(width, height) * 0.7;

  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, 'rgba(5, 5, 8, 0)');
  gradient.addColorStop(0.6, 'rgba(5, 5, 8, 0)');
  gradient.addColorStop(1, 'rgba(5, 5, 8, 0.8)');

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export function RadialWave({ trackId }: RadialWaveProps) {
  const { viewport } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const timeRef = useRef(0);
  const rotationRef = useRef(0);
  const engineRef = useRef(getVisualPlaybackEngine());
  const prevNoteOnCountRef = useRef(0);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    canvasRef.current = canvas;

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

    // Read state from engine
    const state = engineRef.current.getTrackState(trackId);
    // Debug: log state on first frame only
    if (timeRef.current === 0) {
      console.log('[RadialWave] Initial state check - trackId:', trackId, 'state:', state, 'noteOnCount:', state?.noteOnCount);
    }
    const params = state?.params ?? {};
    const rotationAmount = ((params.rotationAmount as number) ?? CONFIG.rotationAmount) * (Math.PI / 180);

    // Use noteOnCount - a counter that increments for EVERY note trigger (never throttled)
    if (state) {
      const currentNoteOnCount = state.noteOnCount;
      let newNotes = currentNoteOnCount - prevNoteOnCountRef.current;

      // Handle engine reinitialization (count reset to 0)
      if (newNotes < 0) {
        // Engine was reinitialized, reset our tracking
        newNotes = currentNoteOnCount; // Count all notes since reset
      }

      // Rotate by the set amount for each new note
      if (newNotes > 0) {
        console.log('[RadialWave] noteOnCount:', currentNoteOnCount, 'new:', newNotes, 'rotating by', rotationAmount * newNotes * (180 / Math.PI), 'degrees');
        rotationRef.current += rotationAmount * newNotes;
      }

      prevNoteOnCountRef.current = currentNoteOnCount;
    } else {
      console.log('[RadialWave] No state found for track:', trackId);
    }

    timeRef.current += delta;

    // Clear canvas
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render the radial wave
    renderRadialWave(
      ctx,
      canvas.width,
      canvas.height,
      timeRef.current,
      rotationRef.current,
      params
    );

    renderVignette(ctx, canvas.width, canvas.height);

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
