'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, ThreeEvent } from '@react-three/fiber';
import { OrthographicCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
import { TrackNode } from '@/utils/tree';
import { Block, Track, getDrumType } from '@/core/types';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { useDragDrop } from '@/hooks/useDragDrop';
import { isAudioFile } from '@/core/audio';
import { INSTRUMENT_COLORS, TRACK_TYPE_COLORS, darken, tintWhite } from '@/utils/colors';

interface TimelineCanvasProps {
  flatTracks: TrackNode[];
  pixelsPerBeat: number;
  beatsPerBar: number;
  totalBars: number;
  bpm: number;
}

// Convert hex color to THREE.Color
function hexToThreeColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

// Helper to find track ID for a given block ID
function findTrackForBlock(tracks: Record<string, Track>, blockId: string): string | null {
  for (const [trackId, track] of Object.entries(tracks)) {
    if (track.blocks.some(b => b.id === blockId)) {
      return trackId;
    }
  }
  return null;
}

// Helper to calculate pattern bars for a block
function getPatternBars(block: Block, beatsPerBar: number): number {
  const allEvents = block.streams?.flatMap((s) => s.events) || [];
  const patternLengthBeats = allEvents.length > 0
    ? Math.max(...allEvents.map((e) => e.startTimeInBeats + (e.duration || 0.25)), beatsPerBar)
    : beatsPerBar;
  return Math.ceil(patternLengthBeats / beatsPerBar);
}

// Create a CENTERED rounded rectangle shape (centered at origin)
function createRoundedRectShape(
  width: number,
  height: number,
  radii: [number, number, number, number] // [topLeft, topRight, bottomRight, bottomLeft]
): THREE.Shape {
  const [tl, tr, br, bl] = radii;
  const shape = new THREE.Shape();

  // Center the shape at origin
  const hw = width / 2;  // half width
  const hh = height / 2; // half height

  // Start at top-left after corner, going clockwise
  // Top edge (y = +hh)
  shape.moveTo(-hw + tl, hh);
  shape.lineTo(hw - tr, hh);
  // Top-right corner
  if (tr > 0) shape.quadraticCurveTo(hw, hh, hw, hh - tr);
  else shape.lineTo(hw, hh);
  // Right edge
  shape.lineTo(hw, -hh + br);
  // Bottom-right corner
  if (br > 0) shape.quadraticCurveTo(hw, -hh, hw - br, -hh);
  else shape.lineTo(hw, -hh);
  // Bottom edge
  shape.lineTo(-hw + bl, -hh);
  // Bottom-left corner
  if (bl > 0) shape.quadraticCurveTo(-hw, -hh, -hw, -hh + bl);
  else shape.lineTo(-hw, -hh);
  // Left edge
  shape.lineTo(-hw, hh - tl);
  // Top-left corner
  if (tl > 0) shape.quadraticCurveTo(-hw, hh, -hw + tl, hh);
  else shape.lineTo(-hw, hh);

  return shape;
}

// Generate points along a quadratic bezier curve
function quadraticBezierPoints(
  p0: THREE.Vector3,
  p1: THREE.Vector3, // control point
  p2: THREE.Vector3,
  segments: number = 8
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const t1 = 1 - t;
    const x = t1 * t1 * p0.x + 2 * t1 * t * p1.x + t * t * p2.x;
    const y = t1 * t1 * p0.y + 2 * t1 * t * p1.y + t * t * p2.y;
    const z = p0.z;
    points.push(new THREE.Vector3(x, y, z));
  }
  return points;
}

// Get a readable text color for selection header (darker version of base color)
function getSelectionTextColor(baseColor: string): string {
  // Parse color
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // For bright colors (like lime green #22c55e), darken significantly more
  // For darker colors, standard darkening is fine
  const darkenAmount = luminance > 0.5 ? 100 : 50;

  const newR = Math.max(0, r - darkenAmount);
  const newG = Math.max(0, g - darkenAmount);
  const newB = Math.max(0, b - darkenAmount);

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

// Grid Lines Component
interface GridLinesProps {
  totalBars: number;
  barWidth: number;
  height: number;
}

function GridLines({ totalBars, barWidth, height }: GridLinesProps) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (let i = 0; i <= totalBars; i++) {
      const x = i * barWidth;
      positions.push(x, 0, 0, x, -height, 0);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geom;
  }, [totalBars, barWidth, height]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#ffffff" opacity={0.1} transparent />
    </lineSegments>
  );
}

// Single Block Component
interface BlockMeshProps {
  block: Block;
  track: Track;
  trackIndex: number;
  pixelsPerBeat: number;
  beatsPerBar: number;
  trackHeight: number;
  bpm: number;
  isSelected: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>, block: Block, track: Track, trackIndex: number, zone: string) => void;
  onPointerOver: (blockId: string, zone: string) => void;
  onPointerOut: () => void;
  isHovered: boolean;
  hoveredZone: string | null;
}

