'use client';

import Link from 'next/link';
import { startTransition, useEffect, useRef, useState } from 'react';
import { DotGridAudioEngine, type DotGridCell } from '../audio/DotGridAudioEngine';
import styles from './DotGridExperience.module.css';

const GRID_ROWS = 9;
const GRID_COLS = 9;

const GRID_CELLS: DotGridCell[] = Array.from({ length: GRID_ROWS * GRID_COLS }, (_, index) => {
  const row = Math.floor(index / GRID_COLS);
  const col = index % GRID_COLS;

  return {
    id: `${row}-${col}`,
    row,
    col,
    rows: GRID_ROWS,
    cols: GRID_COLS,
  };
});

function getCellLabel(id: string): string {
  const [rowText, colText] = id.split('-');
  const row = Number(rowText);
  const col = Number(colText);

  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

function SignalStrip({
  analyser,
  active,
}: {
  analyser: AnalyserNode | null;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) {
      return;
    }

    const frequencyData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let frameId = 0;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const devicePixelRatio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width * devicePixelRatio));
      const height = Math.max(1, Math.floor(rect.height * devicePixelRatio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.clearRect(0, 0, width, height);

      const background = context.createLinearGradient(0, 0, width, 0);
      background.addColorStop(0, 'rgba(127, 228, 210, 0.1)');
      background.addColorStop(1, 'rgba(242, 196, 137, 0.12)');
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      context.beginPath();
      context.lineWidth = Math.max(2, devicePixelRatio * 1.25);
      context.strokeStyle = 'rgba(212, 248, 241, 0.9)';

      if (analyser && active && frequencyData) {
        analyser.getByteFrequencyData(frequencyData);

        const samples = 56;
        for (let index = 0; index < samples; index += 1) {
          const dataIndex = Math.floor((index / (samples - 1)) * (frequencyData.length - 1));
          const value = frequencyData[dataIndex] / 255;
          const x = (index / (samples - 1)) * width;
          const y = height - value * height * 0.84;

          if (index === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
      } else {
        for (let index = 0; index < 48; index += 1) {
          const x = (index / 47) * width;
          const y =
            height * 0.62 +
            Math.sin(index * 0.48 + performance.now() * 0.0022) * height * 0.04;

          if (index === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
      }

      context.stroke();
      frameId = window.requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [active, analyser]);

  return <canvas ref={canvasRef} className={styles.signalCanvas} aria-hidden="true" />;
}

export function DotGridExperience() {
  const engineRef = useRef<DotGridAudioEngine | null>(null);
  const [activeDotIds, setActiveDotIds] = useState<Set<string>>(new Set());
  const [playingDotId, setPlayingDotId] = useState<string | null>(null);
  const [pulseVersions, setPulseVersions] = useState<Record<string, number>>({});
  const [tempo, setTempo] = useState(78);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  useEffect(() => {
    const engine = new DotGridAudioEngine();
    engineRef.current = engine;

    const unsubscribe = engine.subscribe((dotId) => {
      startTransition(() => {
        setPlayingDotId(dotId);

        if (!dotId) {
          return;
        }

        setPulseVersions((current) => ({
          ...current,
          [dotId]: (current[dotId] ?? 0) + 1,
        }));
      });
    });

    return () => {
      unsubscribe();
      engineRef.current = null;
      void engine.destroy();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setTempo(tempo);
  }, [tempo]);

  useEffect(() => {
    const activeCells = GRID_CELLS.filter((cell) => activeDotIds.has(cell.id));
    engineRef.current?.setDots(activeCells);
  }, [activeDotIds]);

  useEffect(() => {
    engineRef.current?.setPlaying(isPlaying && activeDotIds.size > 0);
  }, [activeDotIds, isPlaying]);

  const activeCount = activeDotIds.size;
  const playingCell = GRID_CELLS.find((cell) => cell.id === playingDotId) ?? null;

  async function unlockAudio(): Promise<void> {
    const engine = engineRef.current;

    if (!engine) {
      return;
    }

    await engine.resume();
    setAudioReady(true);
    setAnalyser(engine.getAnalyser());
  }

  async function handleDotClick(cell: DotGridCell): Promise<void> {
    await unlockAudio();

    const engine = engineRef.current;
    const wasActive = activeDotIds.has(cell.id);

    if (!wasActive) {
      engine?.previewDot(cell);
    }

    setActiveDotIds((current) => {
      const next = new Set(current);

      if (next.has(cell.id)) {
        next.delete(cell.id);
      } else {
        next.add(cell.id);
      }

      return next;
    });

    if (!wasActive && activeDotIds.size === 0) {
      setIsPlaying(true);
    }

    if (wasActive && activeDotIds.size === 1) {
      setIsPlaying(false);
    }
  }

  async function handleTransportToggle(): Promise<void> {
    if (activeCount === 0) {
      return;
    }

    await unlockAudio();
    setIsPlaying((current) => !current);
  }

  function handleClear(): void {
    setActiveDotIds(new Set());
    setIsPlaying(false);
    setPlayingDotId(null);
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topBar}>
          <div className={styles.branding}>
            <div className={styles.eyebrow}>Cabin spatial sound study</div>
            <h1 className={styles.title}>
              Dot grid
              <span className={styles.titleAccent}>that plays like air and light.</span>
            </h1>
            <p className={styles.blurb}>
              Each point becomes a compact voice on a shared audio bus. Columns pan the image,
              rows tilt the spectrum, and the whole engine stays small enough for us to extend
              cleanly into EQ and music playback next.
            </p>
          </div>

          <div className={styles.controlRail}>
            <div className={styles.transportGroup}>
              <button
                className={styles.transportButton}
                type="button"
                onClick={() => void handleTransportToggle()}
                disabled={activeCount === 0}
              >
                {isPlaying ? 'Pause field' : 'Play field'}
              </button>
              <button className={styles.ghostButton} type="button" onClick={handleClear}>
                Clear
              </button>
            </div>

            <div className={styles.sliderCard}>
              <div>
                <span className={styles.sliderLabel}>Pace</span>
                <span className={styles.sliderValue}>{tempo} BPM</span>
              </div>
              <input
                className={styles.sliderTrack}
                type="range"
                min="42"
                max="180"
                value={tempo}
                onChange={(event) => setTempo(Number(event.target.value))}
                aria-label="Playback tempo"
              />
            </div>

            <div className={styles.metaCard}>
              <div>
                <span className={styles.metaLabel}>Legacy workspace</span>
                <span className={styles.metaValue}>Composer stays available</span>
              </div>
              <Link className={styles.routeLink} href="/composer">
                Open composer
              </Link>
            </div>
          </div>
        </header>

        <section className={styles.stage}>
          <div className={styles.gridStage}>
            <div className={styles.hudRow}>
              <div className={styles.hudCard}>
                <span className={styles.hintLabel}>Now sounding</span>
                <div className={styles.hudValue}>
                  {playingDotId ? getCellLabel(playingDotId) : activeCount > 0 ? 'Armed' : 'Waiting'}
                </div>
                <div className={styles.hudSubtext}>
                  {activeCount > 0 ? (
                    <>
                      <strong>{activeCount}</strong> active {activeCount === 1 ? 'dot' : 'dots'} in the
                      loop.
                    </>
                  ) : (
                    'Tap a few points to seed the sequence.'
                  )}
                </div>
              </div>

              <div className={styles.hintCard}>
                <span className={styles.hintLabel}>Signal path</span>
                <span className={styles.hintValue}>
                  Pink-noise bursts, tonal underlay, pan, pre-EQ bus, master dynamics.
                </span>
              </div>
            </div>

            <div className={styles.gridWrap}>
              <div className={styles.gridFrame}>
                {playingCell ? (
                  <div
                    className={styles.playAura}
                    style={{
                      left: `${((playingCell.col + 0.5) / GRID_COLS) * 100}%`,
                      top: `${((playingCell.row + 0.5) / GRID_ROWS) * 100}%`,
                      opacity: 1,
                    }}
                  />
                ) : null}

                <div className={styles.grid} style={{ ['--grid-cols' as string]: GRID_COLS }}>
                  {GRID_CELLS.map((cell, index) => {
                    const isActive = activeDotIds.has(cell.id);
                    const isCurrent = playingDotId === cell.id;
                    const pulseVersion = pulseVersions[cell.id] ?? 0;

                    return (
                      <button
                        key={cell.id}
                        className={styles.gridButton}
                        type="button"
                        data-active={isActive}
                        data-playing={isCurrent}
                        style={{ ['--dot-delay' as string]: `${index * 12}ms` }}
                        aria-pressed={isActive}
                        aria-label={`${isActive ? 'Deactivate' : 'Activate'} dot ${getCellLabel(cell.id)}`}
                        onClick={() => void handleDotClick(cell)}
                      >
                        {pulseVersion > 0 ? (
                          <span key={`${cell.id}-${pulseVersion}`} className={styles.dotPulse} />
                        ) : null}
                        <span className={styles.dotHalo} />
                        <span className={styles.gridDot} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className={styles.footerDock}>
              <div className={styles.signalCard}>
                <span className={styles.hintLabel}>Output trace</span>
                <SignalStrip analyser={analyser} active={audioReady && (isPlaying || activeCount > 0)} />
              </div>

              <div className={styles.footerHint}>
                <span className={styles.hintLabel}>
                  <span className={styles.statusDot} />
                  Audio state
                </span>
                <p>
                  {audioReady
                    ? 'The engine is live. Add or remove dots freely; the loop reorders itself in reading order.'
                    : 'First tap unlocks the audio engine. After that the grid responds immediately.'}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
