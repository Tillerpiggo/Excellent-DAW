'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useUIStore } from '@/stores/uiStore';
import { initializePersistence } from '@/stores/persistence';

const DAWView = dynamic(
  () => import('@/components/PatternComposer').then((mod) => mod.DAWView),
  { ssr: false }
);

const HomePage = dynamic(
  () => import('@/components/HomePage').then((mod) => mod.HomePage),
  { ssr: false }
);

export default function ComposerPage() {
  const currentView = useUIStore((state) => state.currentView);

  useEffect(() => {
    initializePersistence();
  }, []);

  if (currentView === 'home') {
    return <HomePage />;
  }

  return <DAWView />;
}
