import { create } from 'zustand';
import { Project, Track, Block, ProjectMetadata, Event } from '@/core/types';
import { generateId } from '@/utils/id';
import { PATTERN_PRESETS } from '@/core/presets';
import { ChordData, chordsToEvents } from '@/core/harmony';
import * as storage from '@/services/storage';
import { useUIStore } from './uiStore';
import { historyMiddleware, useHistoryStore } from './history';

interface ProjectState {
  project: Project;
  projectList: ProjectMetadata[];

  // Track operations
  addTrack: (parentId?: string, preset?: typeof PATTERN_PRESETS[0]) => string;
  addAudioTrack: (name: string) => string;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  deleteTrack: (trackId: string) => void;
  moveTrack: (trackId: string, newParentId?: string, index?: number) => void;
  reorderTrack: (trackId: string, direction: 'up' | 'down') => void;

  // Block operations
  addBlock: (trackId: string, block: Omit<Block, 'id'>) => string;
  updateBlock: (trackId: string, blockId: string, updates: Partial<Block>) => void;
  deleteBlock: (trackId: string, blockId: string) => void;
  moveBlock: (sourceTrackId: string, blockId: string, targetTrackId: string) => void;
  splitBlockAtPosition: (trackId: string, blockId: string, splitBar: number, beatsPerBar: number) => string | null;
  updateBlockChords: (trackId: string, blockId: string, chords: ChordData[]) => void;
  updateBlockDrums: (trackId: string, blockId: string, events: Event[]) => void;

  // Project operations
  setBpm: (bpm: number) => void;
  setTotalBars: (bars: number) => void;
  resetProject: () => void;
  loadProject: (project: Project) => void;

  // Multi-project operations
  createNewProject: () => string;
  switchProject: (id: string) => void;
  deleteProjectById: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  refreshProjectList: () => void;
}

function createDefaultProject(): Project {
  return {
    id: generateId(),
    name: 'New Project',
    bpm: 120,
    totalBars: 8,
    beatsPerBar: 4,
    rootTracks: [],
    tracks: {},
  };
}

function createDefaultTrack(
  parentId?: string,
  preset?: typeof PATTERN_PRESETS[0]
): Track {
  const track: Track = {
    id: generateId(),
    name: preset?.name || 'New Track',
    typeId: preset?.defaultTrackType || 'base',
    instrumentId: preset?.defaultInstrument,
    muted: false,
    collapsed: false,
    blocks: [],
    childIds: [],
    parentId,
    patternCategory: preset?.category,
  };

  // Add a block from preset if provided
  if (preset) {
    track.blocks.push({
      id: generateId(),
      startBar: 0,
      durationBars: preset.durationBars,
      loop: true,
      streams: [{ events: [...preset.events] }],
    });
  }

  return track;
}

