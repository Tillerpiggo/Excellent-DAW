'use client';

import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VisualInstrumentState } from '@/core/visualTypes';

interface PolarFlowerProps {
  state: VisualInstrumentState;
}

interface FlowerInstance {
  id: number;
  scale: number;
  opacity: number;
  color: THREE.Color;
  rotation: number;
  rotationSpeed: number;
}

// Generate a polar flower shape based on r = cos(n * theta)
function createFlowerShape(petals: number = 5, samples: number = 200): THREE.Shape {
  const shape = new THREE.Shape();
  const points: THREE.Vector2[] = [];

  for (let i = 0; i <= samples; i++) {
    const theta = (i / samples) * Math.PI * 2;
    const r = Math.cos(petals * theta) * 0.8 + 0.5;
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    points.push(new THREE.Vector2(x, y));
  }

  shape.setFromPoints(points);
  return shape;
}

// Color palette for spawned flowers
const FLOWER_COLORS = [
  '#f43f5e', // rose
  '#ec4899', // pink
  '#a855f7', // purple
  '#6366f1', // indigo
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#84cc16', // lime
  '#eab308', // yellow
  '#f97316', // orange
];

let colorIndex = 0;
let instanceIdCounter = 0;

function getNextColor(): THREE.Color {
  const color = new THREE.Color(FLOWER_COLORS[colorIndex % FLOWER_COLORS.length]);
  colorIndex++;
  return color;
}

// Single expanding flower mesh
function ExpandingFlower({ instance, geometry }: { instance: FlowerInstance; geometry: THREE.ExtrudeGeometry }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(() => {
    if (!meshRef.current || !materialRef.current) return;

    meshRef.current.scale.setScalar(instance.scale);
    meshRef.current.rotation.z = instance.rotation;
    materialRef.current.opacity = instance.opacity;
    materialRef.current.emissiveIntensity = instance.opacity * 0.5;
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        ref={materialRef}
        color={instance.color}
        emissive={instance.color}
        emissiveIntensity={0.5}
        metalness={0.2}
        roughness={0.3}
        transparent
        opacity={1}
        depthWrite={false}
      />
    </mesh>
  );
}

export function PolarFlower({ state }: PolarFlowerProps) {
  const [flowers, setFlowers] = useState<FlowerInstance[]>([]);
  const seenNotesRef = useRef<Set<number>>(new Set());
  const flowersRef = useRef<FlowerInstance[]>([]);

  // Create the extruded geometry from polar flower shape
  const geometry = useMemo(() => {
    const shape = createFlowerShape(5);
    const extrudeSettings = {
      depth: 0.15,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 2,
    };
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, []);

  // Animation loop
  useFrame((_, delta) => {
    // Detect new notes and spawn flowers
    for (const [pitch, note] of state.activeNotes) {
      if (!seenNotesRef.current.has(pitch)) {
        seenNotesRef.current.add(pitch);

        // Spawn a new flower
        const velocityFactor = note.velocity / 127;
        const newFlower: FlowerInstance = {
          id: instanceIdCounter++,
          scale: 0.1,
          opacity: 1,
          color: getNextColor(),
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (0.5 + Math.random() * 0.5) * (Math.random() > 0.5 ? 1 : -1),
        };
        flowersRef.current.push(newFlower);
      }
    }

    // Remove notes that are no longer active from seen set
    for (const pitch of seenNotesRef.current) {
      if (!state.activeNotes.has(pitch)) {
        seenNotesRef.current.delete(pitch);
      }
    }

    // Update all flowers - expand and fade
    const expandSpeed = 2.0;
    const fadeSpeed = 0.8;

    for (const flower of flowersRef.current) {
      flower.scale += delta * expandSpeed;
      flower.opacity -= delta * fadeSpeed;
      flower.rotation += delta * flower.rotationSpeed;
    }

    // Remove fully faded flowers
    flowersRef.current = flowersRef.current.filter(f => f.opacity > 0);

    // Trigger re-render with updated flowers
    setFlowers([...flowersRef.current]);
  });

  return (
    <group>
      {flowers.map((flower) => (
        <ExpandingFlower key={flower.id} instance={flower} geometry={geometry} />
      ))}
    </group>
  );
}
