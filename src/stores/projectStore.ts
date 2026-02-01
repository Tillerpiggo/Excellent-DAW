import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { Project, Track, Block, TrackTypeId, InstrumentId, EventStream } from '@/core/types';
import { generateId } from '@/utils/id';
import { PATTERN_PRESETS } from '@/core/presets';

interface ProjectState {
  project: Project;

  // Track operations
  addTrack: (parentId?: string, preset?: typeof PATTERN_PRESETS[0]) => string;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  deleteTrack: (trackId: string) => void;
  moveTrack: (trackId: string, newParentId?: string, index?: number) => void;
  reorderTrack: (trackId: string, direction: 'up' | 'down') => void;

  // Block operations
  addBlock: (trackId: string, block: Omit<Block, 'id'>) => string;
  updateBlock: (trackId: string, blockId: string, updates: Partial<Block>) => void;
  deleteBlock: (trackId: string, blockId: string) => void;
  moveBlock: (sourceTrackId: string, blockId: string, targetTrackId: string) => void;

  // Project operations
  setBpm: (bpm: number) => void;
  setTotalBars: (bars: number) => void;
  resetProject: () => void;
  loadProject: (project: Project) => void;
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
  immer((set, get) => ({
    project: createDefaultProject(),

    addTrack: (parentId?: string, preset?: typeof PATTERN_PRESETS[0]) => {
      const track = createDefaultTrack(parentId, preset);

      set((state) => {
        state.project.tracks[track.id] = track;

        if (parentId && state.project.tracks[parentId]) {
          state.project.tracks[parentId].childIds.push(track.id);
        } else {
          state.project.rootTracks.push(track.id);
        }
      });

      return track.id;
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

    setBpm: (bpm: number) => {
      set((state) => {
        state.project.bpm = Math.max(20, Math.min(300, bpm));
      });
    },

    setTotalBars: (bars: number) => {
      set((state) => {
        state.project.totalBars = Math.max(1, Math.min(64, bars));
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
  }))
);

// Helper to add a track from a preset
export function addTrackFromPreset(presetId: string, parentId?: string): string | null {
  const preset = PATTERN_PRESETS.find(p => p.id === presetId);
  if (!preset) return null;

  return useProjectStore.getState().addTrack(parentId, preset);
}
