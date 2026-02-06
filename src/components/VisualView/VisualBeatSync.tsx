'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useUIStore } from '@/stores/uiStore';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';

/**
 * R3F component that syncs visual state with the current beat every frame.
 * Must be placed before any instrument renderers in the scene tree.
 */
export function VisualBeatSync() {
  const engineRef = useRef(getVisualPlaybackEngine());

  useFrame(() => {
    const beat = useUIStore.getState().currentBeat;
    engineRef.current.computeStatesAtBeat(beat);
  });

  return null;
}
