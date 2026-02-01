'use client';

import { useEffect } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { Header } from './Header';
import { PatternLibrary } from './PatternLibrary/PatternLibrary';
import { TrackHierarchy } from './TrackHierarchy/TrackHierarchy';
import { Timeline } from './Timeline/Timeline';
import { Inspector } from './Inspector/Inspector';
import { ChordEditorPanel } from './ChordEditor';
import { DrumEditorPanel } from './DrumEditor';
import { ArpEditorPanel } from './ArpEditor';
import { useUIStore } from '@/stores/uiStore';
import { useKeyboard } from '@/hooks/useKeyboard';
import { initializePersistence } from '@/stores/persistence';

export function PatternComposer() {
  const { showLibrary, showInspector, showChordEditor, showDrumEditor, showArpEditor } = useUIStore();
  const showBottomPanel = showChordEditor || showDrumEditor || showArpEditor;

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
          {showBottomPanel ? (
            <Group orientation="vertical" id="editor-layout-v2">
              {/* Track Hierarchy + Timeline */}
              <Panel defaultSize={60} minSize={10} id="main-panel-v2">
                <div className="h-full flex overflow-hidden">
                  {/* Track Hierarchy */}
                  <div className="w-64 flex-shrink-0 border-r border-border bg-surface overflow-y-auto">
                    <TrackHierarchy />
                  </div>

                  {/* Timeline */}
                  <div className="flex-1 overflow-hidden">
                    <Timeline />
                  </div>
                </div>
              </Panel>

              {/* Bottom Panel - Chord/Drum Editors */}
              <Separator className="h-2 bg-border hover:bg-accent-from/50 transition-colors cursor-row-resize flex items-center justify-center group">
                <div className="w-12 h-1 rounded-full bg-muted group-hover:bg-accent-from/70 transition-colors" />
              </Separator>
              <Panel defaultSize={40} minSize={15} id="editor-panel-v2">
                <div className="h-full overflow-hidden">
                  <ChordEditorPanel />
                  <DrumEditorPanel />
                  <ArpEditorPanel />
                </div>
              </Panel>
            </Group>
          ) : (
            <>
              {/* Non-resizable layout when no editor is open */}
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
              {/* Hidden editors to allow their useEffects to run */}
              <div className="hidden">
                <ChordEditorPanel />
                <DrumEditorPanel />
                <ArpEditorPanel />
              </div>
            </>
          )}
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
