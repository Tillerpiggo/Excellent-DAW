'use client';

import { useEffect, useRef } from 'react';
import { ChordQuality, getNoteNames, getQualityDisplayName } from '@/core/harmony';

interface ChordPickerProps {
  isOpen: boolean;
  currentRoot: number;
  currentQuality: ChordQuality;
  onSelect: (root: number, quality: ChordQuality) => void;
  onClose: () => void;
}

const QUALITIES: ChordQuality[] = [
  'major',
  'minor',
  'diminished',
  'augmented',
  'sus2',
  'sus4',
  'major7',
  'minor7',
  'dominant7',
];

export function ChordPicker({
  isOpen,
  currentRoot,
  currentQuality,
  onSelect,
  onClose,
}: ChordPickerProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const noteNames = getNoteNames();

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      // Delay to prevent immediate close from the same click that opened it
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={modalRef}
        className="bg-surface border border-border rounded-xl shadow-xl p-6 max-w-md w-full mx-4"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Select Chord</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Root note selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-muted mb-2">Root Note</label>
          <div className="grid grid-cols-6 gap-2">
            {noteNames.map((name, index) => (
              <button
                key={name}
                onClick={() => onSelect(index, currentQuality)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentRoot === index
                    ? 'bg-coral text-white'
                    : 'bg-background hover:bg-border text-foreground'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Quality selection */}
        <div>
          <label className="block text-sm font-medium text-muted mb-2">Chord Type</label>
          <div className="grid grid-cols-3 gap-2">
            {QUALITIES.map((quality) => (
              <button
                key={quality}
                onClick={() => onSelect(currentRoot, quality)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentQuality === quality
                    ? 'bg-coral text-white'
                    : 'bg-background hover:bg-border text-foreground'
                }`}
              >
                {getQualityDisplayName(quality)}
              </button>
            ))}
          </div>
        </div>

        {/* Done button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-coral text-white rounded-lg font-medium hover:bg-coral/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
