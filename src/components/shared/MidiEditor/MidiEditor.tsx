'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrthographicCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
import { generateId } from '@/utils/id';

export interface MidiRow {
  pitch: number;
  label: string;
  color: string;
}

export interface MidiNote {
  id: string;
  pitch: number;
  time: number;
  duration: number;
  velocity: number;
}

export interface MidiEditorProps {
  rows: MidiRow[];
  notes: MidiNote[];
  onNotesChange: (notes: MidiNote[]) => void;
  totalBeats: number;
  beatsPerBar: number;
  quantize: number;
  pixelsPerBeat?: number;
  rowHeight?: number;
}

interface DragState {
  type: 'none' | 'drawing' | 'moving' | 'marquee';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  noteId?: string;
  originalTime?: number;
  pitch?: number;
}

// Helper to lighten a hex color
function lightenColor(hex: string, amount: number): string {
  const cleanHex = hex.replace('#', '');
  const num = parseInt(cleanHex, 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Glow shader material for rounded rectangle
const glowVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowFragmentShader = `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform vec2 uSize;
  uniform float uRadius;
  uniform float uGlowSize;
  varying vec2 vUv;

  // SDF for rounded rectangle (centered at origin)
  float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  void main() {
    // Convert UV to local coordinates centered on the note
    vec2 totalSize = uSize + uGlowSize * 2.0;
    vec2 p = (vUv - 0.5) * totalSize;

    // Calculate SDF to the inner rounded rectangle
    float d = sdRoundedBox(p, uSize * 0.5, uRadius);

    // Create smooth glow falloff
    float glow = 1.0 - smoothstep(0.0, uGlowSize, d);
    glow = pow(glow, 1.5); // Adjust falloff curve

    gl_FragColor = vec4(uColor, glow * uIntensity);
  }
`;

// Create a centered rounded rectangle shape
function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);

  shape.moveTo(-hw + r, hh);
  shape.lineTo(hw - r, hh);
  if (r > 0) shape.quadraticCurveTo(hw, hh, hw, hh - r);
  shape.lineTo(hw, -hh + r);
  if (r > 0) shape.quadraticCurveTo(hw, -hh, hw - r, -hh);
  shape.lineTo(-hw + r, -hh);
  if (r > 0) shape.quadraticCurveTo(-hw, -hh, -hw, -hh + r);
  shape.lineTo(-hw, hh - r);
  if (r > 0) shape.quadraticCurveTo(-hw, hh, -hw + r, hh);

  return shape;
}

// Grid Lines Component
interface GridLinesProps {
  totalBeats: number;
  beatsPerBar: number;
  quantize: number;
  pixelsPerBeat: number;
  labelWidth: number;
  height: number;
}

function GridLines({ totalBeats, beatsPerBar, quantize, pixelsPerBeat, labelWidth, height }: GridLinesProps) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];

    for (let beat = 0; beat <= totalBeats; beat += quantize) {
      const x = labelWidth + beat * pixelsPerBeat;
      const isBar = beat % beatsPerBar === 0;
      const isBeat = beat % 1 === 0;

      // Line from top to bottom
      positions.push(x, 0, 0, x, -height, 0);

      // Color based on beat type
      const alpha = isBar ? 0.15 : isBeat ? 0.08 : 0.03;
      colors.push(1, 1, 1, alpha, 1, 1, 1, alpha);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    return geom;
  }, [totalBeats, beatsPerBar, quantize, pixelsPerBeat, labelWidth, height]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent />
    </lineSegments>
  );
}

// Row Dividers Component
interface RowDividersProps {
  rows: MidiRow[];
  rowHeight: number;
  labelWidth: number;
  width: number;
}

