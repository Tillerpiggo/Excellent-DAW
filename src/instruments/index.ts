// Unified Instrument Registry

import { Instrument, InstrumentFolder } from './types';

// Audio instruments
import { LeadSynth } from './synths/LeadSynth';
import { Keys } from './synths/Keys';
import { Pad } from './synths/Pad';
import { Bass } from './synths/Bass';
import { DrumKit } from './drums/DrumKit';
import { AudioPlayer } from './audio/AudioPlayer';

// Visual instruments
import { SilkSymmetry } from './visual/SilkSymmetry';
import { HexagonDots } from './visual/HexagonDots';
import { FractalTunnel } from './visual/FractalTunnel';
import { CircleGrid } from './visual/CircleGrid';
import { NeonPolar } from './visual/NeonPolar';

// Flat registry for quick lookup by ID
export const INSTRUMENTS: Record<string, Instrument> = {
  // Audio
  leadSynth: LeadSynth,
  keys: Keys,
  pad: Pad,
  bass: Bass,
  drumKit: DrumKit,
  audioPlayer: AudioPlayer,
  // Visual
  silkSymmetry: SilkSymmetry,
  hexagonDots: HexagonDots,
  fractalTunnel: FractalTunnel,
  circleGrid: CircleGrid,
  neonPolar: NeonPolar,
};

// Get instrument by ID
export function getInstrument(id: string | undefined): Instrument | undefined {
  if (!id) return undefined;
  return INSTRUMENTS[id];
}

// Get all instruments
export function getAllInstruments(): Instrument[] {
  return Object.values(INSTRUMENTS);
}

// Get audio instruments only
export function getAudioInstruments(): Instrument[] {
  return Object.values(INSTRUMENTS).filter(i => i.hasAudio);
}

// Get visual instruments only
export function getVisualInstruments(): Instrument[] {
  return Object.values(INSTRUMENTS).filter(i => i.hasVisual);
}

// Folder structure for Library UI (separate from instrument identity)
export function getInstrumentFolderTree(): InstrumentFolder {
  return {
    name: 'Instruments',
    instruments: [],
    subfolders: [
      {
        name: 'Synths',
        instruments: ['leadSynth', 'keys', 'pad', 'bass'],
      },
      {
        name: 'Drums',
        instruments: ['drumKit'],
      },
      {
        name: 'Audio',
        instruments: ['audioPlayer'],
      },
      {
        name: 'Visual',
        instruments: ['silkSymmetry', 'hexagonDots', 'fractalTunnel', 'circleGrid', 'neonPolar'],
      },
    ],
  };
}

// Get instrument options for dropdowns
export function getInstrumentOptions(): { id: string; label: string; icon?: string }[] {
  return Object.values(INSTRUMENTS).map(inst => ({
    id: inst.id,
    label: inst.icon ? `${inst.icon} ${inst.name}` : inst.name,
    icon: inst.icon,
  }));
}

// Re-export types
export * from './types';
