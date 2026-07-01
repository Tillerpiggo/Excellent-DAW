import * as Tone from 'tone';
import { Instrument, AudioInstance } from '../types';
import { Event } from '@/core/types';

interface GuitarInstance extends AudioInstance {
  synth: Tone.PolySynth;
  filter: Tone.Filter;
  reverb: Tone.Reverb;
}

const numberSetting = (settings: Record<string, unknown>, key: string, fallback: number): number =>
  typeof settings[key] === 'number' ? (settings[key] as number) : fallback;

export const Guitar: Instrument = {
  id: 'guitar',
  name: 'Guitar',
  description: 'Plucky guitar-like synth for arpeggios and rhythmic chords',
  color: '#22c55e',
  hasAudio: true,
  hasVisual: false,
  editorType: 'arp',
  noteRange: { min: 40, max: 76 }, // E2-E5
  rangeLabels: [
    { startPitch: 40, endPitch: 51, label: 'Low Strings' },
    { startPitch: 52, endPitch: 63, label: 'Mid Strings' },
    { startPitch: 64, endPitch: 76, label: 'High Strings' },
  ],

  defaultSettings: {
    attack: 0.004,
    decay: 0.16,
    sustain: 0.18,
    release: 0.32,
    filterFrequency: 3200,
    reverbDecay: 1.2,
    reverbWet: 0.16,
    volume: -8,
  },

  settingsSchema: {
    attack: { type: 'number', label: 'Attack', min: 0.001, max: 0.2, step: 0.001, default: 0.004 },
    decay: { type: 'number', label: 'Decay', min: 0.02, max: 1.5, step: 0.01, default: 0.16 },
    sustain: { type: 'number', label: 'Sustain', min: 0, max: 1, step: 0.01, default: 0.18 },
    release: { type: 'number', label: 'Release', min: 0.02, max: 2, step: 0.01, default: 0.32 },
    filterFrequency: { type: 'number', label: 'Brightness', min: 400, max: 8000, step: 100, default: 3200 },
    reverbDecay: { type: 'number', label: 'Room Size', min: 0.1, max: 5, step: 0.1, default: 1.2 },
    reverbWet: { type: 'number', label: 'Room Mix', min: 0, max: 1, step: 0.01, default: 0.16 },
    volume: { type: 'number', label: 'Volume', min: -24, max: 0, step: 1, default: -8 },
  },

  createAudio: (settings): GuitarInstance => {
    const reverb = new Tone.Reverb({
      decay: numberSetting(settings, 'reverbDecay', 1.2),
      wet: numberSetting(settings, 'reverbWet', 0.16),
    }).toDestination();

    const filter = new Tone.Filter({
      frequency: numberSetting(settings, 'filterFrequency', 3200),
      type: 'lowpass',
      rolloff: -12,
    }).connect(reverb);

    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: {
        attack: numberSetting(settings, 'attack', 0.004),
        decay: numberSetting(settings, 'decay', 0.16),
        sustain: numberSetting(settings, 'sustain', 0.18),
        release: numberSetting(settings, 'release', 0.32),
      },
    }).connect(filter);
    synth.volume.value = numberSetting(settings, 'volume', -8);

    return {
      synth,
      filter,
      reverb,
      dispose: () => {
        synth.dispose();
        filter.dispose();
        reverb.dispose();
      },
    };
  },

  scheduleNote: (instance: AudioInstance, event: Event, time: number) => {
    const inst = instance as GuitarInstance;
    const note = Tone.Frequency(event.pitch, 'midi').toNote();
    const velocity = event.velocity / 127;
    inst.synth.triggerAttackRelease(note, event.duration, time, velocity);
  },

  updateParam: (instance: AudioInstance, key: string, value: number) => {
    const inst = instance as GuitarInstance;
    switch (key) {
      case 'filterFrequency':
        inst.filter.frequency.value = value;
        break;
      case 'reverbWet':
        inst.reverb.wet.value = value;
        break;
      case 'volume':
        inst.synth.volume.value = value;
        break;
    }
  },
};
