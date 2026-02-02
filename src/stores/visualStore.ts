import { create } from 'zustand';
import { VisualInstrumentState, ActiveNote } from '@/core/visualTypes';

interface VisualState {
  // Track states indexed by trackId
  trackStates: Map<string, VisualInstrumentState>;

  // Actions
  updateTrackStates: (states: Map<string, VisualInstrumentState>) => void;
  clearStates: () => void;
}

export const useVisualStore = create<VisualState>((set) => ({
  trackStates: new Map(),

  updateTrackStates: (states) => {
    // Create a new Map with cloned states to ensure React detects the change
    const newStates = new Map<string, VisualInstrumentState>();
    for (const [trackId, state] of states) {
      newStates.set(trackId, {
        ...state,
        activeNotes: new Map(state.activeNotes),
      });
    }
    set({ trackStates: newStates });
  },

  clearStates: () => {
    set({ trackStates: new Map() });
  },
}));
