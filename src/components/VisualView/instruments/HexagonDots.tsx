'use client';

import { useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';

interface HexagonDotsProps {
  trackId: string;
}

interface DotInstance {
  id: number;
  position: THREE.Vector3;
  color: THREE.Color;
  size: number;
  opacity: number;
  // For rotation: store the radius from center and current angle
  radius: number;
  angle: number;
}

// Rainbow color palette with smooth transitions
const RAINBOW_COLORS = [
  '#ff0000', // red
  '#ff4500', // orange-red
  '#ff8c00', // dark orange
  '#ffd700', // gold
  '#adff2f', // green-yellow
  '#00ff00', // green
  '#00fa9a', // medium spring green
  '#00ffff', // cyan
  '#1e90ff', // dodger blue
  '#4169e1', // royal blue
  '#8a2be2', // blue violet
  '#ff00ff', // magenta
  '#ff1493', // deep pink
];

let colorHue = 0;
let dotIdCounter = 0;

// Get next rainbow color with subtle shift
function getNextRainbowColor(): THREE.Color {
  const hue = (colorHue % 360) / 360;
  colorHue += 15 + Math.random() * 10; // Subtle shift each trigger
  const color = new THREE.Color();
  color.setHSL(hue, 0.9, 0.6);
  return color;
}

// Generate a point on the hexagon at a given angle
function getHexagonPoint(angle: number, radius: number, distance: number): THREE.Vector3 {
  // Hexagon has 6 vertices, we can interpolate along edges
  const hexAngle = Math.PI / 3; // 60 degrees
  const vertexIndex = Math.floor((angle / (Math.PI * 2)) * 6);
  const localAngle = (angle % hexAngle) / hexAngle;

  // Get the two vertices we're between
  const angle1 = vertexIndex * hexAngle;
  const angle2 = (vertexIndex + 1) * hexAngle;

  const x1 = Math.cos(angle1) * radius;
  const y1 = Math.sin(angle1) * radius;
  const x2 = Math.cos(angle2) * radius;
  const y2 = Math.sin(angle2) * radius;

  // Interpolate between vertices
  const x = x1 + (x2 - x1) * localAngle;
  const y = y1 + (y2 - y1) * localAngle;

  return new THREE.Vector3(x, y, -distance);
}

// Glowing dot component
function GlowingDot({ instance }: { instance: DotInstance }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    if (!meshRef.current || !materialRef.current) return;
    meshRef.current.position.copy(instance.position);
    materialRef.current.opacity = instance.opacity;
  });

  return (
    <mesh ref={meshRef} position={instance.position}>
      <sphereGeometry args={[instance.size, 16, 16]} />
      <meshBasicMaterial
        ref={materialRef}
        color={instance.color}
        transparent
        opacity={instance.opacity}
        depthWrite={false}
      />
    </mesh>
  );
}

export function HexagonDots({ trackId }: HexagonDotsProps) {
  const [dots, setDots] = useState<DotInstance[]>([]);
  // Track by "pitch:startTime" to detect truly new note events
  const seenNotesRef = useRef<Set<string>>(new Set());
  const dotsRef = useRef<DotInstance[]>([]);
  const engineRef = useRef(getVisualPlaybackEngine());
  const { camera } = useThree();

  const hexagonRadius = 4; // Radius of the hexagon
  const hexagonDistance = 25; // Distance from camera
  const dotSpeed = 4.0; // Units per second towards camera
  const cameraZThreshold = camera.position.z + 2; // Dots disappear past this

  useFrame((_, delta) => {
    // Read state directly from engine (not via React state)
    const state = engineRef.current.getTrackState(trackId);
    if (!state) return;

    // Detect new notes and spawn dots
    for (const [pitch, note] of state.activeNotes) {
      const noteKey = `${pitch}:${note.startTimeInBeats}`;
      if (!seenNotesRef.current.has(noteKey)) {
        seenNotesRef.current.add(noteKey);

        // Spawn 6 dots at positions along the hexagon (one per vertex)
        const numDots = 6;
        const baseColor = getNextRainbowColor();

        for (let i = 0; i < numDots; i++) {
          // Distribute dots around the hexagon with some randomness
          const baseAngle = (i / numDots) * Math.PI * 2;
          const angle = baseAngle + (Math.random() - 0.5) * 0.3;
          const position = getHexagonPoint(angle, hexagonRadius, hexagonDistance);

          // Calculate the radius from center for this dot (distance in x,y plane)
          const dotRadius = Math.sqrt(position.x * position.x + position.y * position.y);

          // Slight color variation for each dot
          const dotColor = baseColor.clone();
          dotColor.offsetHSL(Math.random() * 0.05 - 0.025, 0, Math.random() * 0.1 - 0.05);

          const velocityFactor = note.velocity / 127;

          const newDot: DotInstance = {
            id: dotIdCounter++,
            position,
            color: dotColor,
            size: 0.1 + velocityFactor * 0.1,
            opacity: 0.8 + velocityFactor * 0.2,
            radius: dotRadius,
            angle: angle,
          };
          dotsRef.current.push(newDot);
        }
      }
    }

    // Clean up old entries from seenNotesRef (notes no longer active)
    for (const noteKey of seenNotesRef.current) {
      const pitch = parseInt(noteKey.split(':')[0]);
      if (!state.activeNotes.has(pitch)) {
        seenNotesRef.current.delete(noteKey);
      }
    }

    // Rotation speed in radians per second
    const rotationSpeed = 0.5;

    // Update all dots - move towards camera and rotate around center
    for (const dot of dotsRef.current) {
      dot.position.z += dotSpeed * delta;

      // Rotate the dot around the center of its plane
      dot.angle += rotationSpeed * delta;
      dot.position.x = Math.cos(dot.angle) * dot.radius;
      dot.position.y = Math.sin(dot.angle) * dot.radius;

      // Fade in when starting, fade out when approaching camera
      const distanceFromCamera = camera.position.z - dot.position.z;
      if (distanceFromCamera < 2) {
        dot.opacity = Math.max(0, distanceFromCamera / 2);
      } else if (dot.position.z > -hexagonDistance + 5) {
        // Fade in during first part of journey
        const fadeInProgress = (hexagonDistance + dot.position.z) / 5;
        dot.opacity = Math.min(1, fadeInProgress);
      }
    }

    // Remove dots that have passed the camera
    dotsRef.current = dotsRef.current.filter(d => d.position.z < cameraZThreshold);

    // Trigger re-render
    setDots([...dotsRef.current]);
  });

  return (
    <group>
      {dots.map((dot) => (
        <GlowingDot key={dot.id} instance={dot} />
      ))}
    </group>
  );
}
