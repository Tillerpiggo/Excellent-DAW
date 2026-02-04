import * as Tone from 'tone';
import { InstrumentDefinition, InstrumentId, Event, AudioData, getDrumType } from './types';
import { getAudioFile, createAudioBlobUrl, revokeAudioBlobUrl } from '@/services/audioStorage';

export const INSTRUMENTS: Record<InstrumentId, InstrumentDefinition> = {
  synth: {
    id: 'synth',
    name: 'Synth',
    description: 'Sawtooth lead synth',
    color: '#6366f1',
  },
  keys: {
    id: 'keys',
    name: 'Keys',
    description: 'Warm electric piano',
    color: '#14b8a6',
  },
  pad: {
    id: 'pad',
    name: 'Pad',
    description: 'Warm triangle pad',
    color: '#8b5cf6',
  },
  bass: {
    id: 'bass',
    name: 'Bass',
    description: 'Punchy mono bass',
    color: '#f59e0b',
  },
  drums: {
    id: 'drums',
    name: 'Drums',
    description: 'Drum kit with kick, snare, and hi-hat',
    color: '#ef4444',
  },
  audio: {
    id: 'audio',
    name: 'Audio',
    description: 'Audio file playback',
    color: '#22c55e',
  },
};

export type InstrumentInstances = {
  synth: Tone.PolySynth;
  synthFilter: Tone.Filter;
  keys: Tone.PolySynth;
  keysReverb: Tone.Reverb;
  pad: Tone.PolySynth;
  bass: Tone.MonoSynth;
  kick: Tone.MembraneSynth;
  snare: Tone.NoiseSynth;
  hihat: Tone.MetalSynth;
  clap: Tone.NoiseSynth;
  // Audio players for audio tracks (keyed by block ID)
  audioPlayers: Map<string, Tone.Player>;
  // Blob URLs that need to be revoked on cleanup
  audioBlobUrls: Map<string, string>;
};

export function createInstruments(): InstrumentInstances {
  // Low pass filter to soften the sawtooth edge
  const synthFilter = new Tone.Filter({
    frequency: 2500,
    type: 'lowpass',
    rolloff: -12,
  }).toDestination();

  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: {
      attack: 0.005,
      decay: 0.15,
      sustain: 0.4,
      release: 0.005,
    },
  }).connect(synthFilter);
  synth.volume.value = -6;

  // Electric piano using FM synthesis
  const keysReverb = new Tone.Reverb({
    decay: 1.5,
    wet: 0.2,
  }).toDestination();

  const keys = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3,
    modulationIndex: 1.5,
    oscillator: { type: 'sine' },
    envelope: {
      attack: 0.001,
      decay: 0.4,
      sustain: 0.3,
      release: 0.01,
    },
    modulation: { type: 'sine' },
    modulationEnvelope: {
      attack: 0.001,
      decay: 0.3,
      sustain: 0.2,
      release: 0.01,
    },
  }).connect(keysReverb);
  keys.volume.value = -8;

  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: {
      attack: 0.3,
      decay: 0.5,
      sustain: 0.8,
      release: 0.01,
    },
  }).toDestination();
  pad.volume.value = -10;

  const bass = new Tone.MonoSynth({
    oscillator: { type: 'square' },
    envelope: {
      attack: 0.01,
      decay: 0.3,
      sustain: 0.4,
      release: 0.01,
    },
    filterEnvelope: {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.5,
      release: 0.01,
      baseFrequency: 200,
      octaves: 2.5,
    },
  }).toDestination();
  bass.volume.value = -4;

  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 6,
    oscillator: { type: 'sine' },
    envelope: {
      attack: 0.001,
      decay: 0.4,
      sustain: 0.01,
      release: 0.4,
    },
  }).toDestination();
  kick.volume.value = -2;

  const snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: {
      attack: 0.001,
      decay: 0.2,
      sustain: 0,
      release: 0.1,
    },
  }).toDestination();
  snare.volume.value = -6;

  const hihat = new Tone.MetalSynth().toDestination();
  hihat.set({
    envelope: {
      attack: 0.001,
      decay: 0.1,
      release: 0.05,
    },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
  });
  hihat.volume.value = -16;

  const clap = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: {
      attack: 0.005,
      decay: 0.15,
      sustain: 0,
      release: 0.1,
    },
  }).toDestination();
  clap.volume.value = -8;

  // Audio players map (empty initially - players created on demand)
  const audioPlayers = new Map<string, Tone.Player>();
  // Blob URLs for cleanup
  const audioBlobUrls = new Map<string, string>();

  return { synth, synthFilter, keys, keysReverb, pad, bass, kick, snare, hihat, clap, audioPlayers, audioBlobUrls };
}

export function midiToFreq(midi: number): number {
  return Tone.Frequency(midi, 'midi').toFrequency();
}

export function midiToNote(midi: number): string {
  return Tone.Frequency(midi, 'midi').toNote();
}

