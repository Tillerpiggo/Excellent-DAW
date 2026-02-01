import { useProjectStore } from './projectStore';
import * as storage from '@/services/storage';
import { debounce } from '@/utils/debounce';

let initialized = false;
let unsubscribe: (() => void) | null = null;

const saveCurrentProject = debounce(() => {
  const { project, projectList } = useProjectStore.getState();

  // Save the full project
  storage.saveProject(project);

  // Update metadata in the list
  const existingIndex = projectList.findIndex((p) => p.id === project.id);
  if (existingIndex >= 0) {
    const updatedList = [...projectList];
    updatedList[existingIndex] = storage.updateMetadataFromProject(
      updatedList[existingIndex],
      project
    );
    storage.saveProjectList(updatedList);
    useProjectStore.setState({ projectList: updatedList });
  }
}, 1000);

export function initializePersistence(): void {
  if (initialized) return;
  initialized = true;

  // Migrate storage if needed
  storage.migrateStorageIfNeeded();

  // Load project list
  const projectList = storage.getProjectList();
  useProjectStore.setState({ projectList });

  // Try to load the last opened project
  const currentId = storage.getCurrentProjectId();
  let loaded = false;

  if (currentId) {
    const project = storage.getProject(currentId);
    if (project) {
      useProjectStore.getState().loadProject(project);
      loaded = true;
    }
  }

  // If no project loaded, try first in list or create new
  if (!loaded) {
    if (projectList.length > 0) {
      const project = storage.getProject(projectList[0].id);
      if (project) {
        useProjectStore.getState().loadProject(project);
        storage.setCurrentProjectId(project.id);
        loaded = true;
      }
    }

    if (!loaded) {
      // Create a new project and add to list
      const { project } = useProjectStore.getState();
      const metadata = storage.projectToMetadata(project);
      const newList = [metadata];

      storage.saveProject(project);
      storage.saveProjectList(newList);
      storage.setCurrentProjectId(project.id);
      useProjectStore.setState({ projectList: newList });
    }
  }

  // Subscribe to store changes for auto-save
  unsubscribe = useProjectStore.subscribe((state, prevState) => {
    // Only save if project actually changed (not just projectList)
    if (state.project !== prevState.project) {
      saveCurrentProject();
    }
  });
}

export function cleanupPersistence(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  initialized = false;
}
