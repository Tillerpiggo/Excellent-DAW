'use client';

import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with Tone.js
const PatternComposer = dynamic(
  () => import('@/components/PatternComposer').then((mod) => mod.PatternComposer),
  { ssr: false }
);

export default function Home() {
  return <PatternComposer />;
}
