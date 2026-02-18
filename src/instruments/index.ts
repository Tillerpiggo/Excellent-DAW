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
import { HopfFibration } from './visual/HopfFibration';
import { IcosahedronBurst } from './visual/IcosahedronBurst';
import { MetronomeBalls } from './visual/MetronomeBalls';
import { DotField } from './visual/DotField';
import { Stars } from './visual/Stars';
import { TextDisplay } from './visual/TextDisplay';
import { Sun } from './visual/Sun';
import { ImageDisplay } from './visual/ImageDisplay';
import { VideoSampler } from './visual/VideoSampler';
import { VideoKaleidoscope } from './visual/VideoKaleidoscope';
import { ShapeFlight } from './visual/ShapeFlight';
import { CylinderFlight } from './visual/CylinderFlight';
import { ParticleBurst } from './visual/ParticleBurst';

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
  hopfFibration: HopfFibration,
  icosahedronBurst: IcosahedronBurst,
  metronomeBalls: MetronomeBalls,
  dotField: DotField,
  stars: Stars,
  textDisplay: TextDisplay,
  sun: Sun,
  imageDisplay: ImageDisplay,
  videoSampler: VideoSampler,
  videoKaleidoscope: VideoKaleidoscope,
  shapeFlight: ShapeFlight,
  cylinderFlight: CylinderFlight,
  particleBurst: ParticleBurst,
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
        instruments: ['silkSymmetry', 'hexagonDots', 'fractalTunnel', 'circleGrid', 'neonPolar', 'hopfFibration', 'icosahedronBurst', 'metronomeBalls', 'dotField', 'stars', 'textDisplay', 'sun', 'imageDisplay', 'videoSampler', 'videoKaleidoscope', 'shapeFlight', 'cylinderFlight', 'particleBurst'],
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

// Walk up the parent chain to find the nearest ancestor with an instrumentId (for MIDI config inheritance)
import { Track } from '@/core/types';

export function getInheritedMidiInstrumentId(
  track: Track,
  tracks: Record<string, Track>
): string | undefined {
  if (track.instrumentId) return track.instrumentId;

  let current = track.parentId ? tracks[track.parentId] : undefined;
  while (current) {
    if (current.instrumentId) return current.instrumentId;
    current = current.parentId ? tracks[current.parentId] : undefined;
  }
  return undefined;
}

// Re-export types
export * from './types';
