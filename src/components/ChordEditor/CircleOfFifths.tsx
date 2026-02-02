'use client';

import { useCallback } from 'react';
import { ChordQuality, ChordVoicing, getNoteNames, CIRCLE_OF_FIFTHS } from '@/core/harmony';
import { getPlaybackEngine } from '@/core/playback';
import { InstrumentId } from '@/core/types';

interface CircleOfFifthsProps {
  currentRoot: number;
  currentQuality: ChordQuality;
  octave: number;
  voicing: ChordVoicing;
  instrumentId: InstrumentId;
  onSelect: (root: number, quality: ChordQuality) => void;
  onOctaveChange: (octave: number) => void;
  onVoicingChange: (voicing: ChordVoicing) => void;
}

// Relative minor for each major (same position in circle)
// C major -> A minor, G major -> E minor, etc.
const RELATIVE_MINORS = [9, 4, 11, 6, 1, 8, 3, 10, 5, 0, 7, 2];

// Diminished chords - built on the 7th degree of each major scale
// In C major, the diminished is B dim. For circle positions:
const DIMINISHED_ROOTS = [11, 6, 1, 8, 3, 10, 5, 0, 7, 2, 9, 4];

const VOICING_OPTIONS: { value: ChordVoicing; label: string; description: string }[] = [
  { value: 'close', label: 'Close', description: 'Notes close together' },
  { value: 'open', label: 'Open', description: 'Spread out voicing' },
  { value: 'drop2', label: 'Drop 2', description: 'Jazz voicing' },
  { value: 'spread', label: 'Spread', description: 'Wide across octaves' },
];

