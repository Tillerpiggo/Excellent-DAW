import { VisualPlugin, PluginCategory } from './types';

// Import plugin definitions directly (no side effects)
import { RotatePlugin } from './transforms/rotate';
import { ScalePlugin } from './transforms/scale';
import { KaleidoscopePlugin } from './shaders/kaleidoscope';
import { RadialSymmetryPlugin } from './shaders/radialSymmetry';
import { PixelatePlugin } from './shaders/pixelate';
import { ChromaticAberrationPlugin } from './shaders/chromaticAberration';
import { EchoPlugin } from './clones/echo';
import { TilePlugin } from './clones/tile';

// Plugin registry - populated with all plugins
export const VISUAL_PLUGINS: Record<string, VisualPlugin> = {
  // Transforms
  [RotatePlugin.id]: RotatePlugin,
  [ScalePlugin.id]: ScalePlugin,
  // Shaders
  [KaleidoscopePlugin.id]: KaleidoscopePlugin,
  [RadialSymmetryPlugin.id]: RadialSymmetryPlugin,
  [PixelatePlugin.id]: PixelatePlugin,
  [ChromaticAberrationPlugin.id]: ChromaticAberrationPlugin,
  // Clones
  [EchoPlugin.id]: EchoPlugin,
  [TilePlugin.id]: TilePlugin,
};

export function getPlugin(id: string): VisualPlugin | undefined {
  return VISUAL_PLUGINS[id];
}

export function getPluginsByCategory(category: PluginCategory): VisualPlugin[] {
  return Object.values(VISUAL_PLUGINS).filter((p) => p.category === category);
}

export function getAllPlugins(): VisualPlugin[] {
  return Object.values(VISUAL_PLUGINS);
}
