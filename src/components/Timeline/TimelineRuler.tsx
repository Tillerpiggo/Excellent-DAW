'use client';

interface TimelineRulerProps {
  totalBars: number;
  beatsPerBar: number;
  pixelsPerBeat: number;
}

export function TimelineRuler({
  totalBars,
  beatsPerBar,
  pixelsPerBeat,
}: TimelineRulerProps) {
  const barWidth = beatsPerBar * pixelsPerBeat;

  return (
    <div
      className="h-full flex bg-surface"
      style={{ width: totalBars * barWidth }}
    >
      {Array.from({ length: totalBars }).map((_, i) => (
        <div
          key={i}
          className="h-full border-r border-border flex items-center"
          style={{ width: barWidth }}
        >
          <span className="text-xs text-muted-foreground ml-2 font-mono">
            {i + 1}
          </span>

          {/* Beat markers */}
          <div className="flex-1 flex justify-around items-end h-full">
            {Array.from({ length: beatsPerBar - 1 }).map((_, j) => (
              <div
                key={j}
                className="w-px h-2 bg-border/50"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
