'use client';

import { useState, useEffect } from 'react';
import { usePlayback } from '@/hooks/usePlayback';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { UndoRedoButtons } from './UndoRedoButtons';

export function Header() {
  const { isPlaying, toggle, setBpm } = usePlayback();
  const project = useProjectStore((state) => state.project);
  const { setTotalBars, renameProject } = useProjectStore();
  const { currentBeat, toggleLibrary, toggleInspector, showLibrary, showInspector, setCurrentView } = useUIStore();

  // Local state for inputs to allow free typing without immediate clamping
  const [bpmInput, setBpmInput] = useState(String(project.bpm));
  const [barsInput, setBarsInput] = useState(String(project.totalBars));
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(project.name);

  // Sync local state when project values change externally
  useEffect(() => {
    setBpmInput(String(project.bpm));
  }, [project.bpm]);

  useEffect(() => {
    setBarsInput(String(project.totalBars));
  }, [project.totalBars]);

  useEffect(() => {
    setEditName(project.name);
  }, [project.name]);

  const currentBar = Math.floor(currentBeat / project.beatsPerBar) + 1;
  const beatInBar = Math.floor(currentBeat % project.beatsPerBar) + 1;

  const handleSaveName = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== project.name) {
      renameProject(project.id, trimmed);
    } else {
      setEditName(project.name);
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      setEditName(project.name);
      setIsEditingName(false);
    }
  };

  return (
    <header className="h-14 flex items-center justify-between px-4 bg-surface border-b border-border">
      {/* Left Section - Home Button, Project Name & Controls */}
      <div className="flex items-center gap-4">
        {/* Home Button */}
        <button
          onClick={() => setCurrentView('home')}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          title="Home"
        >
          <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>

        {/* Editable Project Name */}
        {isEditingName ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={handleNameKeyDown}
            autoFocus
            className="px-2 py-1 text-xl font-bold bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent-from"
          />
        ) : (
          <button
            onClick={() => setIsEditingName(true)}
            className="px-2 py-1 rounded-lg hover:bg-muted transition-colors"
            title="Click to rename"
          >
            <span className="text-xl font-bold bg-gradient-to-r from-accent-from to-accent-to bg-clip-text text-transparent">
              {project.name}
            </span>
          </button>
        )}

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

        <UndoRedoButtons />
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
        <div className="bg-background rounded-lg px-4 py-2 font-mono text-lg w-20 text-center">
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
    </header>
  );
}
