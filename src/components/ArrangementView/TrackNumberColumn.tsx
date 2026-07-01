'use client';

import { TrackNode } from '@/utils/tree';
import { useUIStore } from '@/stores/uiStore';

interface TrackNumberColumnProps {
  flatTracks: TrackNode[];
}

export function TrackNumberColumn({ flatTracks }: TrackNumberColumnProps) {
  const selectedTrackId = useUIStore((s) => s.selectedTrackId);
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);
  const trackHeightScale = useUIStore((s) => s.trackHeightScale);

  const trackHeight = Math.round(64 * trackHeightScale);

  return (
    <div>
      {flatTracks.map((node, i) => {
        const isPrimary = node.track.id === selectedTrackId;
        const isSelected = selectedTrackIds.has(node.track.id);

        return (
          <div
            key={node.track.id}
            style={{
              height: trackHeight,
              width: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: isPrimary ? 'rgba(203, 213, 225, 0.9)' : 'rgba(148, 163, 184, 0.5)',
              backgroundColor: isPrimary
                ? 'rgba(100, 116, 139, 0.35)'
                : isSelected
                  ? 'rgba(100, 116, 139, 0.15)'
                  : undefined,
              borderBottom: '1px solid #292929',
              borderRight: '1px solid #292929',
              userSelect: 'none',
            }}
          >
            {i + 1}
          </div>
        );
      })}
    </div>
  );
}