function RowDividers({ rows, rowHeight, labelWidth, width }: RowDividersProps) {
  const geometry = useMemo(() => {
    const positions: number[] = [];

    rows.forEach((_, i) => {
      const y = -(i * rowHeight + rowHeight - 1);
      positions.push(labelWidth, y, 0, width, y, 0);
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geom;
  }, [rows, rowHeight, labelWidth, width]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#ffffff" opacity={0.05} transparent />
    </lineSegments>
  );
}

// Glow Mesh Component using custom shader
interface GlowMeshProps {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  glowSize?: number;
  intensity?: number;
}

function GlowMesh({ x, y, w, h, color, glowSize = 12, intensity = 0.8 }: GlowMeshProps) {
  const shaderMaterial = useMemo(() => {
    const threeColor = new THREE.Color(color);
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: threeColor },
        uIntensity: { value: intensity },
        uSize: { value: new THREE.Vector2(w, h) },
        uRadius: { value: 3 },
        uGlowSize: { value: glowSize },
      },
      vertexShader: glowVertexShader,
      fragmentShader: glowFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, [color, w, h, glowSize, intensity]);

  // Total size including glow
  const totalW = w + glowSize * 2;
  const totalH = h + glowSize * 2;

  return (
    <mesh position={[x + w / 2, -(y + h / 2), -0.05]} material={shaderMaterial}>
      <planeGeometry args={[totalW, totalH]} />
    </mesh>
  );
}

// Selection Ring Component
interface SelectionRingProps {
  x: number;
  y: number;
  w: number;
  h: number;
}

function SelectionRing({ x, y, w, h }: SelectionRingProps) {
  const ringGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([
      -w / 2, h / 2, 0,
      w / 2, h / 2, 0,
      w / 2, -h / 2, 0,
      -w / 2, -h / 2, 0,
    ], 3));
    return geom;
  }, [w, h]);

  return (
    <lineLoop position={[x + w / 2, -(y + h / 2), 0.1]} geometry={ringGeometry}>
      <lineBasicMaterial color="#ffffff" opacity={0.6} transparent />
    </lineLoop>
  );
}

// Single Note Mesh Component
interface NoteMeshProps {
  note: MidiNote;
  row: MidiRow;
  rowIndex: number;
  rowHeight: number;
  pixelsPerBeat: number;
  labelWidth: number;
  isSelected: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>, note: MidiNote) => void;
}

function NoteMesh({
  note,
  row,
  rowIndex,
  rowHeight,
  pixelsPerBeat,
  labelWidth,
  isSelected,
  onPointerDown,
}: NoteMeshProps) {
  const x = labelWidth + note.time * pixelsPerBeat;
  const y = rowIndex * rowHeight + 2;
  const w = Math.max(note.duration * pixelsPerBeat, 8);
  const h = rowHeight - 4;

  const noteColor = isSelected ? lightenColor(row.color, 0.3) : row.color;

  const shape = useMemo(() => createRoundedRectShape(w, h, 3), [w, h]);

  return (
    <group>
      {/* Glow effect for selected notes */}
      {isSelected && (
        <GlowMesh x={x} y={y} w={w} h={h} color={row.color} glowSize={14} intensity={0.9} />
      )}

      {/* Shadow (only for non-selected) */}
      {!isSelected && (
        <mesh position={[x + w / 2 + 1, -(y + h / 2 + 1), -0.1]}>
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial color="#000000" opacity={0.3} transparent />
        </mesh>
      )}

      {/* Note body */}
      <mesh position={[x + w / 2, -(y + h / 2), 0]}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial color={noteColor} />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <SelectionRing x={x} y={y} w={w} h={h} />
      )}

      {/* Hit area */}
      <mesh
        position={[x + w / 2, -(y + h / 2), 0.5]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(e, note);
        }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
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

  if (w < 2 || h < 2) return null;

  const lineGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([
      -w / 2, h / 2, 0,
      w / 2, h / 2, 0,
      w / 2, -h / 2, 0,
      -w / 2, -h / 2, 0,
    ], 3));
    return geom;
  }, [w, h]);

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
interface MidiSceneProps {
  rows: MidiRow[];
  notes: MidiNote[];
  onNotesChange: (notes: MidiNote[]) => void;
  totalBeats: number;
  beatsPerBar: number;
  quantize: number;
  pixelsPerBeat: number;
  rowHeight: number;
  labelWidth: number;
  canvasWidth: number;
  canvasHeight: number;
}

