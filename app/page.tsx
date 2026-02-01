'use client';

import dynamic from 'next/dynamic';
import { useUIStore } from '@/stores/uiStore';

// Dynamic imports to avoid SSR issues with Tone.js
const PatternComposer = dynamic(
  () => import('@/components/PatternComposer').then((mod) => mod.PatternComposer),
  { ssr: false }
);

const HomePage = dynamic(
  () => import('@/components/HomePage').then((mod) => mod.HomePage),
  { ssr: false }
);

export default function Home() {
  const currentView = useUIStore((state) => state.currentView);

  if (currentView === 'home') {
    return <HomePage />;
  }

  return <PatternComposer />;
}