export const useProjectStore = create<ProjectState>()(
  historyMiddleware((set, get) => ({
    project: createDefaultProject(),
    projectList: [],

    addTrack: (parentId?: string, preset?: typeof PATTERN_PRESETS[0]) => {
      const track = createDefaultTrack(parentId, preset);

      set((state) => {
        // Auto-set harmonyMap for arps added as children of tracks with pitched content
        if (preset?.category === 'arp' && parentId) {
          const parent = state.project.tracks[parentId];
          if (parent) {
            // Check if parent has any pitched events (not just drums)
            const hasPitchedContent = parent.blocks.some(block =>
              block.streams?.some(stream =>
                stream.events.some(e => e.pitch !== undefined)
              )
            );
            if (hasPitchedContent) {
              track.typeId = 'harmonyMap';
            }
          }
        }

        state.project.tracks[track.id] = track;

        if (parentId && state.project.tracks[parentId]) {
          state.project.tracks[parentId].childIds.push(track.id);
        } else {
          state.project.rootTracks.push(track.id);
        }
      });

      return track.id;
    },

    addAudioTrack: (name: string) => {
      const trackId = generateId();

      set((state) => {
        const track: Track = {
          id: trackId,
          name: name || 'Audio Track',
          typeId: 'base',
          instrumentId: 'audio',
          muted: false,
          collapsed: false,
          blocks: [],
          childIds: [],
        };

        state.project.tracks[trackId] = track;
        state.project.rootTracks.push(trackId);
      });

      return trackId;
    },

    updateTrack: (trackId: string, updates: Partial<Track>) => {
      set((state) => {
        const track = state.project.tracks[trackId];
        if (track) {
          Object.assign(track, updates);
        }
      });
    },

    deleteTrack: (trackId: string) => {
      set((state) => {
        const track = state.project.tracks[trackId];
        if (!track) return;

        // Recursively delete children
        const deleteRecursive = (id: string) => {
          const t = state.project.tracks[id];
          if (!t) return;

          for (const childId of t.childIds) {
            deleteRecursive(childId);
          }

          delete state.project.tracks[id];
        };

        // Remove from parent's childIds or rootTracks
        if (track.parentId) {
          const parent = state.project.tracks[track.parentId];
          if (parent) {
            parent.childIds = parent.childIds.filter(id => id !== trackId);
          }
        } else {
          state.project.rootTracks = state.project.rootTracks.filter(id => id !== trackId);
        }

        deleteRecursive(trackId);
      });
    },

    moveTrack: (trackId: string, newParentId?: string, index?: number) => {
      set((state) => {
        const track = state.project.tracks[trackId];
        if (!track) return;

        // Remove from current parent
        if (track.parentId) {
          const oldParent = state.project.tracks[track.parentId];
          if (oldParent) {
            oldParent.childIds = oldParent.childIds.filter(id => id !== trackId);
          }
        } else {
          state.project.rootTracks = state.project.rootTracks.filter(id => id !== trackId);
        }

        // Add to new parent
        track.parentId = newParentId;

        if (newParentId) {
          const newParent = state.project.tracks[newParentId];
          if (newParent) {
            if (index !== undefined) {
              newParent.childIds.splice(index, 0, trackId);
            } else {
              newParent.childIds.push(trackId);
            }
          }
        } else {
          if (index !== undefined) {
            state.project.rootTracks.splice(index, 0, trackId);
          } else {
            state.project.rootTracks.push(trackId);
          }
        }
      });
    },

    reorderTrack: (trackId: string, direction: 'up' | 'down') => {
      set((state) => {
        const track = state.project.tracks[trackId];
        if (!track) return;

        const list = track.parentId
          ? state.project.tracks[track.parentId]?.childIds
          : state.project.rootTracks;

        if (!list) return;

        const index = list.indexOf(trackId);
        if (index === -1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= list.length) return;

        // Swap
        [list[index], list[newIndex]] = [list[newIndex], list[index]];
      });
    },

    addBlock: (trackId: string, blockData: Omit<Block, 'id'>) => {
      const blockId = generateId();

      set((state) => {
        const track = state.project.tracks[trackId];
        if (track) {
          track.blocks.push({ ...blockData, id: blockId });
        }
      });

      return blockId;
    },

    updateBlock: (trackId: string, blockId: string, updates: Partial<Block>) => {
      set((state) => {
        const track = state.project.tracks[trackId];
        if (!track) return;

        const block = track.blocks.find(b => b.id === blockId);
        if (block) {
          Object.assign(block, updates);
        }
      });
    },

    deleteBlock: (trackId: string, blockId: string) => {
      set((state) => {
        const track = state.project.tracks[trackId];
        if (track) {
          track.blocks = track.blocks.filter(b => b.id !== blockId);
        }
      });
    },

    moveBlock: (sourceTrackId: string, blockId: string, targetTrackId: string) => {
      set((state) => {
        const sourceTrack = state.project.tracks[sourceTrackId];
        const targetTrack = state.project.tracks[targetTrackId];
        if (!sourceTrack || !targetTrack) return;

        const blockIndex = sourceTrack.blocks.findIndex(b => b.id === blockId);
        if (blockIndex === -1) return;

        const [block] = sourceTrack.blocks.splice(blockIndex, 1);
        targetTrack.blocks.push(block);
      });
    },

    splitBlockAtPosition: (trackId: string, blockId: string, splitBar: number, beatsPerBar: number) => {
      const newBlockId = generateId();
      let success = false;

      set((state) => {
        const track = state.project.tracks[trackId];
        if (!track) return;

        const blockIndex = track.blocks.findIndex(b => b.id === blockId);
        if (blockIndex === -1) return;

        const block = track.blocks[blockIndex];
        const blockEndBar = block.startBar + block.durationBars;

        // Don't split if playhead is at or outside block boundaries
        // Use small epsilon to avoid floating point issues
        const epsilon = 0.001;
        if (splitBar <= block.startBar + epsilon || splitBar >= blockEndBar - epsilon) {
          return;
        }

        const splitBeat = (splitBar - block.startBar) * beatsPerBar;
        const firstDuration = splitBar - block.startBar;
        const secondDuration = blockEndBar - splitBar;

        // For looped blocks, we need to "bake in" the pattern
        // Calculate the pattern length in beats
        let patternBeats = block.durationBars * beatsPerBar;
        if (block.loop && block.streams[0]?.events.length > 0) {
          const maxEventEnd = Math.max(
            ...block.streams[0].events.map(e => e.startTimeInBeats + e.duration)
          );
          patternBeats = maxEventEnd;
        }

        // Expand looped events to full duration, then split
        const expandedEvents: Event[] = [];
        const totalBeats = block.durationBars * beatsPerBar;

        if (block.streams[0]?.events) {
          if (block.loop && patternBeats > 0) {
            // Expand loop iterations
            const iterations = Math.ceil(totalBeats / patternBeats);
            for (let i = 0; i < iterations; i++) {
              const offset = i * patternBeats;
              for (const event of block.streams[0].events) {
                const expandedStart = event.startTimeInBeats + offset;
                // Only include if the event starts within the block duration
                if (expandedStart < totalBeats) {
                  expandedEvents.push({
                    ...event,
                    startTimeInBeats: expandedStart,
                    // Trim duration if it extends past block end
                    duration: Math.min(event.duration, totalBeats - expandedStart),
                  });
                }
              }
            }
          } else {
            // Not looped - just copy events
            expandedEvents.push(...block.streams[0].events);
          }
        }

        // Split events: first block gets events before split point
        const firstBlockEvents: Event[] = [];
        const secondBlockEvents: Event[] = [];

        for (const event of expandedEvents) {
          const eventEnd = event.startTimeInBeats + event.duration;

          if (event.startTimeInBeats < splitBeat) {
            // Event starts before split
            if (eventEnd <= splitBeat) {
              // Event fully in first block
              firstBlockEvents.push({ ...event });
            } else {
              // Event spans split - truncate to first block
              firstBlockEvents.push({
                ...event,
                duration: splitBeat - event.startTimeInBeats,
              });
            }
          } else {
            // Event starts at or after split - goes to second block
            // Adjust timing relative to second block's start
            secondBlockEvents.push({
              ...event,
              startTimeInBeats: event.startTimeInBeats - splitBeat,
            });
          }
        }

        // Update first block
        block.durationBars = firstDuration;
        block.loop = false; // After baking in, no longer looped
        block.streams = [{ events: firstBlockEvents }];

        // Create second block
        const secondBlock: Block = {
          id: newBlockId,
          startBar: splitBar,
          durationBars: secondDuration,
          loop: false,
          streams: [{ events: secondBlockEvents }],
        };

        // Copy audio data if present (with offset adjustment would be needed for full support)
        if (block.audioData) {
          secondBlock.audioData = { ...block.audioData };
        }

        // Insert second block right after the first
        track.blocks.splice(blockIndex + 1, 0, secondBlock);
        success = true;
      });

      return success ? newBlockId : null;
    },

    updateBlockChords: (trackId: string, blockId: string, chords: ChordData[]) => {
      set((state) => {
        const track = state.project.tracks[trackId];
        if (!track) return;

        const block = track.blocks.find(b => b.id === blockId);
        if (!block) return;

        // Generate new events from the chord data
        const events = chordsToEvents(chords);

        // Update the block's streams with new events
        block.streams = [{ events }];
      });
    },

    updateBlockDrums: (trackId: string, blockId: string, events: Event[]) => {
      set((state) => {
        const track = state.project.tracks[trackId];
        if (!track) return;

        const block = track.blocks.find(b => b.id === blockId);
        if (!block) return;

        // Update the block's streams with the drum events
        block.streams = [{ events }];
      });
    },

    setBpm: (bpm: number) => {
      set((state) => {
        state.project.bpm = Math.max(20, Math.min(300, bpm));
      });
    },

    setTotalBars: (bars: number) => {
      set((state) => {
        state.project.totalBars = Math.max(1, Math.min(512, bars));
      });
    },

    resetProject: () => {
      set((state) => {
        state.project = createDefaultProject();
      });
    },

    loadProject: (project: Project) => {
      set((state) => {
        state.project = project;
      });
    },

    createNewProject: () => {
      const newProject = createDefaultProject();
      const metadata = storage.projectToMetadata(newProject);

      // Disable history during project creation
      useHistoryStore.getState().setEnabled(false);

      set((state) => {
        state.project = newProject;
        state.projectList = [metadata, ...state.projectList];
      });

      storage.saveProject(newProject);
      storage.saveProjectList(get().projectList);
      storage.setCurrentProjectId(newProject.id);

      // Re-enable and clear history
      useHistoryStore.getState().setEnabled(true);
      useHistoryStore.getState().clearHistory();

      return newProject.id;
    },

    switchProject: (id: string) => {
      const project = storage.getProject(id);
      if (!project) return;

      // Disable history during project switch
      useHistoryStore.getState().setEnabled(false);

      set((state) => {
        state.project = project;
      });

      storage.setCurrentProjectId(id);

      // Re-enable and clear history
      useHistoryStore.getState().setEnabled(true);
      useHistoryStore.getState().clearHistory();
    },

    deleteProjectById: (id: string) => {
      const currentProject = get().project;
      const currentView = useUIStore.getState().currentView;

      storage.deleteProject(id);

      set((state) => {
        state.projectList = state.projectList.filter((p) => p.id !== id);
      });

      // If we're on homepage, just stay there (don't auto-switch)
      if (currentView === 'home') {
        return;
      }

      // If we deleted the current project while in editor, switch to another or go home
      if (currentProject.id === id) {
        const remaining = get().projectList;
        if (remaining.length > 0) {
          get().switchProject(remaining[0].id);
        } else {
          useUIStore.getState().setCurrentView('home');
        }
      }
    },

    renameProject: (id: string, name: string) => {
      set((state) => {
        const metadata = state.projectList.find((p) => p.id === id);
        if (metadata) {
          metadata.name = name;
          metadata.updatedAt = Date.now();
        }
        if (state.project.id === id) {
          state.project.name = name;
        }
      });

      // Save updated metadata list
      storage.saveProjectList(get().projectList);

      // If it's the current project, save the full project too
      if (get().project.id === id) {
        storage.saveProject(get().project);
      } else {
        // Load, update, and save the other project
        const project = storage.getProject(id);
        if (project) {
          project.name = name;
          storage.saveProject(project);
        }
      }
    },

    refreshProjectList: () => {
      set((state) => {
        state.projectList = storage.getProjectList();
      });
    },
  }))
);

// Helper to add a track from a preset
export function addTrackFromPreset(presetId: string, parentId?: string): string | null {
  const preset = PATTERN_PRESETS.find(p => p.id === presetId);
  if (!preset) return null;

  return useProjectStore.getState().addTrack(parentId, preset);
}
