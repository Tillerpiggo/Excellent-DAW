'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import * as THREE from 'three';
import { PluginInstance } from '@/core/types';
import { getInstrument } from '@/instruments';
import { getPlugin } from '@/plugins';
import { useProjectStore } from '@/stores/projectStore';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { TransformWrapper } from './TransformWrapper';
import { CloneWrapper } from './CloneWrapper';
import { ShaderChain } from './ShaderChain';

interface TrackRendererProps {
  trackId: string;
  instrumentId: string;
  plugins: PluginInstance[];
  isGroup?: boolean;
  childIds?: string[];
}

export function TrackRenderer({
  trackId,
  instrumentId,
  plugins,
  isGroup,
  childIds,
}: TrackRendererProps) {
  const tracks = useProjectStore((s) => s.project.tracks);
  const instrument = getInstrument(instrumentId);
  const Component = instrument?.VisualComponent;
  const { gl } = useThree();
  const rootGroupRef = useRef<THREE.Group>(null);

  // Check blackout state each frame and hide the entire group when blacked out
  useFrame(() => {
    if (!rootGroupRef.current) return;
    const engine = getVisualPlaybackEngine();
    const state = engine.getTrackState(trackId);
    rootGroupRef.current.visible = !(state?.blackedOut ?? false);
  });

  // Check if we have shader plugins (need FBO)
  const hasShaderPlugins = plugins.some((instance) => {
    if (!instance.enabled) return false;
    const plugin = getPlugin(instance.pluginId);
    return plugin?.category === 'shader';
  });

  // Check if we have clone plugins
  const hasClonePlugins = plugins.some((instance) => {
    if (!instance.enabled) return false;
    const plugin = getPlugin(instance.pluginId);
    return plugin?.category === 'clone';
  });

  // Check if we have transform plugins
  const hasTransformPlugins = plugins.some((instance) => {
    if (!instance.enabled) return false;
    const plugin = getPlugin(instance.pluginId);
    return plugin?.category === 'transform';
  });

  const hasAnyPlugins = hasShaderPlugins || hasClonePlugins || hasTransformPlugins;

  // Create FBO for rendering instrument to texture
  const fbo = useFBO(1024, 1024, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    stencilBuffer: false,
  });

  // Create a separate scene for the instrument
  const instrumentScene = useMemo(() => {
    const s = new THREE.Scene();
    // Add same lighting as main scene
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 5, 5);
    const point = new THREE.PointLight(0x8b5cf6, 0.5);
    point.position.set(-5, 5, -5);
    s.add(ambient, directional, point);
    return s;
  }, []);

  // Create a camera for rendering to FBO
  const fboCamera = useMemo(() => {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    cam.position.set(0, 0, 8);
    return cam;
  }, []);

  useFrame(() => {
    // Only render to FBO when we're actually using shaders (no clones)
    if (!hasShaderPlugins || hasClonePlugins) return;
    if (!isGroup && !Component) return;

    // Render instrument scene to FBO
    gl.setRenderTarget(fbo);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(instrumentScene, fboCamera);
    gl.setRenderTarget(null);
  });

  // Collect all visual instruments from children (for groups)
  const childVisualComponents = useMemo(() => {
    if (!isGroup || !childIds) return [];

    const components: { trackId: string; Component: React.ComponentType<{ trackId: string }> }[] =
      [];

    const collectVisuals = (ids: string[]) => {
      for (const id of ids) {
        const track = tracks[id];
        if (!track || track.muted) continue;

        if (track.instrumentId) {
          const inst = getInstrument(track.instrumentId);
          if (inst?.hasVisual && inst.VisualComponent) {
            components.push({ trackId: id, Component: inst.VisualComponent });
          }
        }

        // Recurse into children
        if (track.childIds.length > 0) {
          collectVisuals(track.childIds);
        }
      }
    };

    collectVisuals(childIds);
    return components;
  }, [isGroup, childIds, tracks]);

  // For groups without any visual children, nothing to render
  if (isGroup && childVisualComponents.length === 0) {
    return null;
  }

  // For non-groups without a component, nothing to render
  if (!isGroup && !Component) {
    return null;
  }

  // Build the base content element (instrument only, no clone wrapper)
  const buildBaseContentElement = () => {
    let element: React.ReactNode;

    if (isGroup) {
      // Render all child visual instruments
      element = (
        <>
          {childVisualComponents.map(({ trackId: childTrackId, Component: ChildComponent }) => (
            <ChildComponent key={childTrackId} trackId={childTrackId} />
          ))}
        </>
      );
    } else if (Component) {
      // Single instrument
      element = <Component trackId={trackId} />;
    } else {
      return null;
    }

    // Wrap with TransformWrapper if we have transform plugins
    if (hasTransformPlugins) {
      element = <TransformWrapper plugins={plugins}>{element}</TransformWrapper>;
    }

    return element;
  };

  // Build content with optional clone wrapper (for non-shader path)
  const buildContentElement = () => {
    let element = buildBaseContentElement();
    if (!element) return null;

    // Wrap with CloneWrapper if we have clone plugins (and no shaders)
    if (hasClonePlugins) {
      element = <CloneWrapper plugins={plugins}>{element}</CloneWrapper>;
    }

    return element;
  };

  // No plugins at all - render content directly
  if (!hasAnyPlugins) {
    if (isGroup) {
      return (
        <group ref={rootGroupRef} position={[0, 0, 0]}>
          {childVisualComponents.map(({ trackId: childTrackId, Component: ChildComponent }) => (
            <ChildComponent key={childTrackId} trackId={childTrackId} />
          ))}
        </group>
      );
    }
    if (!Component) return null;
    return (
      <group ref={rootGroupRef} position={[0, 0, 0]}>
        <Component trackId={trackId} />
      </group>
    );
  }

  // Has shader plugins - render to FBO and apply shader chain
  // Skip shaders if clone plugins are present (clones need 3D objects, not flat planes)
  if (hasShaderPlugins && !hasClonePlugins) {
    return (
      <group ref={rootGroupRef}>
        {/* Render base content to offscreen scene (portal) - no clone wrapper here */}
        {createPortal(
          <group position={[0, 0, 0]}>{buildBaseContentElement()}</group>,
          instrumentScene
        )}

        {/* Apply shader chain and render result */}
        <ShaderChain inputTexture={fbo.texture} plugins={plugins} />
      </group>
    );
  }

  // Only transform/clone plugins (no shaders) - no need for FBO
  return <group ref={rootGroupRef} position={[0, 0, 0]}>{buildContentElement()}</group>;
}
