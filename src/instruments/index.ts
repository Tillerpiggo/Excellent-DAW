// Unified Instrument Registry

import { Instrument, InstrumentFolder } from './types';

// Audio instruments
import { LeadSynth } from './synths/LeadSynth';
import { Keys } from './synths/Keys';
import { Pad } from './synths/Pad';
import { Bass } from './synths/Bass';
import { Guitar } from './synths/Guitar';
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
import { CameraControl } from './visual/CameraControl';
import { ColorPaletteInstrument } from './visual/ColorPalette';
import { WindowsXP } from './visual/WindowsXP';
import { FolderFlight } from './visual/FolderFlight';
import { DiamondLattice } from './visual/DiamondLattice';
import { EmojiDisplay } from './visual/EmojiDisplay';
import { SquareInstrument } from './visual/SquareInstrument';
import { BeatParticleKit } from './visual/BeatParticleKit';
import { ParticleStreams } from './visual/ParticleStreams';
import { ParticleBassRing } from './visual/ParticleBassRing';
import { ParticleRiser } from './visual/ParticleRiser';

// Mask instruments
import { SplitMask } from './masks/SplitMask';
import { SlantedBarsMask } from './masks/SlantedBarsMask';
import { CircleWipeMask } from './masks/CircleWipeMask';
import { RadialMask } from './masks/RadialMask';
import { GradientMask } from './masks/GradientMask';
import { StripMask } from './masks/StripMask';
import { SceneRouter } from './utility/SceneRouter';
import { SceneCopy } from './utility/SceneCopy';
import { SceneGate } from './utility/SceneGate';
import { MasterChannel } from './utility/MasterChannel';

// Flat registry for quick lookup by ID
export const INSTRUMENTS: Record<string, Instrument> = {
  // Audio
  leadSynth: LeadSynth,
  keys: Keys,
  pad: Pad,
  bass: Bass,
  guitar: Guitar,
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
  cameraControl: CameraControl,
  colorPalette: ColorPaletteInstrument,
  windowsXP: WindowsXP,
  folderFlight: FolderFlight,
  diamondLattice: DiamondLattice,
  emojiDisplay: EmojiDisplay,
  squareInstrument: SquareInstrument,
  beatParticleKit: BeatParticleKit,
  particleStreams: ParticleStreams,
  particleBassRing: ParticleBassRing,
  particleRiser: ParticleRiser,
  // Masks
  splitMask: SplitMask,
  slantedBarsMask: SlantedBarsMask,
  circleWipeMask: CircleWipeMask,
  radialMask: RadialMask,
  gradientMask: GradientMask,
  stripMask: StripMask,
  sceneRouter: SceneRouter,
  sceneCopy: SceneCopy,
  sceneGate: SceneGate,
  masterChannel: MasterChannel,
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

// Mask instrument IDs
const MASK_INSTRUMENT_IDS = new Set(['splitMask', 'slantedBarsMask', 'circleWipeMask', 'radialMask', 'gradientMask', 'stripMask']);

// Check if an instrument ID is a mask
export function isMaskInstrument(id: string | undefined): boolean {
  return id ? MASK_INSTRUMENT_IDS.has(id) : false;
}

// Get all mask instruments
export function getMaskInstruments(): Instrument[] {
  return Array.from(MASK_INSTRUMENT_IDS).map(id => INSTRUMENTS[id]).filter(Boolean);
}

// Folder structure for Library UI (separate from instrument identity)
export function getInstrumentFolderTree(): InstrumentFolder {
  return {
    name: 'Instruments',
    instruments: [],
    subfolders: [
      {
        name: 'Synths',
        instruments: ['leadSynth', 'keys', 'pad', 'bass', 'guitar'],
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
        instruments: ['silkSymmetry', 'hexagonDots', 'fractalTunnel', 'circleGrid', 'neonPolar', 'hopfFibration', 'icosahedronBurst', 'metronomeBalls', 'dotField', 'stars', 'textDisplay', 'sun', 'imageDisplay', 'videoSampler', 'videoKaleidoscope', 'shapeFlight', 'cylinderFlight', 'particleBurst', 'cameraControl', 'windowsXP', 'folderFlight', 'diamondLattice', 'emojiDisplay', 'squareInstrument', 'beatParticleKit', 'particleStreams', 'particleBassRing', 'particleRiser'],
      },
      {
        name: 'Masks',
        instruments: ['splitMask', 'slantedBarsMask', 'circleWipeMask', 'radialMask', 'gradientMask', 'stripMask'],
      },
      {
        name: 'Utility',
        instruments: ['colorPalette', 'sceneRouter', 'sceneCopy', 'sceneGate', 'masterChannel'],
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
