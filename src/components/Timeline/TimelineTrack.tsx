'use client';

import { Track } from '@/core/types';
import { TimelineBlock } from './TimelineBlock';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { useDragDrop } from '@/hooks/useDragDrop';

interface TimelineTrackProps {
  track: Track;
  pixelsPerBeat: number;
  beatsPerBar: number;
  totalBars: number;
}

export function TimelineTrack({
  track,
  pixelsPerBeat,
  beatsPerBar,
  totalBars,
}: TimelineTrackProps) {
  const bpm = useProjectStore((state) => state.project.bpm);
  const { selectedTrackId, selectTrack, dropTargetTrackId, dropTargetBar, dragState, trackHeightScale } =
    useUIStore();

  const trackHeight = Math.round(64 * trackHeightScale);
  const { handleDragOver, handleDragLeave, handleTimelineDrop } = useDragDrop();

  const isSelected = selectedTrackId === track.id;
  const isDropTarget = dropTargetTrackId === track.id;
  const barWidth = beatsPerBar * pixelsPerBeat;
  const trackWidth = totalBars * barWidth;

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const bar = Math.floor(x / barWidth);
    handleTimelineDrop(e, track.id, Math.max(0, Math.min(bar, totalBars - 1)));
  };

  const handleDragOverWithBar = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const bar = Math.floor(x / barWidth);
    handleDragOver(e, track.id, bar);
  };

  return (
    <div
      className={`relative border-b border-border transition-colors ${
        isSelected ? '' : 'hover:bg-muted/30'
      } ${track.muted ? 'opacity-50' : ''}`}
      style={{
        width: trackWidth,
        height: trackHeight,
        ...(isSelected ? { background: 'linear-gradient(90deg, rgba(100, 116, 139, 0.25) 0%, rgba(71, 85, 105, 0.1) 100%)' } : {}),
      }}
      onClick={() => selectTrack(track.id)}
      onDragOver={handleDragOverWithBar}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Blocks */}
      {track.blocks.map((block) => (
        <TimelineBlock
          key={block.id}
          block={block}
          track={track}
          pixelsPerBeat={pixelsPerBeat}
          beatsPerBar={beatsPerBar}
          bpm={bpm}
        />
      ))}

      {/* Drop indicator */}
      {isDropTarget && dropTargetBar !== null && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-accent-from z-10"
          style={{ left: dropTargetBar * barWidth }}
        />
      )}
    </div>
  );
}
