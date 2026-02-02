import { PatternPreset, Event, PatternCategory } from './types';

// Helper to create drum events
const drum = (time: number, type: 'kick' | 'snare' | 'hihat' | 'clap', velocity = 100): Event => ({
  time,
  drum: type,
  velocity,
  duration: 0.25,
});

// Helper to create note events
const note = (time: number, pitch: number, duration = 0.5, velocity = 100): Event => ({
  time,
  pitch,
  velocity,
  duration,
});

export const PATTERN_PRESETS: PatternPreset[] = [
  // ========== DRUMS ==========
  {
    id: 'kick-four',
    name: 'Four on Floor',
    category: 'drums',
    description: 'Classic kick on every beat',
    defaultTrackType: 'base',
    defaultInstrument: 'drums',
    durationBars: 1,
    presetType: 'loop',
    events: [
      drum(0, 'kick'),
      drum(1, 'kick'),
      drum(2, 'kick'),
      drum(3, 'kick'),
    ],
  },
  {
    id: 'kick-boom-bap',
    name: 'Boom Bap Kick',
    category: 'drums',
    description: 'Hip-hop style kick pattern',
    defaultTrackType: 'base',
    defaultInstrument: 'drums',
    durationBars: 1,
    presetType: 'loop',
    events: [
      drum(0, 'kick'),
      drum(2.5, 'kick'),
    ],
  },
  {
    id: 'snare-backbeat',
    name: 'Backbeat Snare',
    category: 'drums',
    description: 'Snare on 2 and 4',
    defaultTrackType: 'add',
    defaultInstrument: 'drums',
    durationBars: 1,
    presetType: 'loop',
    events: [
      drum(1, 'snare'),
      drum(3, 'snare'),
    ],
  },
  {
    id: 'hats-8th',
    name: 'Eighth Note Hats',
    category: 'drums',
    description: 'Hi-hats on every eighth note',
    defaultTrackType: 'add',
    defaultInstrument: 'drums',
    durationBars: 1,
    presetType: 'loop',
    events: [
      drum(0, 'hihat', 80),
      drum(0.5, 'hihat', 60),
      drum(1, 'hihat', 80),
      drum(1.5, 'hihat', 60),
      drum(2, 'hihat', 80),
      drum(2.5, 'hihat', 60),
      drum(3, 'hihat', 80),
      drum(3.5, 'hihat', 60),
    ],
  },
  {
    id: 'hats-16th',
    name: 'Sixteenth Hats',
    category: 'drums',
    description: 'Fast hi-hat pattern',
    defaultTrackType: 'add',
    defaultInstrument: 'drums',
    durationBars: 1,
    presetType: 'loop',
    events: Array.from({ length: 16 }, (_, i) =>
      drum(i * 0.25, 'hihat', i % 4 === 0 ? 90 : i % 2 === 0 ? 70 : 50)
    ),
  },
  {
    id: 'ghost-snares',
    name: 'Ghost Snares',
    category: 'drums',
    description: 'Quiet snare hits for groove',
    defaultTrackType: 'add',
    defaultInstrument: 'drums',
    durationBars: 1,
    presetType: 'loop',
    events: [
      drum(0.5, 'snare', 40),
      drum(1.75, 'snare', 35),
      drum(2.5, 'snare', 40),
      drum(3.25, 'snare', 30),
    ],
  },
  {
    id: 'clap-accent',
    name: 'Clap Accents',
    category: 'drums',
    description: 'Claps for emphasis',
    defaultTrackType: 'add',
    defaultInstrument: 'drums',
    durationBars: 1,
    presetType: 'loop',
    events: [
      drum(1, 'clap'),
      drum(3, 'clap'),
    ],
  },
  {
    id: 'fill-basic',
    name: 'Basic Fill',
    category: 'drums',
    description: 'Simple drum fill',
    defaultTrackType: 'add',
    defaultInstrument: 'drums',
    durationBars: 1,
    presetType: 'loop',
    events: [
      drum(3, 'snare'),
      drum(3.25, 'snare', 90),
      drum(3.5, 'snare', 100),
      drum(3.75, 'snare', 110),
    ],
  },

  // ========== CHORDS ==========
  {
    id: 'chord-i-v-vi-iv',
    name: 'I-V-vi-IV',
    category: 'chords',
    description: 'The most popular progression',
    defaultTrackType: 'base',
    defaultInstrument: 'pad',
    durationBars: 4,
    presetType: 'loop',
    events: [
      // C major (I)
      note(0, 60, 3.5), note(0, 64, 3.5), note(0, 67, 3.5),
      // G major (V)
      note(4, 55, 3.5), note(4, 59, 3.5), note(4, 62, 3.5),
      // A minor (vi)
      note(8, 57, 3.5), note(8, 60, 3.5), note(8, 64, 3.5),
      // F major (IV)
      note(12, 53, 3.5), note(12, 57, 3.5), note(12, 60, 3.5),
    ],
  },
  {
    id: 'chord-vi-iv-i-v',
    name: 'vi-IV-I-V',
    category: 'chords',
    description: 'Emotional minor start',
    defaultTrackType: 'base',
    defaultInstrument: 'pad',
    durationBars: 4,
    presetType: 'loop',
    events: [
      // A minor (vi)
      note(0, 57, 3.5), note(0, 60, 3.5), note(0, 64, 3.5),
      // F major (IV)
      note(4, 53, 3.5), note(4, 57, 3.5), note(4, 60, 3.5),
      // C major (I)
      note(8, 60, 3.5), note(8, 64, 3.5), note(8, 67, 3.5),
      // G major (V)
      note(12, 55, 3.5), note(12, 59, 3.5), note(12, 62, 3.5),
    ],
  },
  {
    id: 'chord-i-vi-iv-v',
    name: 'I-vi-IV-V',
    category: 'chords',
    description: '50s doo-wop progression',
    defaultTrackType: 'base',
    defaultInstrument: 'pad',
    durationBars: 4,
    presetType: 'loop',
    events: [
      // C major (I)
      note(0, 60, 3.5), note(0, 64, 3.5), note(0, 67, 3.5),
      // A minor (vi)
      note(4, 57, 3.5), note(4, 60, 3.5), note(4, 64, 3.5),
      // F major (IV)
      note(8, 53, 3.5), note(8, 57, 3.5), note(8, 60, 3.5),
      // G major (V)
      note(12, 55, 3.5), note(12, 59, 3.5), note(12, 62, 3.5),
    ],
  },
  {
    id: 'chord-power',
    name: 'Power Chords',
    category: 'chords',
    description: 'Root and fifth only',
    defaultTrackType: 'base',
    defaultInstrument: 'synth',
    durationBars: 2,
    presetType: 'loop',
    events: [
      note(0, 48, 3.5), note(0, 55, 3.5),
      note(4, 53, 3.5), note(4, 60, 3.5),
    ],
  },

  // ========== BASS ==========
  {
    id: 'bass-root',
    name: 'Root Notes',
    category: 'bass',
    description: 'Bass following chord roots',
    defaultTrackType: 'base',
    defaultInstrument: 'bass',
    durationBars: 4,
    presetType: 'loop',
    events: [
      note(0, 36, 3.5),   // C
      note(4, 31, 3.5),   // G
      note(8, 33, 3.5),   // A
      note(12, 29, 3.5),  // F
    ],
  },
  {
    id: 'bass-driving',
    name: 'Driving Bass',
    category: 'bass',
    description: 'Eighth note bass pulse',
    defaultTrackType: 'base',
    defaultInstrument: 'bass',
    durationBars: 1,
    presetType: 'loop',
    events: [
      note(0, 36, 0.4), note(0.5, 36, 0.4),
      note(1, 36, 0.4), note(1.5, 36, 0.4),
      note(2, 36, 0.4), note(2.5, 36, 0.4),
      note(3, 36, 0.4), note(3.5, 36, 0.4),
    ],
  },
  {
    id: 'bass-octave',
    name: 'Octave Bass',
    category: 'bass',
    description: 'Alternating octaves',
    defaultTrackType: 'base',
    defaultInstrument: 'bass',
    durationBars: 1,
    presetType: 'loop',
    events: [
      note(0, 36, 0.4), note(0.5, 48, 0.4),
      note(1, 36, 0.4), note(1.5, 48, 0.4),
      note(2, 36, 0.4), note(2.5, 48, 0.4),
      note(3, 36, 0.4), note(3.5, 48, 0.4),
    ],
  },
  {
    id: 'bass-syncopated',
    name: 'Syncopated Bass',
    category: 'bass',
    description: 'Off-beat bass line',
    defaultTrackType: 'base',
    defaultInstrument: 'bass',
    durationBars: 1,
    presetType: 'loop',
    events: [
      note(0, 36, 0.4),
      note(0.75, 36, 0.2),
      note(1.5, 36, 0.4),
      note(2.25, 36, 0.2),
      note(3, 36, 0.4),
      note(3.5, 36, 0.2),
    ],
  },

  // ========== ARPS ==========
  {
    id: 'arp-rising',
    name: 'Rising Arp',
    category: 'arp',
    description: 'Upward arpeggio pattern',
    defaultTrackType: 'base',
    defaultInstrument: 'synth',
    durationBars: 1,
    presetType: 'loop',
    events: [
      note(0, 60, 0.4), note(0.5, 64, 0.4),
      note(1, 67, 0.4), note(1.5, 72, 0.4),
      note(2, 60, 0.4), note(2.5, 64, 0.4),
      note(3, 67, 0.4), note(3.5, 72, 0.4),
    ],
  },
  {
    id: 'arp-falling',
    name: 'Falling Arp',
    category: 'arp',
    description: 'Downward arpeggio pattern',
    defaultTrackType: 'base',
    defaultInstrument: 'synth',
    durationBars: 1,
    presetType: 'loop',
    events: [
      note(0, 72, 0.4), note(0.5, 67, 0.4),
      note(1, 64, 0.4), note(1.5, 60, 0.4),
      note(2, 72, 0.4), note(2.5, 67, 0.4),
      note(3, 64, 0.4), note(3.5, 60, 0.4),
    ],
  },
  {
    id: 'arp-fast',
    name: 'Fast Arp',
    category: 'arp',
    description: '16th note arpeggios',
    defaultTrackType: 'base',
    defaultInstrument: 'synth',
    durationBars: 1,
    presetType: 'loop',
    events: Array.from({ length: 16 }, (_, i) => {
      const pitches = [60, 64, 67, 72];
      return note(i * 0.25, pitches[i % 4], 0.2, 80 + (i % 4) * 10);
    }),
  },
  {
    id: 'arp-bounce',
    name: 'Bouncing Arp',
    category: 'arp',
    description: 'Up-down arpeggio pattern',
    defaultTrackType: 'base',
    defaultInstrument: 'synth',
    durationBars: 1,
    presetType: 'loop',
    events: [
      note(0, 60, 0.4), note(0.5, 67, 0.4),
      note(1, 64, 0.4), note(1.5, 72, 0.4),
      note(2, 67, 0.4), note(2.5, 64, 0.4),
      note(3, 72, 0.4), note(3.5, 67, 0.4),
    ],
  },

  // ========== SWING ==========
  {
    id: 'swing-light',
    name: 'Light Swing',
    category: 'swing',
    description: 'Subtle swing feel (33%)',
    defaultTrackType: 'swing',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 0.5, velocity: 42 },  // 33% swing
      { time: 1.5, velocity: 42 },
      { time: 2.5, velocity: 42 },
      { time: 3.5, velocity: 42 },
    ],
  },
  {
    id: 'swing-medium',
    name: 'Medium Swing',
    category: 'swing',
    description: 'Standard swing feel (50%)',
    defaultTrackType: 'swing',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 0.5, velocity: 64 },  // 50% swing
      { time: 1.5, velocity: 64 },
      { time: 2.5, velocity: 64 },
      { time: 3.5, velocity: 64 },
    ],
  },
  {
    id: 'swing-triplet',
    name: 'Triplet Swing',
    category: 'swing',
    description: 'Classic jazz triplet feel (66%)',
    defaultTrackType: 'swing',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 0.5, velocity: 84 },  // 66% swing
      { time: 1.5, velocity: 84 },
      { time: 2.5, velocity: 84 },
      { time: 3.5, velocity: 84 },
    ],
  },
  {
    id: 'swing-heavy',
    name: 'Heavy Swing',
    category: 'swing',
    description: 'Exaggerated shuffle (85%)',
    defaultTrackType: 'swing',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 0.5, velocity: 108 },  // 85% swing
      { time: 1.5, velocity: 108 },
      { time: 2.5, velocity: 108 },
      { time: 3.5, velocity: 108 },
    ],
  },
  {
    id: 'swing-16th',
    name: '16th Note Swing',
    category: 'swing',
    description: 'Swing on 16th note off-beats',
    defaultTrackType: 'swing',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 0.25, velocity: 64 },
      { time: 0.75, velocity: 64 },
      { time: 1.25, velocity: 64 },
      { time: 1.75, velocity: 64 },
      { time: 2.25, velocity: 64 },
      { time: 2.75, velocity: 64 },
      { time: 3.25, velocity: 64 },
      { time: 3.75, velocity: 64 },
    ],
  },
  {
    id: 'swing-half-time',
    name: 'Half-time Swing',
    category: 'swing',
    description: 'Swing on beats 2 and 4 only',
    defaultTrackType: 'swing',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 1.5, velocity: 84 },
      { time: 3.5, velocity: 84 },
    ],
  },

  // ========== MODIFIERS ==========
  {
    id: 'mod-accents',
    name: 'Accent Pattern',
    category: 'modifier',
    description: 'Emphasizes certain beats',
    defaultTrackType: 'scale',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 0, velocity: 127 },
      { time: 1, velocity: 80 },
      { time: 2, velocity: 100 },
      { time: 3, velocity: 80 },
    ],
  },
  {
    id: 'mod-velocity-build',
    name: 'Velocity Build',
    category: 'modifier',
    description: 'Gradually increases intensity',
    defaultTrackType: 'scale',
    durationBars: 2,
    presetType: 'loop',
    events: Array.from({ length: 8 }, (_, i) => ({
      time: i,
      velocity: 50 + i * 10,
    })),
  },
  {
    id: 'mod-gate-offbeat',
    name: 'Off-beat Gate',
    category: 'modifier',
    description: 'Only lets off-beats through',
    defaultTrackType: 'gate',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 0.5, velocity: 100 },
      { time: 1.5, velocity: 100 },
      { time: 2.5, velocity: 100 },
      { time: 3.5, velocity: 100 },
    ],
  },
  {
    id: 'mod-gate-downbeat',
    name: 'Downbeat Gate',
    category: 'modifier',
    description: 'Only lets downbeats through',
    defaultTrackType: 'gate',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 0, velocity: 100 },
      { time: 1, velocity: 100 },
      { time: 2, velocity: 100 },
      { time: 3, velocity: 100 },
    ],
  },
  {
    id: 'mod-octave-up',
    name: 'Octave Up',
    category: 'modifier',
    description: 'Shifts all notes up one octave',
    defaultTrackType: 'shift',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 0, pitch: 72, velocity: 100 }, // 60 + 12 = octave up
    ],
  },
  {
    id: 'mod-octave-down',
    name: 'Octave Down',
    category: 'modifier',
    description: 'Shifts all notes down one octave',
    defaultTrackType: 'shift',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 0, pitch: 48, velocity: 100 }, // 60 - 12 = octave down
    ],
  },
  {
    id: 'mod-mute-bar',
    name: 'Mute Bar',
    category: 'mute',
    description: 'Silences one bar',
    defaultTrackType: 'mute',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 0, velocity: 100 },
    ],
  },
  {
    id: 'mod-mute-even',
    name: 'Mute Even Bars',
    category: 'mute',
    description: 'Silences bars 2 and 4 (even bars)',
    defaultTrackType: 'mute',
    durationBars: 4,
    presetType: 'loop',
    events: [
      { time: 4, velocity: 100 },   // Bar 2 (beats 4-7)
      { time: 12, velocity: 100 },  // Bar 4 (beats 12-15)
    ],
  },
  {
    id: 'mod-mute-odd',
    name: 'Mute Odd Bars',
    category: 'mute',
    description: 'Silences bars 1 and 3 (odd bars)',
    defaultTrackType: 'mute',
    durationBars: 4,
    presetType: 'loop',
    events: [
      { time: 0, velocity: 100 },   // Bar 1 (beats 0-3)
      { time: 8, velocity: 100 },   // Bar 3 (beats 8-11)
    ],
  },
  {
    id: 'mute-offbeats',
    name: 'Off-beats',
    category: 'mute',
    description: 'Mutes all off-beats',
    defaultTrackType: 'mute',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 0.5, velocity: 100 },
      { time: 1.5, velocity: 100 },
      { time: 2.5, velocity: 100 },
      { time: 3.5, velocity: 100 },
    ],
  },
  {
    id: 'mute-downbeats',
    name: 'Downbeats',
    category: 'mute',
    description: 'Mutes all downbeats',
    defaultTrackType: 'mute',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 0, velocity: 100 },
      { time: 1, velocity: 100 },
      { time: 2, velocity: 100 },
      { time: 3, velocity: 100 },
    ],
  },
  {
    id: 'mute-sparse',
    name: 'Sparse',
    category: 'mute',
    description: 'Occasional mutes for variation',
    defaultTrackType: 'mute',
    durationBars: 2,
    presetType: 'loop',
    events: [
      { time: 1.5, velocity: 100 },
      { time: 5, velocity: 100 },
      { time: 6.5, velocity: 100 },
    ],
  },
  {
    id: 'mute-stutter',
    name: 'Stutter',
    category: 'mute',
    description: '16th note mutes for stutter effect',
    defaultTrackType: 'mute',
    durationBars: 1,
    presetType: 'loop',
    events: [
      { time: 2, velocity: 100 },
      { time: 2.25, velocity: 100 },
      { time: 2.75, velocity: 100 },
      { time: 3, velocity: 100 },
    ],
  },
  {
    id: 'mute-buildup',
    name: 'Buildup',
    category: 'mute',
    description: 'Progressive unmuting for tension',
    defaultTrackType: 'mute',
    durationBars: 4,
    presetType: 'loop',
    events: [
      { time: 0, velocity: 100 },
      { time: 1, velocity: 100 },
      { time: 2, velocity: 100 },
      { time: 4, velocity: 100 },
      { time: 5, velocity: 100 },
      { time: 8, velocity: 100 },
    ],
  },

  // ========== RESTS ==========
  {
    id: 'rest-1bar',
    name: '1 Bar Rest',
    category: 'rest',
    description: 'One bar of silence',
    defaultTrackType: 'rest',
    durationBars: 1,
    presetType: 'loop',
    events: [],
  },
  {
    id: 'rest-2bar',
    name: '2 Bar Rest',
    category: 'rest',
    description: 'Two bars of silence',
    defaultTrackType: 'rest',
    durationBars: 2,
    presetType: 'loop',
    events: [],
  },
  {
    id: 'rest-4bar',
    name: '4 Bar Rest',
    category: 'rest',
    description: 'Four bars of silence',
    defaultTrackType: 'rest',
    durationBars: 4,
    presetType: 'loop',
    events: [],
  },
  {
    id: 'rest-8bar',
    name: '8 Bar Rest',
    category: 'rest',
    description: 'Eight bars of silence (intro/outro)',
    defaultTrackType: 'rest',
    durationBars: 8,
    presetType: 'loop',
    events: [],
  },
  {
    id: 'rest-half',
    name: 'Half Bar Rest',
    category: 'rest',
    description: 'Half bar of silence',
    defaultTrackType: 'rest',
    durationBars: 0.5,
    presetType: 'loop',
    events: [],
  },

  // ========== RHYTHM ==========
  {
    id: 'rhythm-quarter',
    name: 'Quarter Notes',
    category: 'rhythm',
    description: 'Triggers on every beat',
    defaultTrackType: 'rhythm',
    durationBars: 1,
    presetType: 'loop',
    events: [
      note(0, 60, 0.25), note(1, 60, 0.25),
      note(2, 60, 0.25), note(3, 60, 0.25),
    ],
  },
  {
    id: 'rhythm-eighth',
    name: 'Eighth Notes',
    category: 'rhythm',
    description: 'Triggers on every eighth note',
    defaultTrackType: 'rhythm',
    durationBars: 1,
    presetType: 'loop',
    events: [
      note(0, 60, 0.25), note(0.5, 60, 0.25),
      note(1, 60, 0.25), note(1.5, 60, 0.25),
      note(2, 60, 0.25), note(2.5, 60, 0.25),
      note(3, 60, 0.25), note(3.5, 60, 0.25),
    ],
  },
  {
    id: 'rhythm-sixteenth',
    name: 'Sixteenth Notes',
    category: 'rhythm',
    description: 'Triggers on every sixteenth note',
    defaultTrackType: 'rhythm',
    durationBars: 1,
    presetType: 'loop',
    events: Array.from({ length: 16 }, (_, i) =>
      note(i * 0.25, 60, 0.125, i % 4 === 0 ? 100 : 80)
    ),
  },
  {
    id: 'rhythm-offbeat',
    name: 'Off-beats',
    category: 'rhythm',
    description: 'Triggers on the off-beats (ands)',
    defaultTrackType: 'rhythm',
    durationBars: 1,
    presetType: 'loop',
    events: [
      note(0.5, 60, 0.25), note(1.5, 60, 0.25),
      note(2.5, 60, 0.25), note(3.5, 60, 0.25),
    ],
  },
  {
    id: 'rhythm-syncopated',
    name: 'Syncopated',
    category: 'rhythm',
    description: 'Off-beat syncopated pattern',
    defaultTrackType: 'rhythm',
    durationBars: 1,
    presetType: 'loop',
    events: [
      note(0, 60, 0.25),
      note(0.75, 60, 0.25),
      note(1.5, 60, 0.25),
      note(2.25, 60, 0.25),
      note(3, 60, 0.25),
      note(3.5, 60, 0.25),
    ],
  },
  {
    id: 'rhythm-tresillo',
    name: 'Tresillo (3+3+2)',
    category: 'rhythm',
    description: 'Classic Afro-Cuban 3+3+2 pattern',
    defaultTrackType: 'rhythm',
    durationBars: 1,
    presetType: 'loop',
    events: [
      note(0, 60, 0.25),
      note(1.5, 60, 0.25),
      note(3, 60, 0.25),
    ],
  },

  // ========== BASIC PATTERNS (one per category) ==========
  {
    id: 'drums-basic',
    name: 'Drums',
    category: 'drums',
    description: 'Simple 4-beat kick pattern',
    defaultTrackType: 'base',
    defaultInstrument: 'drums',
    durationBars: 1,
    presetType: 'pattern',
    events: [
      drum(0, 'kick'),
      drum(1, 'kick'),
      drum(2, 'kick'),
      drum(3, 'kick'),
    ],
  },
  {
    id: 'chords-basic',
    name: 'Chords',
    category: 'chords',
    description: 'Single C major chord (1 bar)',
    defaultTrackType: 'base',
    defaultInstrument: 'pad',
    durationBars: 1,
    presetType: 'pattern',
    events: [
      note(0, 60, 3.5), note(0, 64, 3.5), note(0, 67, 3.5),
    ],
  },
  {
    id: 'bass-basic',
    name: 'Bass',
    category: 'bass',
    description: 'Simple root note',
    defaultTrackType: 'base',
    defaultInstrument: 'bass',
    durationBars: 1,
    presetType: 'pattern',
    events: [
      note(0, 36, 3.5),
    ],
  },
  {
    id: 'arp-basic',
    name: 'Arp',
    category: 'arp',
    description: 'Simple 4-note arpeggio',
    defaultTrackType: 'base',
    defaultInstrument: 'synth',
    durationBars: 1,
    presetType: 'pattern',
    events: [
      note(0, 60, 0.4), note(1, 64, 0.4),
      note(2, 67, 0.4), note(3, 72, 0.4),
    ],
  },
  {
    id: 'transpose-basic',
    name: 'Transpose',
    category: 'modifier',
    description: 'Transpose notes by semitones',
    defaultTrackType: 'transpose',
    durationBars: 1,
    presetType: 'pattern',
    events: [
      note(0, 60, 4), // C4 = no transposition (0 semitones), duration covers whole bar
    ],
  },
  {
    id: 'rhythm-basic',
    name: 'Rhythm',
    category: 'rhythm',
    description: 'Quarter notes',
    defaultTrackType: 'rhythm',
    durationBars: 1,
    presetType: 'pattern',
    events: [
      note(0, 60, 0.25), note(1, 60, 0.25),
      note(2, 60, 0.25), note(3, 60, 0.25),
    ],
  },
  {
    id: 'mute-basic',
    name: 'Mute',
    category: 'mute',
    description: 'Silences output',
    defaultTrackType: 'mute',
    durationBars: 1,
    presetType: 'pattern',
    events: [
      { time: 0, velocity: 100 },
    ],
  },
  {
    id: 'rest-basic',
    name: 'Rest',
    category: 'rest',
    description: 'One bar of silence',
    defaultTrackType: 'rest',
    durationBars: 1,
    presetType: 'pattern',
    events: [],
  },
  {
    id: 'swing-basic',
    name: 'Swing',
    category: 'swing',
    description: 'Off-beat swing feel',
    defaultTrackType: 'swing',
    durationBars: 1,
    presetType: 'pattern',
    events: [
      { time: 0.5, velocity: 84 },
      { time: 1.5, velocity: 84 },
      { time: 2.5, velocity: 84 },
      { time: 3.5, velocity: 84 },
    ],
  },
];

export function getPreset(id: string): PatternPreset | undefined {
  return PATTERN_PRESETS.find(p => p.id === id);
}

export function getPresetsByCategory(category: string): PatternPreset[] {
  return PATTERN_PRESETS.filter(p => p.category === category);
}

export function getLoopPresets(): PatternPreset[] {
  return PATTERN_PRESETS.filter(p => p.presetType === 'loop');
}

export function getPatternPresets(): PatternPreset[] {
  return PATTERN_PRESETS.filter(p => p.presetType === 'pattern');
}

export function getLoopsByCategory(category: PatternCategory): PatternPreset[] {
  return PATTERN_PRESETS.filter(p => p.category === category && p.presetType === 'loop');
}

export function getPatternByCategory(category: PatternCategory): PatternPreset | undefined {
  return PATTERN_PRESETS.find(p => p.category === category && p.presetType === 'pattern');
}

export const PRESET_CATEGORIES = ['drums', 'chords', 'bass', 'arp', 'modifier', 'rhythm', 'mute', 'rest', 'swing'] as const;
