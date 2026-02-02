'use client';

import { useEffect } from 'react';
import { Panel, Group, Separator, usePanelRef } from 'react-resizable-panels';
import { Header } from './Header';
import { PatternLibrary } from './PatternLibrary/PatternLibrary';
import { ArrangementView } from './ArrangementView';
import { Inspector } from './Inspector/Inspector';
import { ChordEditorPanel } from './ChordEditor';
import { DrumEditorPanel } from './DrumEditor';
import { ArpEditorPanel } from './ArpEditor';
import { MuteEditorPanel } from './MuteEditor';
import { TransposeEditorPanel } from './TransposeEditor';
import { useUIStore } from '@/stores/uiStore';
import { useKeyboard } from '@/hooks/useKeyboard';

export function PatternComposer() {
  const { showLibrary, showInspector, showChordEditor, showDrumEditor, showArpEditor, showMuteEditor, showTransposeEditor } = useUIStore();
  const showBottomPanel = showChordEditor || showDrumEditor || showArpEditor || showMuteEditor || showTransposeEditor;

  // Panel refs for imperative collapse/expand control
  const libraryPanelRef = usePanelRef();
  const inspectorPanelRef = usePanelRef();

  // Setup keyboard shortcuts
  useKeyboard();

  // Sync library toggle with panel collapse/expand
  useEffect(() => {
    if (showLibrary) {
      libraryPanelRef.current?.expand();
    } else {
      libraryPanelRef.current?.collapse();
    }
  }, [showLibrary]);

  // Sync inspector toggle with panel collapse/expand
  useEffect(() => {
    if (showInspector) {
      inspectorPanelRef.current?.expand();
    } else {
      inspectorPanelRef.current?.collapse();
    }
  }, [showInspector]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <Header />

      <Group orientation="horizontal" className="flex-1">
        {/* Pattern Library - Left Sidebar */}
        <Panel
          panelRef={libraryPanelRef}
          collapsible
          collapsedSize={0}
          defaultSize="224px"
          minSize="50px"
          maxSize="400px"
          id="library-panel"
        >
          <aside className="h-full border-r border-border bg-surface overflow-y-auto">
            <PatternLibrary />
          </aside>
        </Panel>

        <Separator className="w-1.5 bg-border hover:bg-accent-from/50 transition-colors cursor-col-resize flex flex-col items-center justify-center group">
          <div className="h-12 w-1 rounded-full bg-muted group-hover:bg-accent-from/70 transition-colors" />
        </Separator>

        {/* Main Content Area */}
        <Panel minSize="400px" id="main-content-panel">
          <main className="h-full flex flex-col overflow-hidden">
            {showBottomPanel ? (
              <Group orientation="vertical" id="editor-layout-v2">
                {/* ArrangementView - Unified scrolling for tracks and timeline */}
                <Panel defaultSize={60} minSize={10} id="main-panel-v2">
                  <ArrangementView />
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
                    <MuteEditorPanel />
                    <TransposeEditorPanel />
                  </div>
                </Panel>
              </Group>
            ) : (
              <>
                {/* Non-resizable layout when no editor is open */}
                <ArrangementView />
                {/* Hidden editors to allow their useEffects to run */}
                <div className="hidden">
                  <ChordEditorPanel />
                  <DrumEditorPanel />
                  <ArpEditorPanel />
                  <MuteEditorPanel />
                  <TransposeEditorPanel />
                </div>
              </>
            )}
          </main>
        </Panel>

        <Separator className="w-1.5 bg-border hover:bg-accent-from/50 transition-colors cursor-col-resize flex flex-col items-center justify-center group">
          <div className="h-12 w-1 rounded-full bg-muted group-hover:bg-accent-from/70 transition-colors" />
        </Separator>

        {/* Inspector - Right Sidebar */}
        <Panel
          panelRef={inspectorPanelRef}
          collapsible
          collapsedSize={0}
          defaultSize="288px"
          minSize="50px"
          maxSize="500px"
          id="inspector-panel"
        >
          <aside className="h-full border-l border-border bg-surface overflow-y-auto">
            <Inspector />
          </aside>
        </Panel>
      </Group>
    </div>
  );
}
