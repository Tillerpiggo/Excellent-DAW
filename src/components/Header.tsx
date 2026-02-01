'use client';

import { useState, useEffect } from 'react';
import { usePlayback } from '@/hooks/usePlayback';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { ProjectSelector } from './ProjectSelector/ProjectSelector';
import { ProjectManagerModal } from './ProjectSelector/ProjectManagerModal';

export function Header() {
  const { isPlaying, toggle, setBpm } = usePlayback();
  const project = useProjectStore((state) => state.project);
  const { setTotalBars } = useProjectStore();
  const { currentBeat, toggleLibrary, toggleInspector, showLibrary, showInspector } = useUIStore();

  // Local state for inputs to allow free typing without immediate clamping
  const [bpmInput, setBpmInput] = useState(String(project.bpm));
  const [barsInput, setBarsInput] = useState(String(project.totalBars));

  // Sync local state when project values change externally
  useEffect(() => {
    setBpmInput(String(project.bpm));
  }, [project.bpm]);

  useEffect(() => {
    setBarsInput(String(project.totalBars));
  }, [project.totalBars]);

  const currentBar = Math.floor(currentBeat / project.beatsPerBar) + 1;
  const beatInBar = (currentBeat % project.beatsPerBar) + 1;

  return (
    <header className="h-14 flex items-center justify-between px-4 bg-surface border-b border-border">
      {/* Left Section - Project Selector & Controls */}
      <div className="flex items-center gap-4">
        <ProjectSelector />

        <button
          onClick={() => toggleLibrary()}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            showLibrary
              ? 'bg-gradient-to-r from-accent-from/20 to-accent-to/20 text-accent-from'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
        >
          Library
        </button>
      </div>

      {/* Center Section - Transport */}
      <div className="flex items-center gap-6">
        {/* Play/Stop Button */}
        <button
          onClick={toggle}
          className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all transform hover:scale-105 active:scale-95 ${
            isPlaying
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-gradient-to-r from-accent-from to-accent-to hover:opacity-90 text-white'
          }`}
          aria-label={isPlaying ? 'Stop' : 'Play'}
        >
          {isPlaying ? '■' : '▶'}
        </button>

        {/* Position Display */}
        <div className="bg-background rounded-lg px-4 py-2 font-mono text-lg min-w-[100px] text-center">
          <span className="text-foreground">{currentBar}</span>
          <span className="text-muted-foreground">.</span>
          <span className="text-muted-foreground">{beatInBar}</span>
        </div>

        {/* BPM Control */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">BPM</label>
          <input
            type="text"
            inputMode="numeric"
            value={bpmInput}
            onChange={(e) => setBpmInput(e.target.value)}
            onBlur={() => {
              const val = parseInt(bpmInput);
              if (isNaN(val) || val < 20) {
                setBpm(20);
                setBpmInput('20');
              } else if (val > 300) {
                setBpm(300);
                setBpmInput('300');
              } else {
                setBpm(val);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            className="w-16 px-2 py-1 rounded-lg bg-background border border-border text-center text-foreground focus:outline-none focus:ring-2 focus:ring-accent-from"
          />
          <input
            type="range"
            value={project.bpm}
            onChange={(e) => setBpm(parseInt(e.target.value))}
            className="w-24"
            min={20}
            max={300}
          />
        </div>

        {/* Bars Control */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Bars</label>
          <input
            type="text"
            inputMode="numeric"
            value={barsInput}
            onChange={(e) => setBarsInput(e.target.value)}
            onBlur={() => {
              const val = parseInt(barsInput);
              if (isNaN(val) || val < 1) {
                setTotalBars(1);
                setBarsInput('1');
              } else if (val > 64) {
                setTotalBars(64);
                setBarsInput('64');
              } else {
                setTotalBars(val);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            className="w-14 px-2 py-1 rounded-lg bg-background border border-border text-center text-foreground focus:outline-none focus:ring-2 focus:ring-accent-from"
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => toggleInspector()}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            showInspector
              ? 'bg-gradient-to-r from-accent-from/20 to-accent-to/20 text-accent-from'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
        >
          Inspector
        </button>
      </div>

      {/* Project Manager Modal */}
      <ProjectManagerModal />
    </header>
  );
}
