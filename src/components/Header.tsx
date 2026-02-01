'use client';

import { usePlayback } from '@/hooks/usePlayback';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';

export function Header() {
  const { isPlaying, toggle, setBpm } = usePlayback();
  const project = useProjectStore((state) => state.project);
  const { setTotalBars } = useProjectStore();
  const { currentBeat, toggleLibrary, toggleInspector, showLibrary, showInspector } = useUIStore();

  const currentBar = Math.floor(currentBeat / project.beatsPerBar) + 1;
  const beatInBar = (currentBeat % project.beatsPerBar) + 1;

  return (
    <header className="h-14 flex items-center justify-between px-4 bg-surface border-b border-border">
      {/* Left Section - Logo & Controls */}
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold text-accent">Pattern Composer</h1>

        <button
          onClick={() => toggleLibrary()}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            showLibrary
              ? 'bg-accent/20 text-accent'
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
              : 'bg-accent hover:bg-accent/90 text-white'
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
            type="number"
            value={project.bpm}
            onChange={(e) => setBpm(parseInt(e.target.value) || 120)}
            className="w-16 px-2 py-1 rounded-lg bg-background border border-border text-center text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            min={20}
            max={300}
          />
          <input
            type="range"
            value={project.bpm}
            onChange={(e) => setBpm(parseInt(e.target.value))}
            className="w-24 accent-accent"
            min={20}
            max={300}
          />
        </div>

        {/* Bars Control */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Bars</label>
          <input
            type="number"
            value={project.totalBars}
            onChange={(e) => setTotalBars(parseInt(e.target.value) || 8)}
            className="w-14 px-2 py-1 rounded-lg bg-background border border-border text-center text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            min={1}
            max={64}
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => toggleInspector()}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            showInspector
              ? 'bg-accent/20 text-accent'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
        >
          Inspector
        </button>
      </div>
    </header>
  );
}
