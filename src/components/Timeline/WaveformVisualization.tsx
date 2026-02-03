'use client';

import { useRef, useEffect, useState } from 'react';
import { AudioData } from '@/core/types';

interface WaveformVisualizationProps {
  audioData: AudioData;
  pixelsPerBeat: number;
  beatsPerBar: number;
  blockDurationBars: number;
  loop: boolean;
  color: string;
  bpm: number;
}

export function WaveformVisualization({
  audioData,
  pixelsPerBeat,
  beatsPerBar,
  blockDurationBars,
  loop,
  color,
  bpm,
}: WaveformVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Calculate dimensions
  const barWidth = beatsPerBar * pixelsPerBeat;
  const blockWidthPx = blockDurationBars * barWidth;
  const handleWidthPx = 12; // Reserved for resize handle
  const availableWidth = Math.max(10, blockWidthPx - handleWidthPx - 3);

  // Calculate how much of the audio fits in the block
  const beatsPerSecond = bpm / 60;
  const audioBeats = audioData.duration * beatsPerSecond;
  const audioBars = audioBeats / beatsPerBar;
  const audioWidthPx = audioBars * barWidth;

  // Measure container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };

    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const displayWidth = dimensions.width;
    const displayHeight = dimensions.height;

    // Set canvas size (account for device pixel ratio for crisp rendering)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const peaks = audioData.waveformPeaks;
    if (!peaks || peaks.length === 0) return;

    const centerY = displayHeight / 2;
    const maxAmplitude = Math.max(1, displayHeight / 2 - 2); // Leave padding

    // Draw waveform - may need to draw multiple times if looping
    const drawWaveform = (offsetX: number, fadeOpacity: number = 1) => {
      if (offsetX >= displayWidth) return;

      const drawWidth = Math.min(audioWidthPx, displayWidth - offsetX);
      if (drawWidth <= 0) return;

      const samplesPerPixel = peaks.length / Math.max(1, audioWidthPx);

      // Set fill style
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.globalAlpha = fadeOpacity;

      for (let x = 0; x < drawWidth; x++) {
        const sampleIndex = Math.floor(x * samplesPerPixel);
        const peak = peaks[Math.min(sampleIndex, peaks.length - 1)] || 0;
        const barHeight = Math.max(1, peak * maxAmplitude);

        // Draw symmetric bars around center
        const drawX = offsetX + x;
        if (drawX >= 0 && drawX < displayWidth) {
          ctx.fillRect(drawX, centerY - barHeight, 1, barHeight * 2);
        }
      }
    };

    // Draw initial waveform
    drawWaveform(0, 1);

    // If looping, draw repeated waveforms
    if (loop && audioWidthPx > 0) {
      let currentOffset = audioWidthPx;
      let iteration = 1;

      while (currentOffset < displayWidth && iteration < 50) { // Limit iterations
        // Fade slightly for each iteration
        const fadeOpacity = Math.max(0.4, 1 - iteration * 0.15);
        drawWaveform(currentOffset, fadeOpacity);

        // Draw loop boundary line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(currentOffset, 0);
        ctx.lineTo(currentOffset, displayHeight);
        ctx.stroke();
        ctx.setLineDash([]);

        currentOffset += audioWidthPx;
        iteration++;
      }
    }

    // Reset global alpha
    ctx.globalAlpha = 1;

  }, [audioData, dimensions, audioWidthPx, loop]);

  return (
    <div
      ref={containerRef}
      className="absolute pointer-events-none overflow-hidden"
      style={{
        top: 24, // Below header
        bottom: 4,
        left: 3,
        right: handleWidthPx,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
