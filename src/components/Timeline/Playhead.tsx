'use client';

interface PlayheadProps {
  currentBeat: number;
  pixelsPerBeat: number;
}

export function Playhead({ currentBeat, pixelsPerBeat }: PlayheadProps) {
  const position = currentBeat * pixelsPerBeat;

  return (
    <div
      className="absolute top-0 bottom-0 w-0.5 bg-accent-to z-20 pointer-events-none transition-[left] duration-75"
      style={{ left: position }}
    >
      {/* Playhead handle */}
      <div
        className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-gradient-to-r from-accent-from to-accent-to rounded-full shadow-lg"
      />
    </div>
  );
}