export function CircleOfFifths({
  currentRoot,
  currentQuality,
  octave,
  voicing,
  instrumentId,
  onSelect,
  onOctaveChange,
  onVoicingChange,
}: CircleOfFifthsProps) {
  const noteNames = getNoteNames();

  const handleClick = useCallback((root: number, quality: ChordQuality) => {
    onSelect(root, quality);
    getPlaybackEngine().previewChord(root, quality, octave, instrumentId);
  }, [onSelect, octave, instrumentId]);

  // Check if a chord matches current selection
  const isSelected = (root: number, quality: ChordQuality) => {
    return currentRoot === root && currentQuality === quality;
  };

  // Calculate position on circle
  const getPosition = (index: number, radius: number) => {
    // Start from top (12 o'clock) and go clockwise
    const angle = (index * 30 - 90) * (Math.PI / 180);
    return {
      x: 50 + radius * Math.cos(angle),
      y: 50 + radius * Math.sin(angle),
    };
  };

  return (
    <div className="flex flex-col h-full bg-surface border-l border-border overflow-y-auto">
      <div className="px-3 py-2 border-b border-border sticky top-0 bg-surface z-10">
        <span className="text-xs font-medium text-muted">Circle of Fifths</span>
      </div>

      <div className="flex items-center justify-center p-2 min-h-[200px]">
        <svg viewBox="0 0 100 100" className="w-full max-w-[280px] max-h-[280px] aspect-square">
          {/* Outer ring - Major chords */}
          {CIRCLE_OF_FIFTHS.map((root, index) => {
            const pos = getPosition(index, 42);
            const selected = isSelected(root, 'major');
            return (
              <g key={`major-${root}`} className="cursor-pointer">
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r="7"
                  className={`transition-all ${
                    selected
                      ? 'fill-coral stroke-white stroke-2'
                      : 'fill-background stroke-border hover:fill-coral/20 hover:stroke-coral'
                  }`}
                  onClick={() => handleClick(root, 'major')}
                />
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={`text-[5px] font-bold pointer-events-none ${
                    selected ? 'fill-white' : 'fill-foreground'
                  }`}
                >
                  {noteNames[root]}
                </text>
              </g>
            );
          })}

          {/* Inner ring - Minor chords */}
          {CIRCLE_OF_FIFTHS.map((_, index) => {
            const minorRoot = RELATIVE_MINORS[index];
            const pos = getPosition(index, 28);
            const selected = isSelected(minorRoot, 'minor');
            return (
              <g key={`minor-${minorRoot}`} className="cursor-pointer">
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r="6"
                  className={`transition-all ${
                    selected
                      ? 'fill-coral stroke-white stroke-2'
                      : 'fill-background stroke-border hover:fill-coral/20 hover:stroke-coral'
                  }`}
                  onClick={() => handleClick(minorRoot, 'minor')}
                />
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={`text-[4px] font-medium pointer-events-none ${
                    selected ? 'fill-white' : 'fill-muted'
                  }`}
                >
                  {noteNames[minorRoot]}m
                </text>
              </g>
            );
          })}

          {/* Center ring - Diminished chords */}
          {CIRCLE_OF_FIFTHS.map((_, index) => {
            const dimRoot = DIMINISHED_ROOTS[index];
            const pos = getPosition(index, 15);
            const selected = isSelected(dimRoot, 'diminished');
            return (
              <g key={`dim-${dimRoot}`} className="cursor-pointer">
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r="4"
                  className={`transition-all ${
                    selected
                      ? 'fill-coral stroke-white stroke-1'
                      : 'fill-background stroke-border hover:fill-coral/20 hover:stroke-coral'
                  }`}
                  onClick={() => handleClick(dimRoot, 'diminished')}
                />
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={`text-[3px] font-medium pointer-events-none ${
                    selected ? 'fill-white' : 'fill-muted'
                  }`}
                >
                  {noteNames[dimRoot]}°
                </text>
              </g>
            );
          })}

          {/* Center - current chord display */}
          <circle cx="50" cy="50" r="6" className="fill-surface stroke-border" />
          <text
            x="50"
            y="50"
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[4px] font-bold fill-foreground"
          >
            {noteNames[currentRoot]}
            {currentQuality === 'minor' ? 'm' : currentQuality === 'diminished' ? '°' : ''}
          </text>
        </svg>
      </div>

      {/* Quality modifiers for 7ths, sus, aug */}
      <div className="px-3 py-2 border-t border-border">
        <div className="text-xs text-muted mb-1.5">Extensions</div>
        <div className="flex flex-wrap gap-1">
          {(['major7', 'minor7', 'dominant7', 'sus2', 'sus4', 'augmented'] as ChordQuality[]).map((quality) => (
            <button
              key={quality}
              onClick={() => handleClick(currentRoot, quality)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                currentQuality === quality
                  ? 'bg-coral text-white'
                  : 'bg-background hover:bg-border text-foreground'
              }`}
            >
              {quality === 'major7' ? 'Maj7' :
               quality === 'minor7' ? 'm7' :
               quality === 'dominant7' ? '7' :
               quality === 'sus2' ? 'sus2' :
               quality === 'sus4' ? 'sus4' :
               quality === 'augmented' ? 'Aug' : quality}
            </button>
          ))}
        </div>
      </div>

      {/* Octave control */}
      <div className="px-3 py-2 border-t border-border">
        <div className="text-xs text-muted mb-1.5">Octave</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOctaveChange(Math.max(1, octave - 1))}
            className="w-8 h-8 rounded bg-background border border-border text-foreground hover:bg-border transition-colors text-sm font-medium"
          >
            -
          </button>
          <span className="flex-1 text-center text-sm font-medium">{octave}</span>
          <button
            onClick={() => onOctaveChange(Math.min(7, octave + 1))}
            className="w-8 h-8 rounded bg-background border border-border text-foreground hover:bg-border transition-colors text-sm font-medium"
          >
            +
          </button>
        </div>
      </div>

      {/* Voicing control */}
      <div className="px-3 py-2 border-t border-border">
        <div className="text-xs text-muted mb-1.5">Voicing</div>
        <div className="flex flex-wrap gap-1">
          {VOICING_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onVoicingChange(option.value)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                voicing === option.value
                  ? 'bg-coral text-white'
                  : 'bg-background hover:bg-border text-foreground'
              }`}
              title={option.description}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
