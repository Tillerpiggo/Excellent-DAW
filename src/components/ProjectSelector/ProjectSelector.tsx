'use client';

import { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';

export function ProjectSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const project = useProjectStore((state) => state.project);
  const projectList = useProjectStore((state) => state.projectList);
  const { createNewProject, switchProject } = useProjectStore();
  const { toggleProjectManager } = useUIStore();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNewProject = () => {
    createNewProject();
    setIsOpen(false);
  };

  const handleSwitchProject = (id: string) => {
    if (id !== project.id) {
      switchProject(id);
    }
    setIsOpen(false);
  };

  const handleManageProjects = () => {
    toggleProjectManager();
    setIsOpen(false);
  };

  // Get recent projects (up to 5, excluding current)
  const recentProjects = projectList
    .filter((p) => p.id !== project.id)
    .slice(0, 5);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
      >
        <span className="text-xl font-bold bg-gradient-to-r from-accent-from to-accent-to bg-clip-text text-transparent">
          {project.name}
        </span>
        <svg
          className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-surface border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Current Project */}
          <div className="px-3 py-2 border-b border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Current Project</div>
            <div className="font-medium text-foreground truncate">{project.name}</div>
            <div className="text-xs text-muted-foreground">
              {project.bpm} BPM · {project.totalBars} bars · {Object.keys(project.tracks).length} tracks
            </div>
          </div>

          {/* Recent Projects */}
          {recentProjects.length > 0 && (
            <div className="border-b border-border">
              <div className="px-3 py-1.5 text-xs text-muted-foreground uppercase tracking-wider">
                Recent Projects
              </div>
              {recentProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSwitchProject(p.id)}
                  className="w-full px-3 py-2 text-left hover:bg-muted transition-colors"
                >
                  <div className="font-medium text-foreground truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.bpm} BPM · {p.totalBars} bars
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="p-2 flex flex-col gap-1">
            <button
              onClick={handleNewProject}
              className="w-full px-3 py-2 text-left rounded hover:bg-muted transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>New Project</span>
            </button>
            <button
              onClick={handleManageProjects}
              className="w-full px-3 py-2 text-left rounded hover:bg-muted transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span>Manage Projects</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