function BlockMesh({
  block,
  track,
  trackIndex,
  pixelsPerBeat,
  beatsPerBar,
  trackHeight,
  bpm,
  isSelected,
  onPointerDown,
  onPointerOver,
  onPointerOut,
  isHovered,
  hoveredZone,
}: BlockMeshProps) {
  const isAudioBlock = track.instrumentId === 'audio' && block.audioData;
  const barWidth = beatsPerBar * pixelsPerBeat;
  const handleWidthPx = 12;

  // Calculate position and size
  const blockLeft = block.startBar * barWidth;
  const fullBlockWidth = block.durationBars * barWidth;
  const blockWidth = Math.max(fullBlockWidth - 2, 20);
  const blockTop = trackIndex * trackHeight + 4;
  const blockHeight = trackHeight - 8;
  const contentAreaWidth = blockWidth - handleWidthPx;

  // Colors
  const baseColor = track.instrumentId
    ? INSTRUMENT_COLORS[track.instrumentId]
    : TRACK_TYPE_COLORS[track.typeId];
  const handleColor = darken(baseColor, 40);
  const selectionColor = tintWhite(baseColor, 0.85);
  const selectedHandleColor = tintWhite(baseColor, 0.5);

  // Pattern info for loops
  const allEvents = block.streams?.flatMap((s) => s.events) || [];
  const patternLengthBeats = allEvents.length > 0
    ? Math.max(...allEvents.map((e) => e.startTimeInBeats + (e.duration || 0.25)), beatsPerBar)
    : beatsPerBar;
  const patternBars = Math.ceil(patternLengthBeats / beatsPerBar);
  const patternBeats = patternBars * beatsPerBar;
  const patternWidthPx = patternBeats * pixelsPerBeat;
  const blockTotalBeats = block.durationBars * beatsPerBar;
  const loopCount = block.loop ? Math.ceil(blockTotalBeats / patternBeats) : 1;

  // Create iteration shapes
  const iterationMeshes = useMemo(() => {
    const meshes: React.ReactNode[] = [];

    if (block.loop && loopCount > 1) {
      for (let i = 0; i < loopCount; i++) {
        const iterationLeftPx = i * patternWidthPx;
        const visibleBeats = Math.min(patternBeats, blockTotalBeats - i * patternBeats);
        let iterationWidthPx = visibleBeats * pixelsPerBeat;
        if (iterationWidthPx <= 0) continue;

        const isFirst = i === 0;
        const isLast = i === loopCount - 1;

        if (isLast) {
          iterationWidthPx = Math.min(iterationWidthPx, contentAreaWidth - iterationLeftPx);
        }
        if (iterationWidthPx <= 4) iterationWidthPx = 4;

        const iterColor = isFirst ? baseColor : darken(baseColor, 20);
        const leftRadius = 6;
        const rightRadius = isLast ? 0 : 6;

        const shape = createRoundedRectShape(
          iterationWidthPx,
          blockHeight,
          [leftRadius, rightRadius, rightRadius, leftRadius]
        );

        meshes.push(
          <mesh
            key={`iter-${i}`}
            position={[blockLeft + iterationLeftPx + iterationWidthPx / 2, -(blockTop + blockHeight / 2), 0]}
          >
            <shapeGeometry args={[shape]} />
            <meshBasicMaterial color={iterColor} />
          </mesh>
        );
      }
    } else {
      // Non-looped: single block
      const shape = createRoundedRectShape(
        Math.max(4, contentAreaWidth),
        blockHeight,
        [6, 0, 0, 6]
      );

      meshes.push(
        <mesh
          key="single"
          position={[blockLeft + contentAreaWidth / 2, -(blockTop + blockHeight / 2), 0]}
        >
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial color={baseColor} />
        </mesh>
      );
    }

    return meshes;
  }, [block.loop, loopCount, patternWidthPx, patternBeats, blockTotalBeats, contentAreaWidth, baseColor, blockLeft, blockTop, blockHeight]);

  // Handle mesh
  const handleLeft = blockLeft + blockWidth - handleWidthPx;
  const handleShape = useMemo(() =>
    createRoundedRectShape(handleWidthPx, blockHeight, [0, 6, 6, 0]),
    [blockHeight]
  );

  const handleOpacity = isSelected ? 1.0 : (isHovered && (hoveredZone === 'right-loop' || hoveredZone === 'right-extend') ? 1.0 : 0.8);

  // Events rendering
  const eventMeshes = useMemo(() => {
    if (allEvents.length === 0) return null;

    const meshes: React.ReactNode[] = [];
    const contentTop = blockTop + 24;
    const contentHeight = blockHeight - 28;
    const contentLeft = blockLeft + 3;
    const contentWidth = contentAreaWidth - 6;

    const pitches = allEvents.filter((e) => e.pitch !== undefined).map((e) => e.pitch!);
    const minPitch = pitches.length > 0 ? Math.min(...pitches) : 60;
    const maxPitch = pitches.length > 0 ? Math.max(...pitches) : 72;
    const pitchRange = Math.max(maxPitch - minPitch + 1, 1);

    for (let loopIdx = 0; loopIdx < loopCount; loopIdx++) {
      const offsetPx = loopIdx * patternWidthPx;

      for (let eventIdx = 0; eventIdx < allEvents.length; eventIdx++) {
        const event = allEvents[eventIdx];
        const eventStartBeat = event.startTimeInBeats + loopIdx * patternBeats;
        if (eventStartBeat >= blockTotalBeats) continue;

        const eventStartPx = event.startTimeInBeats * pixelsPerBeat + offsetPx;
        const duration = event.duration || 0.25;
        const eventWidthPx = Math.max(duration * pixelsPerBeat, 2);

        let topPercent: number;
        let heightPercent: number;

        const drumType = getDrumType(event.pitch);
        if (drumType) {
          const drumLanes: Record<string, number> = { hihat: 0, clap: 1, snare: 2, kick: 3 };
          const laneCount = 4;
          const lane = drumLanes[drumType] ?? 2;
          heightPercent = (100 / laneCount - 4) / 100;
          topPercent = ((lane / laneCount) * 100 + 2) / 100;
        } else {
          const normalizedPitch = (event.pitch - minPitch) / pitchRange;
          heightPercent = Math.max(1 / pitchRange, 0.06);
          topPercent = (1 - normalizedPitch) * (1 - heightPercent);
        }

        const baseOpacity = Math.max((event.velocity || 100) / 127, 0.4);
        const opacity = loopIdx === 0 ? baseOpacity : baseOpacity * 0.85;

        const y = contentTop + topPercent * contentHeight;
        const h = heightPercent * contentHeight;
        const x = contentLeft + eventStartPx;

        if (x >= contentLeft + contentWidth) continue;
        const drawWidth = Math.min(eventWidthPx, contentLeft + contentWidth - x);

        meshes.push(
          <mesh
            key={`event-${loopIdx}-${eventIdx}`}
            position={[x + drawWidth / 2, -(y + h / 2), 0.1]}
          >
            <planeGeometry args={[drawWidth, h]} />
            <meshBasicMaterial color="#ffffff" opacity={0.8 * opacity} transparent />
          </mesh>
        );
      }
    }

    return meshes;
  }, [allEvents, loopCount, patternWidthPx, patternBeats, blockTotalBeats, pixelsPerBeat, blockTop, blockHeight, blockLeft, contentAreaWidth]);

  // Selection border - follows iteration contours with rounded corners and divets
  const selectionBorder = useMemo(() => {
    if (!isSelected) return null;

    const radius = 6;
    const hh = blockHeight / 2;
    const z = 0.2;
    const curveSegments = 6;

    // Build a path that follows the outer contour of all iterations with curved corners
    const points: THREE.Vector3[] = [];

    if (block.loop && loopCount > 1) {
      // Multiple iterations - need curved divets between them

      // Top-left corner curve (going from left edge to top edge)
      points.push(...quadraticBezierPoints(
        new THREE.Vector3(0, hh - radius, z),
        new THREE.Vector3(0, hh, z),
        new THREE.Vector3(radius, hh, z),
        curveSegments
      ));

      // Trace top edge with curved divets
      for (let i = 0; i < loopCount; i++) {
        const iterLeft = i * patternWidthPx;
        const visibleBeats = Math.min(patternBeats, blockTotalBeats - i * patternBeats);
        let iterWidth = visibleBeats * pixelsPerBeat;
        const isLast = i === loopCount - 1;

        if (isLast) {
          iterWidth = Math.min(iterWidth, contentAreaWidth - iterLeft);
        }
        if (iterWidth <= 4) iterWidth = 4;

        const iterRight = iterLeft + iterWidth;

        if (i === 0) {
          // First iteration - go to right corner
          if (!isLast) {
            points.push(new THREE.Vector3(iterRight - radius, hh, z));
            // Curved corner going down into divet
            points.push(...quadraticBezierPoints(
              new THREE.Vector3(iterRight - radius, hh, z),
              new THREE.Vector3(iterRight, hh, z),
              new THREE.Vector3(iterRight, hh - radius, z),
              curveSegments
            ));
          } else {
            points.push(new THREE.Vector3(contentAreaWidth, hh, z));
          }
        } else {
          // Subsequent iterations - curved divet up, across, then curved divet down
          // Curve coming up from divet
          points.push(...quadraticBezierPoints(
            new THREE.Vector3(iterLeft, hh - radius, z),
            new THREE.Vector3(iterLeft, hh, z),
            new THREE.Vector3(iterLeft + radius, hh, z),
            curveSegments
          ));

          if (!isLast) {
            points.push(new THREE.Vector3(iterRight - radius, hh, z));
            // Curve going down into next divet
            points.push(...quadraticBezierPoints(
              new THREE.Vector3(iterRight - radius, hh, z),
              new THREE.Vector3(iterRight, hh, z),
              new THREE.Vector3(iterRight, hh - radius, z),
              curveSegments
            ));
          } else {
            points.push(new THREE.Vector3(contentAreaWidth, hh, z));
          }
        }
      }

      // Right edge (handle area - straight down)
      points.push(new THREE.Vector3(contentAreaWidth, -hh, z));

      // Trace bottom edge with curved divets (going right to left)
      for (let i = loopCount - 1; i >= 0; i--) {
        const iterLeft = i * patternWidthPx;
        const visibleBeats = Math.min(patternBeats, blockTotalBeats - i * patternBeats);
        let iterWidth = visibleBeats * pixelsPerBeat;
        const isLast = i === loopCount - 1;

        if (isLast) {
          iterWidth = Math.min(iterWidth, contentAreaWidth - iterLeft);
        }
        if (iterWidth <= 4) iterWidth = 4;

        const iterRight = iterLeft + iterWidth;

        if (i === loopCount - 1) {
          // Last iteration (first in reverse)
          if (!isLast) {
            // Curve up into divet
            points.push(...quadraticBezierPoints(
              new THREE.Vector3(iterRight, -hh, z),
              new THREE.Vector3(iterRight, -hh + radius, z),
              new THREE.Vector3(iterRight - radius, -hh + radius, z),
              curveSegments
            ));
          }
          points.push(new THREE.Vector3(iterLeft + radius, -hh, z));
        } else if (i === 0) {
          // First iteration (last in reverse) - end with left corner
          // Curve up from divet
          points.push(...quadraticBezierPoints(
            new THREE.Vector3(iterRight, -hh + radius, z),
            new THREE.Vector3(iterRight, -hh, z),
            new THREE.Vector3(iterRight - radius, -hh, z),
            curveSegments
          ));
          points.push(new THREE.Vector3(radius, -hh, z));
        } else {
          // Middle iterations
          // Curve up from divet
          points.push(...quadraticBezierPoints(
            new THREE.Vector3(iterRight, -hh + radius, z),
            new THREE.Vector3(iterRight, -hh, z),
            new THREE.Vector3(iterRight - radius, -hh, z),
            curveSegments
          ));
          points.push(new THREE.Vector3(iterLeft + radius, -hh, z));
        }
      }

      // Bottom-left corner curve
      points.push(...quadraticBezierPoints(
        new THREE.Vector3(radius, -hh, z),
        new THREE.Vector3(0, -hh, z),
        new THREE.Vector3(0, -hh + radius, z),
        curveSegments
      ));

    } else {
      // Single block (no loop) - simple rounded rectangle on left, square on right
      const hw = contentAreaWidth / 2;

      // Top-left corner curve
      points.push(...quadraticBezierPoints(
        new THREE.Vector3(-hw, hh - radius, z),
        new THREE.Vector3(-hw, hh, z),
        new THREE.Vector3(-hw + radius, hh, z),
        curveSegments
      ));
      // Top edge
      points.push(new THREE.Vector3(hw, hh, z));
      // Right edge (square - connects to handle)
      points.push(new THREE.Vector3(hw, -hh, z));
      // Bottom edge
      points.push(new THREE.Vector3(-hw + radius, -hh, z));
      // Bottom-left corner curve
      points.push(...quadraticBezierPoints(
        new THREE.Vector3(-hw + radius, -hh, z),
        new THREE.Vector3(-hw, -hh, z),
        new THREE.Vector3(-hw, -hh + radius, z),
        curveSegments
      ));
    }

    const lineGeom = new THREE.BufferGeometry().setFromPoints(points);

    // Position depends on whether looped or not
    const posX = block.loop && loopCount > 1 ? blockLeft : blockLeft + contentAreaWidth / 2;
    const posY = -(blockTop + blockHeight / 2);

    return (
      <lineLoop
        position={[posX, posY, 0]}
        geometry={lineGeom}
      >
        <lineBasicMaterial color={selectionColor} linewidth={2} />
      </lineLoop>
    );
  }, [isSelected, block.loop, loopCount, patternWidthPx, patternBeats, blockTotalBeats, contentAreaWidth, blockWidth, blockHeight, blockLeft, blockTop, selectionColor]);

  // Header background when selected - follows iteration contours with divets
  const headerBg = useMemo(() => {
    if (!isSelected) return null;

    const headerHeight = 20;
    const radius = 4;
    const hh = headerHeight / 2;

    if (block.loop && loopCount > 1) {
      // Create individual header pieces for each iteration to follow divets
      const meshes: React.ReactNode[] = [];

      for (let i = 0; i < loopCount; i++) {
        const iterLeft = i * patternWidthPx;
        const visibleBeats = Math.min(patternBeats, blockTotalBeats - i * patternBeats);
        let iterWidth = visibleBeats * pixelsPerBeat;
        const isFirst = i === 0;
        const isLast = i === loopCount - 1;

        if (isLast) {
          iterWidth = Math.min(iterWidth, contentAreaWidth - iterLeft);
        }
        if (iterWidth <= 4) iterWidth = 4;

        // Create header shape for this iteration
        const leftRadius = isFirst ? radius : 0;
        const rightRadius = isLast ? 0 : 0; // No right radius - square edges between iterations
        const shape = createRoundedRectShape(iterWidth, headerHeight, [leftRadius, rightRadius, rightRadius, leftRadius]);

        meshes.push(
          <mesh
            key={`header-${i}`}
            position={[blockLeft + iterLeft + iterWidth / 2, -(blockTop + hh), 0.05]}
          >
            <shapeGeometry args={[shape]} />
            <meshBasicMaterial color={selectionColor} />
          </mesh>
        );
      }

      return <>{meshes}</>;
    } else {
      // Non-looped: simple header
      const shape = createRoundedRectShape(contentAreaWidth, headerHeight, [radius, 0, 0, 0]);
      return (
        <mesh position={[blockLeft + contentAreaWidth / 2, -(blockTop + hh), 0.05]}>
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial color={selectionColor} />
        </mesh>
      );
    }
  }, [isSelected, block.loop, loopCount, patternWidthPx, patternBeats, blockTotalBeats, contentAreaWidth, blockLeft, blockTop, selectionColor]);

  // Invisible hit areas for interaction
  const bodyHitArea = (
    <mesh
      position={[blockLeft + contentAreaWidth / 2, -(blockTop + blockHeight / 2), 0.5]}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown(e, block, track, trackIndex, 'body');
      }}
      onPointerOver={() => onPointerOver(block.id, 'body')}
      onPointerOut={onPointerOut}
    >
      <planeGeometry args={[contentAreaWidth - 24, blockHeight]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );

  const leftEdgeHitArea = (
    <mesh
      position={[blockLeft + 6, -(blockTop + blockHeight / 2), 0.5]}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown(e, block, track, trackIndex, 'left-edge');
      }}
      onPointerOver={() => onPointerOver(block.id, 'left-edge')}
      onPointerOut={onPointerOut}
    >
      <planeGeometry args={[12, blockHeight]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );

  const rightLoopHitArea = (
    <mesh
      position={[handleLeft + handleWidthPx / 2, -(blockTop + blockHeight / 4), 0.5]}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown(e, block, track, trackIndex, 'right-loop');
      }}
      onPointerOver={() => onPointerOver(block.id, 'right-loop')}
      onPointerOut={onPointerOut}
    >
      <planeGeometry args={[handleWidthPx, blockHeight / 2]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );

  const rightExtendHitArea = (
    <mesh
      position={[handleLeft + handleWidthPx / 2, -(blockTop + blockHeight * 3 / 4), 0.5]}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown(e, block, track, trackIndex, 'right-extend');
      }}
      onPointerOver={() => onPointerOver(block.id, 'right-extend')}
      onPointerOut={onPointerOut}
    >
      <planeGeometry args={[handleWidthPx, blockHeight / 2]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );

  // Waveform rendering for audio blocks
  const waveformMesh = useMemo(() => {
    if (!isAudioBlock || !block.audioData?.waveformPeaks) return null;

    const peaks = block.audioData.waveformPeaks;
    const contentTop = blockTop + 24;
    const contentHeight = blockHeight - 28;
    const contentLeft = blockLeft + 3;
    const contentWidth = contentAreaWidth - 6;

    const beatsPerSecond = bpm / 60;
    const audioBeats = block.audioData.duration * beatsPerSecond;
    const audioBars = audioBeats / beatsPerBar;
    const audioWidthPx = audioBars * barWidth;

    const centerY = contentTop + contentHeight / 2;
    const maxAmplitude = contentHeight / 2 - 2;

    // Create waveform geometry
    const positions: number[] = [];
    const drawWidth = Math.min(audioWidthPx, contentWidth);
    const samplesPerPixel = peaks.length / Math.max(1, audioWidthPx);

    for (let x = 0; x < drawWidth; x++) {
      const sampleIndex = Math.floor(x * samplesPerPixel);
      const peak = peaks[Math.min(sampleIndex, peaks.length - 1)] || 0;
      const barHeight = Math.max(1, peak * maxAmplitude);

      // Top of bar
      positions.push(contentLeft + x, -(centerY - barHeight), 0.1);
      // Bottom of bar
      positions.push(contentLeft + x, -(centerY + barHeight), 0.1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    return (
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#ffffff" opacity={0.85} transparent />
      </lineSegments>
    );
  }, [isAudioBlock, block.audioData, bpm, beatsPerBar, barWidth, blockTop, blockHeight, blockLeft, contentAreaWidth]);

  return (
    <group>
      {/* Iteration backgrounds */}
      {iterationMeshes}

      {/* Handle */}
      <mesh position={[handleLeft + handleWidthPx / 2, -(blockTop + blockHeight / 2), 0.02]}>
        <shapeGeometry args={[handleShape]} />
        <meshBasicMaterial
          color={isSelected ? selectedHandleColor : handleColor}
          opacity={handleOpacity}
          transparent={handleOpacity < 1}
        />
      </mesh>

      {/* Header background */}
      {headerBg}

      {/* Track name and loop indicator using Html overlay */}
      <Html
        position={[blockLeft + 4, -(blockTop + 10), 0.1]}
        style={{
          width: contentAreaWidth - 16,
          pointerEvents: 'none',
        }}
        transform={false}
        zIndexRange={[0, 0]}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            transform: 'translateY(-50%)',
          }}
        >
          <span
            style={{
              color: isSelected ? getSelectionTextColor(baseColor) : 'rgba(255,255,255,0.9)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {track.name}
          </span>
          {block.loop && (
            <span style={{ color: isSelected ? getSelectionTextColor(baseColor) : 'rgba(255,255,255,0.7)', fontSize: '10px', marginLeft: '4px', opacity: isSelected ? 0.7 : 1 }}>
              ⟳
            </span>
          )}
        </div>
      </Html>

      {/* Events or Waveform */}
      {isAudioBlock ? waveformMesh : eventMeshes}

      {/* Selection border */}
      {selectionBorder}

      {/* Hit areas */}
      {bodyHitArea}
      {leftEdgeHitArea}
      {rightLoopHitArea}
      {rightExtendHitArea}
    </group>
  );
}

// Marquee selection overlay
interface MarqueeProps {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

function Marquee({ startX, startY, currentX, currentY }: MarqueeProps) {
  const x1 = Math.min(startX, currentX);
  const y1 = Math.min(startY, currentY);
  const w = Math.abs(currentX - startX);
  const h = Math.abs(currentY - startY);

  const lineGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([
      -w/2, h/2, 0,
      w/2, h/2, 0,
      w/2, -h/2, 0,
      -w/2, -h/2, 0,
    ], 3));
    return geom;
  }, [w, h]);

  if (w < 2 || h < 2) return null;

  return (
    <group position={[x1 + w / 2, -(y1 + h / 2), 1]}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#3b82f6" opacity={0.15} transparent />
      </mesh>
      <lineLoop geometry={lineGeometry}>
        <lineBasicMaterial color="#3b82f6" opacity={0.6} transparent />
      </lineLoop>
    </group>
  );
}

