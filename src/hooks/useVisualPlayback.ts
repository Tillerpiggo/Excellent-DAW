import { useEffect, useRef } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { Project } from '@/core/types';

/**
 * Syncs the visual playback engine with the current project.
 * Calls resolveFromProject() whenever the project changes.
 */
export function useVisualSync() {
  const project = useProjectStore((s) => s.project);
  const prevProjectRef = useRef<Project | null>(null);

  useEffect(() => {
    // Avoid re-resolving if project reference hasn't changed
    if (project === prevProjectRef.current) return;
    prevProjectRef.current = project;

    const engine = getVisualPlaybackEngine();
    engine.resolveFromProject(project);
  }, [project]);
}
