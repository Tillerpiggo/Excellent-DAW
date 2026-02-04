'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useUIStore } from '@/stores/uiStore';
import { initializePersistence } from '@/stores/persistence';

// Dynamic imports to avoid SSR issues with Tone.js
const DAWView = dynamic(
  () => import('@/components/PatternComposer').then((mod) => mod.DAWView),
  { ssr: false }
);

const HomePage = dynamic(
  () => import('@/components/HomePage').then((mod) => mod.HomePage),
  { ssr: false }
);

export default function Home() {
  const currentView = useUIStore((state) => state.currentView);

  // Initialize persistence on mount - must run before view is determined
  useEffect(() => {
    initializePersistence();
  }, []);

  if (currentView === 'home') {
    return <HomePage />;
  }

  return <DAWView />;
}