// Main Scene Component
interface TimelineSceneProps {
  flatTracks: TrackNode[];
  pixelsPerBeat: number;
  beatsPerBar: number;
  totalBars: number;
  bpm: number;
  trackHeight: number;
  timelineWidth: number;
  totalHeight: number;
}

function TimelineScene({
  flatTracks,
  pixelsPerBeat,
  beatsPerBar,
  totalBars,
  bpm,
  trackHeight,
  timelineWidth,
  totalHeight,
}: TimelineSceneProps) {
  const { selectedBlockIds, selectBlock, selectBlocks, clearBlockSelection } = useUIStore();
  const { updateBlock, moveBlock } = useProjectStore();
  const tracks = useProjectStore((state) => state.project.tracks);

  const barWidth = beatsPerBar * pixelsPerBeat;

  // Drag state
  const [dragState, setDragState] = useState<{
    type: 'none' | 'drag' | 'resize-left' | 'resize-right-loop' | 'resize-right-extend' | 'marquee';
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    block?: Block;
    track?: Track;
    trackIndex?: number;
    originalPositions?: Map<string, { startBar: number; durationBars: number; trackId: string }>;
  }>({
    type: 'none',
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });

  // Hover state
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);
  const [hoverZone, setHoverZone] = useState<string | null>(null);

  const handleBlockPointerDown = useCallback((
    e: ThreeEvent<PointerEvent>,
    block: Block,
    track: Track,
    trackIndex: number,
    zone: string
  ) => {
    const point = e.point;

    // Handle selection
    if (e.shiftKey) {
      const newSelection = new Set(selectedBlockIds);
      if (newSelection.has(block.id)) {
        newSelection.delete(block.id);
      } else {
        newSelection.add(block.id);
      }
      selectBlocks(Array.from(newSelection));
    } else if (!selectedBlockIds.has(block.id)) {
      selectBlock(block.id, track.id, false);
    }

    // Capture original positions
    const originalPositions = new Map<string, { startBar: number; durationBars: number; trackId: string }>();
    for (const blockId of selectedBlockIds) {
      const trackId = findTrackForBlock(tracks, blockId);
      if (trackId) {
        const foundBlock = tracks[trackId].blocks.find(b => b.id === blockId);
        if (foundBlock) {
          originalPositions.set(blockId, {
            startBar: foundBlock.startBar,
            durationBars: foundBlock.durationBars,
            trackId,
          });
        }
      }
    }
    if (!originalPositions.has(block.id)) {
      originalPositions.set(block.id, {
        startBar: block.startBar,
        durationBars: block.durationBars,
        trackId: track.id,
      });
    }

    let dragType: typeof dragState.type = 'none';
    if (zone === 'left-edge') dragType = 'resize-left';
    else if (zone === 'right-loop') dragType = 'resize-right-loop';
    else if (zone === 'right-extend') dragType = 'resize-right-extend';
    else dragType = 'drag';

    setDragState({
      type: dragType,
      startX: point.x,
      startY: -point.y,
      currentX: point.x,
      currentY: -point.y,
      block,
      track,
      trackIndex,
      originalPositions,
    });
  }, [selectedBlockIds, selectBlock, selectBlocks, tracks]);

  const handlePointerMissed = useCallback((e: MouseEvent) => {
    if (dragState.type !== 'none') return;

    // Start marquee selection on background click
    const canvas = (e.target as HTMLElement).closest('canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!e.shiftKey) {
      clearBlockSelection();
    }

    setDragState({
      type: 'marquee',
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    });
  }, [dragState.type, clearBlockSelection]);

  // Handle pointer move and up globally
  useEffect(() => {
    if (dragState.type === 'none') return;

    const handleMove = (e: PointerEvent) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (dragState.type === 'marquee') {
        setDragState(prev => ({ ...prev, currentX: x, currentY: y }));
      } else if (dragState.type === 'drag' && dragState.originalPositions && dragState.block) {
        const deltaX = x - dragState.startX;
        const deltaBars = Math.round(deltaX / barWidth);

        for (const [blockId, original] of dragState.originalPositions) {
          const newStartBar = Math.max(0, original.startBar + deltaBars);
          updateBlock(original.trackId, blockId, { startBar: newStartBar });
        }
      } else if (dragState.type === 'resize-left' && dragState.originalPositions) {
        const deltaX = x - dragState.startX;
        const deltaBars = Math.round(deltaX / barWidth);

        for (const [blockId, original] of dragState.originalPositions) {
          const newStartBar = Math.max(0, original.startBar + deltaBars);
          const startDelta = newStartBar - original.startBar;
          const newDuration = Math.max(1, original.durationBars - startDelta);
          const originalEndBar = original.startBar + original.durationBars;
          const clampedDuration = Math.min(newDuration, originalEndBar - newStartBar);

          if (clampedDuration >= 1) {
            updateBlock(original.trackId, blockId, {
              startBar: newStartBar,
              durationBars: clampedDuration,
            });
          }
        }
      } else if ((dragState.type === 'resize-right-loop' || dragState.type === 'resize-right-extend') && dragState.originalPositions) {
        const deltaX = x - dragState.startX;
        const deltaBars = Math.round(deltaX / barWidth);

        for (const [blockId, original] of dragState.originalPositions) {
          const newDuration = Math.max(1, original.durationBars + deltaBars);
          const block = tracks[original.trackId]?.blocks.find(b => b.id === blockId);

          if (dragState.type === 'resize-right-loop' && block) {
            const patternBars = getPatternBars(block, beatsPerBar);
            const shouldLoop = newDuration > patternBars;
            updateBlock(original.trackId, blockId, {
              durationBars: newDuration,
              loop: shouldLoop,
            });
          } else {
            updateBlock(original.trackId, blockId, { durationBars: newDuration });
          }
        }
      }
    };

    const handleUp = () => {
      if (dragState.type === 'marquee') {
        // Calculate blocks in marquee
        const { startX, startY, currentX, currentY } = dragState;
        const minX = Math.min(startX, currentX);
        const maxX = Math.max(startX, currentX);
        const minY = Math.min(startY, currentY);
        const maxY = Math.max(startY, currentY);

        const matchingBlockIds: string[] = [];

        flatTracks.forEach((node, trackIndex) => {
          const track = node.track;
          const trackTop = trackIndex * trackHeight;
          const trackBottom = trackTop + trackHeight;

          if (maxY < trackTop || minY > trackBottom) return;

          track.blocks.forEach((block) => {
            const blockLeft = block.startBar * barWidth;
            const blockRight = blockLeft + block.durationBars * barWidth;

            if (maxX >= blockLeft && minX <= blockRight) {
              matchingBlockIds.push(block.id);
            }
          });
        });

        if (matchingBlockIds.length > 0) {
          selectBlocks(matchingBlockIds);
        }
      }

      setDragState({
        type: 'none',
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
      });
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragState, barWidth, trackHeight, flatTracks, updateBlock, selectBlocks, tracks, beatsPerBar]);

  return (
    <>
      <OrthographicCamera
        makeDefault
        position={[timelineWidth / 2, -totalHeight / 2, 100]}
        zoom={1}
        near={0.1}
        far={1000}
      />

      {/* Grid lines */}
      <GridLines totalBars={totalBars} barWidth={barWidth} height={totalHeight} />

      {/* Blocks */}
      {flatTracks.map((node, trackIndex) => (
        node.track.blocks.map((block) => (
          <BlockMesh
            key={block.id}
            block={block}
            track={node.track}
            trackIndex={trackIndex}
            pixelsPerBeat={pixelsPerBeat}
            beatsPerBar={beatsPerBar}
            trackHeight={trackHeight}
            bpm={bpm}
            isSelected={selectedBlockIds.has(block.id)}
            onPointerDown={handleBlockPointerDown}
            onPointerOver={(blockId, zone) => {
              setHoverBlockId(blockId);
              setHoverZone(zone);
            }}
            onPointerOut={() => {
              setHoverBlockId(null);
              setHoverZone(null);
            }}
            isHovered={hoverBlockId === block.id}
            hoveredZone={hoverBlockId === block.id ? hoverZone : null}
          />
        ))
      ))}

      {/* Marquee */}
      {dragState.type === 'marquee' && (
        <Marquee
          startX={dragState.startX}
          startY={dragState.startY}
          currentX={dragState.currentX}
          currentY={dragState.currentY}
        />
      )}

      {/* Background for pointer miss detection */}
      <mesh
        position={[timelineWidth / 2, -totalHeight / 2, -1]}
        onPointerMissed={handlePointerMissed}
      >
        <planeGeometry args={[timelineWidth, totalHeight]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </>
  );
}

