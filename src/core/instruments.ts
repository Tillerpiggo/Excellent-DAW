import * as Tone from 'tone';
import { InstrumentDefinition, InstrumentId, Event } from './types';

export const INSTRUMENTS: Record<InstrumentId, InstrumentDefinition> = {
  synth: {
    id: 'synth',
    name: 'Synth',
    description: 'Sawtooth lead synth',
  },
  pad: {
    id: 'pad',
    name: 'Pad',
    description: 'Warm triangle pad',
  },
  bass: {
    id: 'bass',
    name: 'Bass',
    description: 'Punchy mono bass',
  },
  drums: {
    id: 'drums',
    name: 'Drums',
    description: 'Drum kit with kick, snare, and hi-hat',
  },
};

export type InstrumentInstances = {
  synth: Tone.PolySynth;
  pad: Tone.PolySynth;
  bass: Tone.MonoSynth;
  kick: Tone.MembraneSynth;
  snare: Tone.NoiseSynth;
  hihat: Tone.MetalSynth;
  clap: Tone.NoiseSynth;
};

export function createInstruments(): InstrumentInstances {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.5,
      release: 0.3,
    },
  }).toDestination();
  synth.volume.value = -6;

  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: {
      attack: 0.3,
      decay: 0.5,
      sustain: 0.8,
      release: 1.0,
    },
  }).toDestination();
  pad.volume.value = -10;

  const bass = new Tone.MonoSynth({
    oscillator: { type: 'square' },
    envelope: {
      attack: 0.01,
      decay: 0.3,
      sustain: 0.4,
      release: 0.2,
    },
    filterEnvelope: {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.5,
      release: 0.2,
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

  return { synth, pad, bass, kick, snare, hihat, clap };
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
  // Ensure time is never negative (can happen due to timing jitter)
  const time = Math.max(Tone.now(), absoluteTime);
  const velocity = (event.velocity ?? 100) / 127;
  const duration = event.duration ?? 0.25;

  if (instrumentId === 'drums') {
    const drum = event.drum || 'kick';
    switch (drum) {
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
    }
  } else if (event.pitch !== undefined) {
    const note = midiToNote(event.pitch);
    switch (instrumentId) {
      case 'synth':
        instruments.synth.triggerAttackRelease(note, duration, time, velocity);
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

export function disposeInstruments(instruments: InstrumentInstances): void {
  instruments.synth.dispose();
  instruments.pad.dispose();
  instruments.bass.dispose();
  instruments.kick.dispose();
  instruments.snare.dispose();
  instruments.hihat.dispose();
  instruments.clap.dispose();
}