function MidiScene({
  rows,
  notes,
  onNotesChange,
  totalBeats,
  beatsPerBar,
  quantize,
  pixelsPerBeat,
  rowHeight,
  labelWidth,
  canvasWidth,
  canvasHeight,
}: MidiSceneProps) {
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [drawingNote, setDrawingNote] = useState<MidiNote | null>(null);
  const [dragState, setDragState] = useState<DragState>({
    type: 'none',
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });

  // Create pitch-to-row index lookup
  const pitchToRowIndex = useCallback((pitch: number) => {
    return rows.findIndex(r => r.pitch === pitch);
  }, [rows]);

  // Handle note pointer down
  const handleNotePointerDown = useCallback((e: ThreeEvent<PointerEvent>, note: MidiNote) => {
    const point = e.point;

    if (e.shiftKey) {
      setSelectedNoteIds(prev => {
        const next = new Set(prev);
        if (next.has(note.id)) next.delete(note.id);
        else next.add(note.id);
        return next;
      });
    } else if (!selectedNoteIds.has(note.id)) {
      setSelectedNoteIds(new Set([note.id]));
    }

    setDragState({
      type: 'moving',
      startX: point.x,
      startY: -point.y,
      currentX: point.x,
      currentY: -point.y,
      noteId: note.id,
      originalTime: note.time,
    });
  }, [selectedNoteIds]);

  // Handle background click (for drawing new notes or marquee)
  const handleBackgroundPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    const point = e.point;
    const x = point.x;
    const y = -point.y;

    if (x > labelWidth) {
      // Clicked on grid
      const gridX = x - labelWidth;
      const rowIndex = Math.floor(y / rowHeight);

      if (rowIndex >= 0 && rowIndex < rows.length) {
        // Start drawing a new note
        const pitch = rows[rowIndex].pitch;
        const rawTime = gridX / pixelsPerBeat;
        const time = Math.round(rawTime / quantize) * quantize;

        if (time >= 0 && time < totalBeats) {
          const newNote: MidiNote = {
            id: generateId(),
            pitch,
            time,
            duration: quantize,
            velocity: 100,
          };

          setDrawingNote(newNote);
          if (!e.shiftKey) {
            setSelectedNoteIds(new Set([newNote.id]));
          } else {
            setSelectedNoteIds(prev => new Set([...prev, newNote.id]));
          }

          setDragState({
            type: 'drawing',
            startX: x,
            startY: y,
            currentX: x,
            currentY: y,
            pitch,
          });
        }
      } else {
        // Start marquee
        if (!e.shiftKey) setSelectedNoteIds(new Set());
        setDragState({
          type: 'marquee',
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
        });
      }
    }
  }, [labelWidth, rowHeight, rows, pixelsPerBeat, quantize, totalBeats]);

  // Handle pointer missed (clicks on canvas background - outside Three.js meshes)
  const handlePointerMissed = useCallback((e: MouseEvent) => {
    if (dragState.type !== 'none') return;

    const canvas = (e.target as HTMLElement).closest('canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x > labelWidth) {
      const gridX = x - labelWidth;
      const rowIndex = Math.floor(y / rowHeight);

      if (rowIndex >= 0 && rowIndex < rows.length) {
        // Start drawing a new note
        const pitch = rows[rowIndex].pitch;
        const rawTime = gridX / pixelsPerBeat;
        const time = Math.round(rawTime / quantize) * quantize;

        if (time >= 0 && time < totalBeats) {
          const newNote: MidiNote = {
            id: generateId(),
            pitch,
            time,
            duration: quantize,
            velocity: 100,
          };

          setDrawingNote(newNote);
          if (!e.shiftKey) {
            setSelectedNoteIds(new Set([newNote.id]));
          } else {
            setSelectedNoteIds(prev => new Set([...prev, newNote.id]));
          }

          setDragState({
            type: 'drawing',
            startX: x,
            startY: y,
            currentX: x,
            currentY: y,
            pitch,
          });
        }
      } else {
        // Start marquee
        if (!e.shiftKey) setSelectedNoteIds(new Set());
        setDragState({
          type: 'marquee',
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
        });
      }
    }
  }, [dragState.type, labelWidth, rowHeight, rows, pixelsPerBeat, quantize, totalBeats]);

  // Get notes within marquee
  const getNotesInMarquee = useCallback((x1: number, y1: number, x2: number, y2: number): string[] => {
    const minX = Math.min(x1, x2) - labelWidth;
    const maxX = Math.max(x1, x2) - labelWidth;
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const matchingIds: string[] = [];

    for (const note of notes) {
      const rowIndex = pitchToRowIndex(note.pitch);
      if (rowIndex === -1) continue;

      const noteTop = rowIndex * rowHeight;
      const noteBottom = noteTop + rowHeight;
      const noteLeft = note.time * pixelsPerBeat;
      const noteRight = noteLeft + note.duration * pixelsPerBeat;

      if (maxX >= noteLeft && minX <= noteRight && maxY >= noteTop && minY <= noteBottom) {
        matchingIds.push(note.id);
      }
    }

    return matchingIds;
  }, [notes, pitchToRowIndex, rowHeight, pixelsPerBeat, labelWidth]);

  // Handle global pointer move/up
  useEffect(() => {
    if (dragState.type === 'none') return;

    const handleMove = (e: PointerEvent) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (dragState.type === 'drawing' && drawingNote) {
        const deltaX = x - dragState.startX;
        const deltaDuration = deltaX / pixelsPerBeat;
        let newDuration = Math.round((quantize + deltaDuration) / quantize) * quantize;
        newDuration = Math.max(quantize, Math.min(totalBeats - drawingNote.time, newDuration));

        if (newDuration !== drawingNote.duration) {
          setDrawingNote(prev => prev ? { ...prev, duration: newDuration } : null);
        }
      } else if (dragState.type === 'moving' && dragState.originalTime !== undefined) {
        const deltaX = x - dragState.startX;
        const deltaBeats = deltaX / pixelsPerBeat;
        const snappedDelta = Math.round(deltaBeats / quantize) * quantize;

        // Move all selected notes
        if (snappedDelta !== 0) {
          onNotesChange(notes.map(n => {
            if (selectedNoteIds.has(n.id)) {
              const baseTime = n.id === dragState.noteId ? dragState.originalTime! : n.time;
              const newTime = Math.max(0, Math.min(totalBeats - n.duration, baseTime + snappedDelta));
              return { ...n, time: newTime };
            }
            return n;
          }));
        }
      } else if (dragState.type === 'marquee') {
        setDragState(prev => ({ ...prev, currentX: x, currentY: y }));
      }
    };

    const handleUp = () => {
      if (dragState.type === 'drawing' && drawingNote) {
        onNotesChange([...notes, drawingNote]);
        setDrawingNote(null);
      } else if (dragState.type === 'marquee') {
        const ids = getNotesInMarquee(dragState.startX, dragState.startY, dragState.currentX, dragState.currentY);
        if (ids.length > 0) {
          setSelectedNoteIds(new Set(ids));
        }
      }

      setDragState({ type: 'none', startX: 0, startY: 0, currentX: 0, currentY: 0 });
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragState, drawingNote, pixelsPerBeat, quantize, totalBeats, notes, selectedNoteIds, onNotesChange, getNotesInMarquee]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (selectedNoteIds.size > 0 && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onNotesChange(notes.filter(n => !selectedNoteIds.has(n.id)));
        setSelectedNoteIds(new Set());
      } else if (e.key === 'Escape') {
        setSelectedNoteIds(new Set());
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedNoteIds, notes, onNotesChange]);

  // All notes including the one being drawn
  const allNotes = drawingNote ? [...notes, drawingNote] : notes;

  return (
    <>
      <OrthographicCamera
        makeDefault
        position={[canvasWidth / 2, -canvasHeight / 2, 100]}
        zoom={1}
        near={0.1}
        far={1000}
      />

      {/* Background */}
      <mesh position={[canvasWidth / 2, -canvasHeight / 2, -2]}>
        <planeGeometry args={[canvasWidth, canvasHeight]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>

      {/* Labels column background */}
      <mesh position={[labelWidth / 2, -canvasHeight / 2, -1]}>
        <planeGeometry args={[labelWidth, canvasHeight]} />
        <meshBasicMaterial color="#242424" />
      </mesh>

      {/* Row labels using Html overlay */}
      {rows.map((row, i) => (
        <Html
          key={row.pitch}
          position={[labelWidth - 8, -(i * rowHeight + rowHeight / 2), 0]}
          style={{ pointerEvents: 'none' }}
          transform={false}
          zIndexRange={[0, 0]}
        >
          <div
            style={{
              fontSize: '11px',
              color: '#888',
              whiteSpace: 'nowrap',
              textAlign: 'right',
              transform: 'translateX(-100%) translateY(-50%)',
            }}
          >
            {row.label}
          </div>
        </Html>
      ))}

      {/* Row dividers */}
      <RowDividers rows={rows} rowHeight={rowHeight} labelWidth={labelWidth} width={canvasWidth} />

      {/* Grid lines */}
      <GridLines
        totalBeats={totalBeats}
        beatsPerBar={beatsPerBar}
        quantize={quantize}
        pixelsPerBeat={pixelsPerBeat}
        labelWidth={labelWidth}
        height={canvasHeight}
      />

      {/* Notes */}
      {allNotes.map((note) => {
        const rowIndex = pitchToRowIndex(note.pitch);
        if (rowIndex === -1) return null;

        return (
          <NoteMesh
            key={note.id}
            note={note}
            row={rows[rowIndex]}
            rowIndex={rowIndex}
            rowHeight={rowHeight}
            pixelsPerBeat={pixelsPerBeat}
            labelWidth={labelWidth}
            isSelected={selectedNoteIds.has(note.id)}
            onPointerDown={handleNotePointerDown}
          />
        );
      })}

      {/* Marquee */}
      {dragState.type === 'marquee' && (
        <Marquee
          startX={dragState.startX}
          startY={dragState.startY}
          currentX={dragState.currentX}
          currentY={dragState.currentY}
        />
      )}

      {/* Grid hit area for new note drawing */}
      <mesh
        position={[(labelWidth + canvasWidth) / 2, -canvasHeight / 2, 0.5]}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMissed={handlePointerMissed}
      >
        <planeGeometry args={[canvasWidth - labelWidth, canvasHeight]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

    </>
  );
}

// Main Component
export function MidiEditor({
  rows,
  notes,
  onNotesChange,
  totalBeats,
  beatsPerBar,
  quantize,
  pixelsPerBeat = 40,
  rowHeight = 28,
}: MidiEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Only render Canvas on client side
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Canvas dimensions
  const labelWidth = 64;
  const canvasWidth = totalBeats * pixelsPerBeat + labelWidth + 20;
  const canvasHeight = rows.length * rowHeight;

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-background"
      style={{ cursor: 'crosshair' }}
    >
      <div style={{ width: canvasWidth, height: canvasHeight }}>
        {isMounted && (
          <Canvas
            style={{ width: canvasWidth, height: canvasHeight }}
            gl={{ antialias: true, alpha: true }}
            dpr={[1, 2]}
          >
            <MidiScene
              rows={rows}
              notes={notes}
              onNotesChange={onNotesChange}
              totalBeats={totalBeats}
              beatsPerBar={beatsPerBar}
              quantize={quantize}
              pixelsPerBeat={pixelsPerBeat}
              rowHeight={rowHeight}
              labelWidth={labelWidth}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
            />
          </Canvas>
        )}
      </div>
    </div>
  );
}