export function scheduleEvent(
  event: Event,
  instrumentId: InstrumentId,
  instruments: InstrumentInstances,
  absoluteTime: number
): void {
  // Use the precise time directly - do NOT clamp to Tone.now()
  // The lookAhead system schedules callbacks early so we can schedule
  // audio events precisely. Clamping breaks sample-accurate timing.
  const time = absoluteTime;
  const velocity = event.velocity / 127;
  const duration = event.duration;

  if (instrumentId === 'drums') {
    // Detect drum type from MIDI pitch
    const drumType = getDrumType(event.pitch);
    switch (drumType) {
      case 'kick':
        instruments.kick.triggerAttackRelease('C1', duration, time, velocity);
        break;
      case 'snare':
        instruments.snare.triggerAttackRelease(duration, time, velocity);
        break;
      case 'hihat':
        instruments.hihat.triggerAttackRelease('C6', duration * 0.5, time, velocity * 0.6);
        break;
      case 'clap':
        instruments.clap.triggerAttackRelease(duration, time, velocity);
        break;
      default:
        // Unknown drum pitch - default to kick
        instruments.kick.triggerAttackRelease('C1', duration, time, velocity);
        break;
    }
  } else {
    const note = midiToNote(event.pitch);
    switch (instrumentId) {
      case 'synth':
        instruments.synth.triggerAttackRelease(note, duration, time, velocity);
        break;
      case 'keys':
        instruments.keys.triggerAttackRelease(note, duration, time, velocity);
        break;
      case 'pad':
        instruments.pad.triggerAttackRelease(note, duration, time, velocity);
        break;
      case 'bass':
        instruments.bass.triggerAttackRelease(note, duration, time, velocity);
        break;
    }
  }
}

// Get or create an audio player for a block
export async function getOrCreateAudioPlayer(
  blockId: string,
  audioData: AudioData,
  instruments: InstrumentInstances
): Promise<Tone.Player | null> {
  // Return existing player if available
  if (instruments.audioPlayers.has(blockId)) {
    return instruments.audioPlayers.get(blockId)!;
  }

  // Load audio from IndexedDB
  const stored = await getAudioFile(audioData.storageId);
  if (!stored) {
    console.error(`Audio file not found in storage: ${audioData.storageId}`);
    return null;
  }

  // Create blob URL for the player
  const blobUrl = createAudioBlobUrl(stored.blob);
  instruments.audioBlobUrls.set(blockId, blobUrl);

  // Create and load player
  const player = new Tone.Player(blobUrl).toDestination();
  player.volume.value = -6; // Match synth levels

  // Wait for buffer to load
  await Tone.loaded();

  instruments.audioPlayers.set(blockId, player);
  return player;
}

// Dispose a specific audio player
export function disposeAudioPlayer(blockId: string, instruments: InstrumentInstances): void {
  const player = instruments.audioPlayers.get(blockId);
  if (player) {
    player.stop();
    player.dispose();
    instruments.audioPlayers.delete(blockId);
  }

  // Revoke the blob URL
  const blobUrl = instruments.audioBlobUrls.get(blockId);
  if (blobUrl) {
    revokeAudioBlobUrl(blobUrl);
    instruments.audioBlobUrls.delete(blockId);
  }
}

// Stop all audio players without disposing (for pause/stop - allows resume/seek later)
export function stopAudioPlayers(instruments: InstrumentInstances): void {
  for (const player of instruments.audioPlayers.values()) {
    player.stop();
  }
}

// Seek all audio players to a specific position (in seconds)
export function seekAudioPlayers(instruments: InstrumentInstances, positionSeconds: number): void {
  for (const player of instruments.audioPlayers.values()) {
    // Stop first, then we can start from the new position when playback resumes
    player.stop();
    // Store the seek position - the player will start from here when triggered
    // Note: Tone.Player doesn't have a native seek, so we'll need to use offset in start()
  }
}

// Clear all audio players (dispose them completely)
export function clearAudioPlayers(instruments: InstrumentInstances): void {
  for (const player of instruments.audioPlayers.values()) {
    player.stop();
    player.dispose();
  }
  instruments.audioPlayers.clear();

  // Revoke all blob URLs
  for (const blobUrl of instruments.audioBlobUrls.values()) {
    revokeAudioBlobUrl(blobUrl);
  }
  instruments.audioBlobUrls.clear();
}

export function disposeInstruments(instruments: InstrumentInstances): void {
  instruments.synth.dispose();
  instruments.synthFilter.dispose();
  instruments.keys.dispose();
  instruments.keysReverb.dispose();
  instruments.pad.dispose();
  instruments.bass.dispose();
  instruments.kick.dispose();
  instruments.snare.dispose();
  instruments.hihat.dispose();
  instruments.clap.dispose();

  // Dispose all audio players
  clearAudioPlayers(instruments);
}
