import { create } from 'zustand';
import { PatternPreset } from '@/core/types';
import { DropPosition } from '@/utils/trackDragValidation';

interface DragState {
  type: 'preset' | 'block' | null;
  preset?: PatternPreset;
  blockId?: string;
  sourceTrackId?: string;
}

interface UIState {
  // Selection
  selectedTrackId: string | null;
  selectedBlockId: string | null;

  // Drag state (for preset/block dragging)
  dragState: DragState;
  dropTargetTrackId: string | null;
  dropTargetBar: number | null;

  // Track reorder drag state
  trackDragActiveId: string | null;
  trackDropTargetId: string | null;
  trackDropPosition: DropPosition | null;

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
  scrollLeft: number;

  // Panel visibility
  showInspector: boolean;
  showLibrary: boolean;
  showChordEditor: boolean;
  showDrumEditor: boolean;

  // Drum editor state
  drumEditorQuantize: '16th' | '8th' | 'quarter';

  // Chord picker state
  chordPickerOpen: boolean;
  chordPickerTargetIndex: number | null;

  // View state
  currentView: 'home' | 'editor';

  // Actions
  selectTrack: (trackId: string | null) => void;
  selectBlock: (blockId: string | null, trackId?: string) => void;

  startDragPreset: (preset: PatternPreset) => void;
  startDragBlock: (blockId: string, sourceTrackId: string) => void;
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
  setScrollLeft: (scroll: number) => void;

  toggleInspector: () => void;
  toggleLibrary: () => void;
  setShowChordEditor: (show: boolean) => void;
  setShowDrumEditor: (show: boolean) => void;
  setDrumEditorQuantize: (quantize: '16th' | '8th' | 'quarter') => void;
  openChordPicker: (index: number) => void;
  closeChordPicker: () => void;

  // Track reorder actions
  setTrackDragState: (activeId: string, targetId: string | null, position: DropPosition | null) => void;
  clearTrackDragState: () => void;

  // View actions
  setCurrentView: (view: 'home' | 'editor') => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  // Selection
  selectedTrackId: null,
  selectedBlockId: null,

  // Drag state
  dragState: { type: null },
  dropTargetTrackId: null,
  dropTargetBar: null,

  // Track reorder drag state
  trackDragActiveId: null,
  trackDropTargetId: null,
  trackDropPosition: null,

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
  scrollLeft: 0,

  // Panel visibility
  showInspector: true,
  showLibrary: true,
  showChordEditor: false,
  showDrumEditor: false,

  // Drum editor state
  drumEditorQuantize: '16th',

  // Chord picker state
  chordPickerOpen: false,
  chordPickerTargetIndex: null,

  // View state
  currentView: 'home',

  selectTrack: (trackId) => {
    set({ selectedTrackId: trackId, selectedBlockId: null });
  },

  selectBlock: (blockId, trackId) => {
    set({
      selectedBlockId: blockId,
      selectedTrackId: trackId || get().selectedTrackId,
    });
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
    set({ pixelsPerBeat: Math.max(10, Math.min(100, pixels)) });
  },

  setScrollLeft: (scroll) => {
    set({ scrollLeft: Math.max(0, scroll) });
  },

  toggleInspector: () => {
    set((state) => ({ showInspector: !state.showInspector }));
  },

  toggleLibrary: () => {
    set((state) => ({ showLibrary: !state.showLibrary }));
  },

  setShowChordEditor: (show) => {
    set({ showChordEditor: show });
  },

  setShowDrumEditor: (show) => {
    set({ showDrumEditor: show });
  },

  setDrumEditorQuantize: (quantize) => {
    set({ drumEditorQuantize: quantize });
  },

  openChordPicker: (index) => {
    set({ chordPickerOpen: true, chordPickerTargetIndex: index });
  },

  closeChordPicker: () => {
    set({ chordPickerOpen: false, chordPickerTargetIndex: null });
  },

  setTrackDragState: (activeId, targetId, position) => {
    set({
      trackDragActiveId: activeId,
      trackDropTargetId: targetId,
      trackDropPosition: position,
    });
  },

  clearTrackDragState: () => {
    set({
      trackDragActiveId: null,
      trackDropTargetId: null,
      trackDropPosition: null,
    });
  },

  setCurrentView: (view) => {
    set({ currentView: view });
  },
}));
