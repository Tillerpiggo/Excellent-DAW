import { Project, ProjectMetadata, CURRENT_SCHEMA_VERSION } from '@/core/types';

const STORAGE_KEYS = {
  PROJECT_LIST: 'pc_project_list',
  PROJECT_PREFIX: 'pc_project_',
  CURRENT_ID: 'pc_current_id',
  SCHEMA_VERSION: 'pc_schema_version',
} as const;

export function getProjectList(): ProjectMetadata[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PROJECT_LIST);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveProjectList(list: ProjectMetadata[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PROJECT_LIST, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save project list:', e);
  }
}

export function getProject(id: string): Project | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PROJECT_PREFIX + id);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function saveProject(project: Project): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.PROJECT_PREFIX + project.id,
      JSON.stringify(project)
    );
  } catch (e) {
    console.error('Failed to save project:', e);
  }
}

export function deleteProject(id: string): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.PROJECT_PREFIX + id);
    const list = getProjectList().filter((p) => p.id !== id);
    saveProjectList(list);
  } catch (e) {
    console.error('Failed to delete project:', e);
  }
}

export function getCurrentProjectId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_ID);
  } catch {
    return null;
  }
}

export function setCurrentProjectId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CURRENT_ID, id);
  } catch (e) {
    console.error('Failed to save current project ID:', e);
  }
}

export function projectToMetadata(project: Project): ProjectMetadata {
  return {
    id: project.id,
    name: project.name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bpm: project.bpm,
    totalBars: project.totalBars,
    trackCount: Object.keys(project.tracks).length,
  };
}

export function updateMetadataFromProject(
  metadata: ProjectMetadata,
  project: Project
): ProjectMetadata {
  return {
    ...metadata,
    name: project.name,
    updatedAt: Date.now(),
    bpm: project.bpm,
    totalBars: project.totalBars,
    trackCount: Object.keys(project.tracks).length,
  };
}

export function getSchemaVersion(): number {
  try {
    const version = localStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION);
    return version ? parseInt(version, 10) : 0;
  } catch {
    return 0;
  }
}

export function setSchemaVersion(version: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, version.toString());
  } catch (e) {
    console.error('Failed to save schema version:', e);
  }
}

export function migrateStorageIfNeeded(): void {
  const storedVersion = getSchemaVersion();
  if (storedVersion < CURRENT_SCHEMA_VERSION) {
    // Future migrations would go here
    setSchemaVersion(CURRENT_SCHEMA_VERSION);
  }
}
