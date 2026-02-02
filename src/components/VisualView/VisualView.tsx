'use client';

import { Canvas } from '@react-three/fiber';
import { VisualScene } from './VisualScene';

interface VisualViewProps {
  trackIds: string[];
}

export function VisualView({ trackIds }: VisualViewProps) {
  return (
    <div className="w-full h-full bg-black/90">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={['#0a0a0f']} />
        <fog attach="fog" args={['#0a0a0f', 10, 30]} />
        <VisualScene trackIds={trackIds} />
      </Canvas>
    </div>
  );
}
