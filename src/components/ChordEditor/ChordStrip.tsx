'use client';

import { useCallback, useRef, useEffect } from 'react';
import { ChordQuality, getNoteNames, getQualityDisplayName, CIRCLE_OF_FIFTHS } from '@/core/harmony';
import { getPlaybackEngine } from '@/core/playback';
import { InstrumentId } from '@/core/types';

interface ChordStripProps {
  currentRoot: number;
  currentQuality: ChordQuality;
  octave: number;
  instrumentId: InstrumentId;
  onSelect: (root: number, quality: ChordQuality) => void;
  onClose: () => void;
}

const QUALITIES: ChordQuality[] = [
  'major',
  'minor',
  'dominant7',
  'minor7',
  'major7',
  'diminished',
  'augmented',
  'sus2',
  'sus4',
];

// Get the index in circle of fifths for a given root
function getCircleIndex(root: number): number {
  return CIRCLE_OF_FIFTHS.indexOf(root);
}

// Get neighbors in circle of fifths (wraps around)
function getCircleNeighbors(root: number, count: number = 2): number[] {
  const idx = getCircleIndex(root);
  const result: number[] = [];

  // Add left neighbors
  for (let i = count; i > 0; i--) {
    const neighborIdx = (idx - i + 12) % 12;
    result.push(CIRCLE_OF_FIFTHS[neighborIdx]);
  }

  // Add current
  result.push(root);

  // Add right neighbors
  for (let i = 1; i <= count; i++) {
    const neighborIdx = (idx + i) % 12;
    result.push(CIRCLE_OF_FIFTHS[neighborIdx]);
  }

  return result;
}

export function ChordStrip({
  currentRoot,
  currentQuality,
  octave,
  instrumentId,
  onSelect,
  onClose,
}: ChordStripProps) {
  const noteNames = getNoteNames();
  const stripRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastPreviewedRef = useRef<string | null>(null);

  // Get visible roots (current + 2 neighbors each direction)
  const visibleRoots = getCircleNeighbors(currentRoot, 2);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (stripRef.current && !stripRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Delay to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Preview chord on hover (debounced)
  const handleHover = useCallback((root: number, quality: ChordQuality) => {
    const key = `${root}-${quality}`;

    // Clear any pending preview
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Don't re-preview the same chord
    if (lastPreviewedRef.current === key) return;

    hoverTimeoutRef.current = setTimeout(() => {
      lastPreviewedRef.current = key;
      getPlaybackEngine().previewChord(root, quality, octave, instrumentId);
    }, 100);
  }, [octave, instrumentId]);

  // Clear last previewed when mouse leaves
  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    lastPreviewedRef.current = null;
  }, []);

  // Select chord on click (also plays preview as confirmation)
  const handleClick = useCallback((root: number, quality: ChordQuality) => {
    onSelect(root, quality);
    getPlaybackEngine().previewChord(root, quality, octave, instrumentId);
    lastPreviewedRef.current = `${root}-${quality}`;
  }, [onSelect, octave, instrumentId]);

  // Navigate circle of fifths
  const navigateCircle = useCallback((direction: -1 | 1) => {
    const idx = getCircleIndex(currentRoot);
    const newIdx = (idx + direction + 12) % 12;
    const newRoot = CIRCLE_OF_FIFTHS[newIdx];
    handleClick(newRoot, currentQuality);
  }, [currentRoot, currentQuality, handleClick]);

  return (
    <div
      ref={stripRef}
      className="bg-surface border border-border rounded-lg shadow-lg p-3 flex flex-col gap-2"
      onMouseLeave={handleMouseLeave}
    >
      {/* Root selection - circle of fifths */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => navigateCircle(-1)}
          className="p-1.5 rounded hover:bg-border text-muted hover:text-foreground transition-colors"
          title="Previous in circle of fifths"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex gap-1">
          {visibleRoots.map((root) => (
            <button
              key={root}
              onClick={() => handleClick(root, currentQuality)}
              onMouseEnter={() => handleHover(root, currentQuality)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all min-w-[40px] ${
                root === currentRoot
                  ? 'bg-coral text-white shadow-sm'
                  : 'bg-background hover:bg-border text-foreground'
              }`}
            >
              {noteNames[root]}
            </button>
          ))}
        </div>

        <button
          onClick={() => navigateCircle(1)}
          className="p-1.5 rounded hover:bg-border text-muted hover:text-foreground transition-colors"
          title="Next in circle of fifths"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Quality selection */}
        <div className="flex gap-1 flex-wrap">
          {QUALITIES.map((quality) => (
            <button
              key={quality}
              onClick={() => handleClick(currentRoot, quality)}
              onMouseEnter={() => handleHover(currentRoot, quality)}
              className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                quality === currentQuality
                  ? 'bg-coral text-white'
                  : 'bg-background hover:bg-border text-foreground'
              }`}
            >
              {getQualityDisplayName(quality)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
