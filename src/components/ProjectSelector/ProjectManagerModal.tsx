'use client';

import { useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { ProjectMetadata } from '@/core/types';

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ProjectRowProps {
  metadata: ProjectMetadata;
  isCurrent: boolean;
  onSwitch: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function ProjectRow({ metadata, isCurrent, onSwitch, onRename, onDelete }: ProjectRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(metadata.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSaveName = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== metadata.name) {
      onRename(trimmed);
    } else {
      setEditName(metadata.name);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      setEditName(metadata.name);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        isCurrent
          ? 'border-accent-from/50 bg-accent-from/5'
          : 'border-border hover:border-muted-foreground/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={handleKeyDown}
              autoFocus
              className="w-full px-2 py-1 bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-accent-from"
            />
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="font-medium text-foreground hover:text-accent-from transition-colors truncate block w-full text-left"
              title="Click to rename"
            >
              {metadata.name}
              {isCurrent && (
                <span className="ml-2 text-xs text-accent-from">(current)</span>
              )}
            </button>
          )}
          <div className="text-sm text-muted-foreground mt-1">
            {metadata.bpm} BPM · {metadata.totalBars} bars · {metadata.trackCount} tracks
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Last modified: {formatDate(metadata.updatedAt)}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isCurrent && (
            <button
              onClick={onSwitch}
              className="px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded transition-colors"
            >
              Open
            </button>
          )}
          {showDeleteConfirm ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  onDelete();
                  setShowDeleteConfirm(false);
                }}
                className="px-2 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2 py-1 text-sm bg-muted hover:bg-muted/80 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
              title="Delete project"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProjectManagerModal() {
  const { showProjectManager, toggleProjectManager } = useUIStore();
  const project = useProjectStore((state) => state.project);
  const projectList = useProjectStore((state) => state.projectList);
  const { createNewProject, switchProject, deleteProjectById, renameProject } = useProjectStore();

  if (!showProjectManager) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      toggleProjectManager();
    }
  };

  const handleNewProject = () => {
    createNewProject();
  };

  // Sort by updatedAt descending
  const sortedProjects = [...projectList].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Manage Projects</h2>
          <button
            onClick={toggleProjectManager}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col gap-3">
            {sortedProjects.map((p) => (
              <ProjectRow
                key={p.id}
                metadata={p}
                isCurrent={p.id === project.id}
                onSwitch={() => switchProject(p.id)}
                onRename={(name) => renameProject(p.id, name)}
                onDelete={() => deleteProjectById(p.id)}
              />
            ))}
            {sortedProjects.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No projects yet. Create your first project!
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <div className="text-sm text-muted-foreground">
            {sortedProjects.length} project{sortedProjects.length !== 1 ? 's' : ''}
          </div>
          <button
            onClick={handleNewProject}
            className="px-4 py-2 bg-gradient-to-r from-accent-from to-accent-to text-white rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
        </div>
      </div>
    </div>
  );
}
