import { create } from 'zustand';
import { Preset } from '@/core/types';

interface DragState {
  type: 'preset' | 'block' | 'instrument' | null;
  preset?: Preset;
  blockId?: string;
  sourceTrackId?: string;
  instrumentId?: string;
}

interface MarqueeSelection {
  isActive: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface UIState {
  // Selection
  selectedTrackId: string | null;
  selectedBlockIds: Set<string>;
  marqueeSelection: MarqueeSelection | null;

  // Drag state (for preset/block dragging)
  dragState: DragState;
  dropTargetTrackId: string | null;
  dropTargetBar: number | null;

  // Playback
  isPlaying: boolean;
  currentBeat: number;

  // Loop region
  loopStart: number | null;
  loopEnd: number | null;
  loopEnabled: boolean;
  isScrubbing: boolean;

  // View
  collapsedTrackIds: Set<string>;
  pixelsPerBeat: number;
  trackHeightScale: number;
  scrollLeft: number;
  scrollTop: number;

  // Timeline quantization (in beats)
  timelineQuantize: number;

  // Panel visibility
  showInspector: boolean;
  showLibrary: boolean;

  // Chord picker state
  chordPickerOpen: boolean;
  chordPickerTargetIndex: number | null;

  // View state
  currentView: 'home' | 'editor';

  // Actions
  selectTrack: (trackId: string | null) => void;
  selectBlock: (blockId: string | null, trackId?: string, addToSelection?: boolean) => void;
  selectBlocks: (blockIds: string[]) => void;
  clearBlockSelection: () => void;
  startMarqueeSelection: (x: number, y: number) => void;
  updateMarqueeSelection: (x: number, y: number) => void;
  endMarqueeSelection: () => void;

  startDragPreset: (preset: Preset) => void;
  startDragBlock: (blockId: string, sourceTrackId: string) => void;
  startDragInstrument: (instrumentId: string) => void;
  setDropTarget: (trackId: string | null, bar?: number | null) => void;
  endDrag: () => void;

  setPlaying: (playing: boolean) => void;
  setCurrentBeat: (beat: number) => void;

  // Loop region actions
  setLoopRegion: (start: number | null, end: number | null) => void;
  setLoopEnabled: (enabled: boolean) => void;
  clearLoop: () => void;
  setIsScrubbing: (scrubbing: boolean) => void;

  toggleTrackCollapsed: (trackId: string) => void;
  setPixelsPerBeat: (pixels: number) => void;
  setTrackHeightScale: (scale: number) => void;
  setScrollLeft: (scroll: number) => void;
  setScrollTop: (scroll: number) => void;
  setTimelineQuantize: (beats: number) => void;

  toggleInspector: () => void;
  toggleLibrary: () => void;
  openChordPicker: (index: number) => void;
  closeChordPicker: () => void;

  // View actions
  setCurrentView: (view: 'home' | 'editor') => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Selection
  selectedTrackId: null,
  selectedBlockIds: new Set(),
  marqueeSelection: null,

  // Drag state
  dragState: { type: null },
  dropTargetTrackId: null,
  dropTargetBar: null,

  // Playback
  isPlaying: false,
  currentBeat: 0,

  // Loop region
  loopStart: null,
  loopEnd: null,
  loopEnabled: false,
  isScrubbing: false,

  // View
  collapsedTrackIds: new Set(),
  pixelsPerBeat: 30,
  trackHeightScale: 1.0,
  scrollLeft: 0,
  scrollTop: 0,

  // Timeline quantization (default: 4 beats = 1 bar)
  timelineQuantize: 4,

  // Panel visibility
  showInspector: true,
  showLibrary: true,

  // Chord picker state
  chordPickerOpen: false,
  chordPickerTargetIndex: null,

  // View state
  currentView: 'home',

  selectTrack: (trackId) => {
    set({ selectedTrackId: trackId, selectedBlockIds: new Set() });
  },

  selectBlock: (blockId, trackId, addToSelection = false) => {
    set((state) => {
      if (blockId === null) {
        return { selectedBlockIds: new Set(), selectedTrackId: trackId || state.selectedTrackId };
      }
      if (addToSelection) {
        const newSet = new Set(state.selectedBlockIds);
        if (newSet.has(blockId)) {
          newSet.delete(blockId);
        } else {
          newSet.add(blockId);
        }
        return { selectedBlockIds: newSet, selectedTrackId: trackId || state.selectedTrackId };
      }
      return { selectedBlockIds: new Set([blockId]), selectedTrackId: trackId || state.selectedTrackId };
    });
  },

  selectBlocks: (blockIds) => {
    set({ selectedBlockIds: new Set(blockIds) });
  },

  clearBlockSelection: () => {
    set({ selectedBlockIds: new Set() });
  },

  startMarqueeSelection: (x, y) => {
    set({
      marqueeSelection: {
        isActive: true,
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      },
    });
  },

  updateMarqueeSelection: (x, y) => {
    set((state) => {
      if (!state.marqueeSelection) return state;
      return {
        marqueeSelection: {
          ...state.marqueeSelection,
          currentX: x,
          currentY: y,
        },
      };
    });
  },

  endMarqueeSelection: () => {
    set({ marqueeSelection: null });
  },

  startDragPreset: (preset) => {
    set({
      dragState: { type: 'preset', preset },
    });
  },

  startDragBlock: (blockId, sourceTrackId) => {
    set({
      dragState: { type: 'block', blockId, sourceTrackId },
    });
  },

  startDragInstrument: (instrumentId) => {
    set({
      dragState: { type: 'instrument', instrumentId },
    });
  },

  setDropTarget: (trackId, bar) => {
    set({
      dropTargetTrackId: trackId,
      dropTargetBar: bar ?? null,
    });
  },

  endDrag: () => {
    set({
      dragState: { type: null },
      dropTargetTrackId: null,
      dropTargetBar: null,
    });
  },

  setPlaying: (playing) => {
    set({ isPlaying: playing });
  },

  setCurrentBeat: (beat) => {
    set({ currentBeat: beat });
  },

  setLoopRegion: (start, end) => {
    set({ loopStart: start, loopEnd: end });
  },

  setLoopEnabled: (enabled) => {
    set({ loopEnabled: enabled });
  },

  clearLoop: () => {
    set({ loopStart: null, loopEnd: null, loopEnabled: false });
  },

  setIsScrubbing: (scrubbing) => {
    set({ isScrubbing: scrubbing });
  },

  toggleTrackCollapsed: (trackId) => {
    set((state) => {
      const newCollapsed = new Set(state.collapsedTrackIds);
      if (newCollapsed.has(trackId)) {
        newCollapsed.delete(trackId);
      } else {
        newCollapsed.add(trackId);
      }
      return { collapsedTrackIds: newCollapsed };
    });
  },

  setPixelsPerBeat: (pixels) => {
    set({ pixelsPerBeat: Math.max(2, Math.min(100, pixels)) });
  },

  setTrackHeightScale: (scale) => {
    set({ trackHeightScale: Math.max(0.5, Math.min(2.0, scale)) });
  },

  setScrollLeft: (scroll) => {
    set({ scrollLeft: Math.max(0, scroll) });
  },

  setScrollTop: (scroll) => {
    set({ scrollTop: Math.max(0, scroll) });
  },

  setTimelineQuantize: (beats) => {
    set({ timelineQuantize: beats });
  },

  toggleInspector: () => {
    set((state) => ({ showInspector: !state.showInspector }));
  },

  toggleLibrary: () => {
    set((state) => ({ showLibrary: !state.showLibrary }));
  },

  openChordPicker: (index) => {
    set({ chordPickerOpen: true, chordPickerTargetIndex: index });
  },

  closeChordPicker: () => {
    set({ chordPickerOpen: false, chordPickerTargetIndex: null });
  },

  setCurrentView: (view) => {
    set({ currentView: view });
  },
}));
