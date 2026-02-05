import { create } from 'zustand';

interface VisualState {
  // Track IDs that have active visual instruments (structural only, not per-frame state)
  activeTrackIds: string[];

  // Actions
  setActiveTrackIds: (trackIds: string[]) => void;
}

export const useVisualStore = create<VisualState>((set) => ({
  activeTrackIds: [],

  setActiveTrackIds: (trackIds) => {
    set({ activeTrackIds: trackIds });
  },
}));
