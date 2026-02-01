'use client';

import { useEffect } from 'react';
import { Header } from './Header';
import { PatternLibrary } from './PatternLibrary/PatternLibrary';
import { TrackHierarchy } from './TrackHierarchy/TrackHierarchy';
import { Timeline } from './Timeline/Timeline';
import { Inspector } from './Inspector/Inspector';
import { ChordEditorPanel } from './ChordEditor';
import { useUIStore } from '@/stores/uiStore';
import { useKeyboard } from '@/hooks/useKeyboard';
import { initializePersistence } from '@/stores/persistence';

export function PatternComposer() {
  const { showLibrary, showInspector } = useUIStore();

  // Setup keyboard shortcuts
  useKeyboard();

  // Initialize persistence on mount
  useEffect(() => {
    initializePersistence();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {/* Pattern Library - Left Sidebar */}
        {showLibrary && (
          <aside className="w-56 flex-shrink-0 border-r border-border bg-surface overflow-y-auto">
            <PatternLibrary />
          </aside>
        )}

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Track Hierarchy + Timeline */}
          <div className="flex-1 flex overflow-hidden">
            {/* Track Hierarchy */}
            <div className="w-64 flex-shrink-0 border-r border-border bg-surface overflow-y-auto">
              <TrackHierarchy />
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-hidden">
              <Timeline />
            </div>
          </div>

          {/* Chord Editor Panel - shows when chord block is selected */}
          <ChordEditorPanel />
        </main>

        {/* Inspector - Right Sidebar */}
        {showInspector && (
          <aside className="w-72 flex-shrink-0 border-l border-border bg-surface overflow-y-auto">
            <Inspector />
          </aside>
        )}
      </div>
    </div>
  );
}