// Main Component
export function TimelineCanvas({
  flatTracks,
  pixelsPerBeat,
  beatsPerBar,
  totalBars,
  bpm,
}: TimelineCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { trackHeightScale } = useUIStore();
  const { handleAudioFileDrop, isProcessingAudio } = useDragDrop();

  const [isDraggingAudioFile, setIsDraggingAudioFile] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const dragCounter = useRef(0);

  // Only render Canvas on client side
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const trackHeight = Math.round(64 * trackHeightScale);
  const barWidth = beatsPerBar * pixelsPerBeat;
  const timelineWidth = totalBars * barWidth;
  const totalHeight = Math.max(flatTracks.length * trackHeight, 400);

  // File drag handlers
  const handleFileDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingAudioFile(true);
    }
  }, []);

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDraggingAudioFile(false);
    }
  }, []);

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingAudioFile(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!isAudioFile(file)) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const bar = Math.max(0, Math.floor(x / barWidth));

    const y = e.clientY - rect.top;
    const trackIndex = Math.floor(y / trackHeight);
    const targetTrack = flatTracks[trackIndex]?.track;

    await handleAudioFileDrop(file, targetTrack?.id || null, bar);
  }, [barWidth, trackHeight, flatTracks, handleAudioFileDrop]);

  return (
    <div
      ref={containerRef}
      className="timeline-content relative overflow-hidden"
      style={{ width: timelineWidth, minHeight: '100%', height: totalHeight }}
      onDragEnter={handleFileDragEnter}
      onDragLeave={handleFileDragLeave}
      onDragOver={handleFileDragOver}
      onDrop={handleFileDrop}
    >
      {isMounted && (
        <Canvas
          style={{ width: timelineWidth, height: totalHeight }}
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
        >
          <TimelineScene
            flatTracks={flatTracks}
            pixelsPerBeat={pixelsPerBeat}
            beatsPerBar={beatsPerBar}
            totalBars={totalBars}
            bpm={bpm}
            trackHeight={trackHeight}
            timelineWidth={timelineWidth}
            totalHeight={totalHeight}
          />
        </Canvas>
      )}

      {/* Empty state */}
      {flatTracks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-muted-foreground">
            Add tracks from the Pattern Library
          </p>
        </div>
      )}

      {/* Audio file drop zone overlay */}
      {isDraggingAudioFile && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            border: '2px dashed rgba(34, 197, 94, 0.6)',
          }}
        >
          <div className="bg-surface/95 px-6 py-3 rounded-lg shadow-lg border border-green-500/30">
            <span className="text-green-400 font-medium text-lg">
              {isProcessingAudio ? 'Processing audio...' : 'Drop audio file here'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
