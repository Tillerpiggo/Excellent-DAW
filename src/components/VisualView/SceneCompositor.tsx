'use client';

import { useMemo, useEffect, useRef } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import * as THREE from 'three';
import { VisualTrackInfo } from './VisualView';
import { TrackRenderer } from './TrackRenderer';
import { VisualBeatSync } from './VisualBeatSync';
import { useProjectStore } from '@/stores/projectStore';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { PluginInstance } from '@/core/types';

// Maximum number of overlay scenes the compositor shader supports
const MAX_SCENES = 8;
// Maximum strips per scene for strip mask
const MAX_STRIPS = 32;

// Shared empty texture to avoid creating new Texture() every frame
const EMPTY_TEXTURE = new THREE.Texture();

// Compositing order: main (unassigned tracks) on bottom, then named scenes
// layered on top. Masks control which portion of each scene is visible.
function generateFragmentShader(): string {
  const samplerDecls = Array.from({ length: MAX_SCENES }, (_, i) =>
    `uniform sampler2D tScene${i};`
  ).join('\n');

  const sampleFn = `
vec4 sampleScene(int idx, vec2 uv) {
${Array.from({ length: MAX_SCENES }, (_, i) =>
    `  ${i === 0 ? 'if' : 'else if'} (idx == ${i}) return texture2D(tScene${i}, uv);`
  ).join('\n')}
  return vec4(0.0);
}`;

  const maskCountDecls = Array.from({ length: MAX_SCENES }, (_, i) =>
    `uniform int maskCount${i};`
  ).join('\n');

  const getMaskCountFn = `
int getMaskCount(int idx) {
${Array.from({ length: MAX_SCENES }, (_, i) =>
    `  ${i === 0 ? 'if' : 'else if'} (idx == ${i}) return maskCount${i};`
  ).join('\n')}
  return 0;
}`;

  return /* glsl */ `
precision highp float;

uniform sampler2D tMain;
${samplerDecls}
uniform int sceneCount;

uniform vec4 maskParams[${MAX_SCENES * 4 * 2}];
uniform vec4 stripData[${MAX_SCENES * (MAX_STRIPS / 4)}];
${maskCountDecls}

varying vec2 vUv;

#define PI 3.14159265359
#define MAX_STRIPS ${MAX_STRIPS}

${sampleFn}
${getMaskCountFn}

float splitMask(vec2 uv, float position, float angle, float feather, float invert) {
  float rad = angle * PI / 180.0;
  float cosA = cos(rad);
  float sinA = sin(rad);
  vec2 centered = uv - 0.5;
  float projected = centered.x * cosA + centered.y * sinA;
  float edge = position - 0.5;
  float alpha = smoothstep(edge - feather, edge + feather, projected);
  return mix(alpha, 1.0 - alpha, invert);
}

float slantedBarsMask(vec2 uv, float count, float angle, float thickness, float offset) {
  float rad = angle * PI / 180.0;
  float cosA = cos(rad);
  float sinA = sin(rad);
  float projected = uv.x * cosA + uv.y * sinA;
  float bar = fract(projected * count + offset);
  return step(bar, thickness);
}

float circleWipeMask(vec2 uv, float radius, float centerX, float centerY, float feather) {
  vec2 center = vec2(centerX, centerY);
  float dist = length(uv - center);
  return 1.0 - smoothstep(radius - feather, radius + feather, dist);
}

float radialMask(vec2 uv, float segments, float rotation, float offset) {
  vec2 centered = uv - 0.5;
  float angle = atan(centered.y, centered.x) + rotation * PI / 180.0;
  float segAngle = angle * segments / (2.0 * PI);
  float bar = fract(segAngle + offset);
  return step(bar, 0.5);
}

float gradientMask(vec2 uv, float direction, float softness, float position) {
  float rad = direction * PI / 180.0;
  float cosA = cos(rad);
  float sinA = sin(rad);
  vec2 centered = uv - 0.5;
  float projected = centered.x * cosA + centered.y * sinA + 0.5;
  return smoothstep(position - softness, position + softness, projected);
}

float getStripState(int sceneIdx, int stripIdx) {
  int vecIdx = sceneIdx * (MAX_STRIPS / 4) + stripIdx / 4;
  int comp = stripIdx - (stripIdx / 4) * 4;
  vec4 v = stripData[vecIdx];
  if (comp == 0) return v.x;
  if (comp == 1) return v.y;
  if (comp == 2) return v.z;
  return v.w;
}

float stripMaskFn(vec2 uv, int sceneIdx, float stripCount, float angle, float feather) {
  float rad = angle * PI / 180.0;
  float cosA = cos(rad);
  float sinA = sin(rad);
  // Center around screen middle, project along angle
  vec2 centered = uv - 0.5;
  float projected = centered.x * cosA + centered.y * sinA;
  // Half-extent of the projection at this angle (covers full screen)
  float extent = abs(cosA) * 0.5 + abs(sinA) * 0.5;
  // Map from [-extent, extent] to [0, 1]
  float normalized = (projected + extent) / (2.0 * extent);
  float stripF = normalized * stripCount;
  int strip = int(floor(stripF));
  if (strip < 0 || strip >= int(stripCount)) return 0.0;
  float isOn = getStripState(sceneIdx, strip);
  // Feather at strip edges
  float inStrip = fract(stripF);
  float edge = feather * stripCount;
  float edgeMask = smoothstep(0.0, edge, inStrip) * smoothstep(0.0, edge, 1.0 - inStrip);
  return isOn * edgeMask;
}

float evaluateMask(int maskType, vec4 p1, vec4 p2, int sceneIdx) {
  if (maskType == 1) return splitMask(vUv, p1.y, p1.z, p1.w, p2.x);
  if (maskType == 2) return slantedBarsMask(vUv, p1.y, p1.z, p1.w, p2.x);
  if (maskType == 3) return circleWipeMask(vUv, p1.y, p1.z, p1.w, p2.x);
  if (maskType == 4) return radialMask(vUv, p1.y, p1.z, p1.w);
  if (maskType == 5) return gradientMask(vUv, p1.y, p1.z, p1.w);
  if (maskType == 6) return stripMaskFn(vUv, sceneIdx, p1.y, p1.z, p1.w);
  return 1.0;
}

void main() {
  // Start with the main (unassigned) scene as the base layer
  vec4 result = texture2D(tMain, vUv);

  // Layer named scenes on top — masks control visible region
  for (int i = 0; i < ${MAX_SCENES}; i++) {
    if (i >= sceneCount) break;

    vec4 sceneColor = sampleScene(i, vUv);

    // Compute combined mask (multiply all masks for this scene)
    float mask = 1.0;
    int mCount = getMaskCount(i);
    for (int m = 0; m < 4; m++) {
      if (m >= mCount) break;
      int baseIdx = (i * 4 + m) * 2;
      vec4 p1 = maskParams[baseIdx];
      vec4 p2 = maskParams[baseIdx + 1];
      int maskType = int(p1.x);
      if (maskType > 0) {
        mask *= evaluateMask(maskType, p1, p2, i);
      }
    }

    // Where mask=1 the scene fully covers what's below,
    // where mask=0 the layer below shows through
    float alpha = sceneColor.a * mask;
    result = vec4(mix(result.rgb, sceneColor.rgb, alpha), max(result.a, alpha));
  }

  gl_FragColor = result;
}
`;
}

const compositorFragmentShader = generateFragmentShader();

const compositorVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

function getMaskTypeIndex(instrumentId: string): number {
  switch (instrumentId) {
    case 'splitMask': return 1;
    case 'slantedBarsMask': return 2;
    case 'circleWipeMask': return 3;
    case 'radialMask': return 4;
    case 'gradientMask': return 5;
    case 'stripMask': return 6;
    default: return 0;
  }
}

function getMaskShaderParams(instrumentId: string, params: Record<string, unknown>): [number, number, number, number, number] {
  const n = (key: string, def: number) => (params[key] as number) ?? def;
  switch (instrumentId) {
    case 'splitMask':
      return [n('position', 0.5), n('angle', 0), n('feather', 0.01), n('invert', 0), 0];
    case 'slantedBarsMask':
      return [n('count', 5), n('angle', 45), n('thickness', 0.5), n('offset', 0), 0];
    case 'circleWipeMask':
      return [n('radius', 0.5), n('centerX', 0.5), n('centerY', 0.5), n('feather', 0.02), 0];
    case 'radialMask':
      return [n('segments', 6), n('rotation', 0), n('offset', 0.5), 0, 0];
    case 'gradientMask':
      return [n('direction', 0), n('softness', 0.3), n('position', 0.5), 0, 0];
    case 'stripMask':
      return [n('stripCount', 8), n('angle', 0), n('feather', 0.005), 0, 0];
    default:
      return [0, 0, 0, 0, 0];
  }
}

interface SceneCompositorProps {
  allTracks: VisualTrackInfo[];
  rootScenes: string[];
}

export function SceneCompositor({ allTracks, rootScenes }: SceneCompositorProps) {
  const { gl, camera, size } = useThree();
  const storeTracks = useProjectStore((s) => s.project.tracks);
  const quadRef = useRef<THREE.Mesh>(null);
  // Ref map: trackId → THREE.Group for per-frame visibility toggling
  const trackGroupRefs = useRef<Map<string, THREE.Group>>(new Map());

  // FBO for the main (unassigned) scene
  const mainFBO = useMemo(() =>
    new THREE.WebGLRenderTarget(size.width || 1024, size.height || 1024, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  // Single shared Three.js scene for ALL tracks — visibility toggled per-frame
  const sharedScene = useMemo(() => {
    const s = new THREE.Scene();
    s.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 5, 5);
    s.add(dir);
    const pt = new THREE.PointLight(0x8b5cf6, 0.5);
    pt.position.set(-5, 5, -5);
    s.add(pt);
    return s;
  }, []);

  // One FBO per named scene
  const sceneCount = rootScenes.length;
  const sceneFBOs = useMemo(() => {
    return rootScenes.map(() =>
      new THREE.WebGLRenderTarget(size.width || 1024, size.height || 1024, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        stencilBuffer: false,
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneCount]);

  // Resize all FBOs when canvas size changes
  useEffect(() => {
    mainFBO.setSize(size.width, size.height);
    for (const fbo of sceneFBOs) {
      fbo.setSize(size.width, size.height);
    }
  }, [size, mainFBO, sceneFBOs]);

  // Dispose FBOs on unmount
  useEffect(() => {
    return () => {
      mainFBO.dispose();
      for (const fbo of sceneFBOs) {
        fbo.dispose();
      }
    };
  }, [mainFBO, sceneFBOs]);

  // Derive plugins for all tracks
  const pluginsByTrack = useMemo(() => {
    const result: Record<string, PluginInstance[]> = {};
    for (const track of allTracks) {
      result[track.id] = storeTracks[track.id]?.visualPlugins ?? [];
    }
    return result;
  }, [storeTracks, allTracks]);

  // Compositor shader material
  const compositorMaterial = useMemo(() => {
    const uniforms: Record<string, { value: unknown }> = {
      tMain: { value: mainFBO.texture },
      sceneCount: { value: sceneCount },
      maskParams: { value: new Array(MAX_SCENES * 4 * 2).fill(null).map(() => new THREE.Vector4(0, 0, 0, 0)) },
      stripData: { value: new Array(MAX_SCENES * (MAX_STRIPS / 4)).fill(null).map(() => new THREE.Vector4(0, 0, 0, 0)) },
    };

    for (let i = 0; i < MAX_SCENES; i++) {
      uniforms[`tScene${i}`] = { value: sceneFBOs[i]?.texture ?? EMPTY_TEXTURE };
      uniforms[`maskCount${i}`] = { value: 0 };
    }

    return new THREE.ShaderMaterial({
      vertexShader: compositorVertexShader,
      fragmentShader: compositorFragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainFBO, sceneFBOs.length]);

  // Per-frame: determine scene membership, toggle visibility, render FBOs.
  useFrame(() => {
    const engine = getVisualPlaybackEngine();
    const refs = trackGroupRefs.current;

    // Build per-frame scene assignments: trackId → sceneId (undefined = main)
    const getEffectiveSceneId = (track: VisualTrackInfo): string | undefined => {
      // Check for dynamic override from SceneRouter
      const dynamicIdx = engine.getDynamicSceneIndex(track.id);
      if (dynamicIdx !== undefined) {
        if (dynamicIdx === 0) return undefined; // Main
        const sceneId = rootScenes[dynamicIdx - 1];
        if (sceneId) return sceneId;
      }
      // Fall back to static assignment
      return track.sceneId;
    };

    // 1. Render main (unassigned) tracks to mainFBO
    for (const track of allTracks) {
      const group = refs.get(track.id);
      if (group) group.visible = !getEffectiveSceneId(track);
    }
    gl.setRenderTarget(mainFBO);
    gl.setClearColor(0x0a0a0f, 1);
    gl.clear();
    gl.render(sharedScene, camera);
    gl.setRenderTarget(null);

    // 2. Render each non-muted scene to its FBO, packing into contiguous shader slots
    let activeSlot = 0;
    for (let i = 0; i < rootScenes.length && i < MAX_SCENES; i++) {
      const sceneId = rootScenes[i];
      const sceneTrack = storeTracks[sceneId];
      const fbo = sceneFBOs[i];
      if (!fbo) continue;

      // Skip muted or blacked-out scenes entirely
      if (sceneTrack?.muted) continue;
      if (engine.isSceneBlackedOut(sceneId)) continue;

      // Check if this scene has a SceneCopy child
      const copyState = engine.getSceneCopyState(sceneId);

      if (copyState) {
        // SceneCopy: render the SOURCE scene's tracks with a custom camera
        const sourceIdx = copyState.sourceSceneIndex;
        // Determine which scene's tracks to show
        // sourceIdx 0 = Main (unassigned), 1+ = rootScenes[sourceIdx - 1]
        const sourceSceneId = sourceIdx === 0 ? undefined : rootScenes[sourceIdx - 1];

        for (const track of allTracks) {
          const group = refs.get(track.id);
          if (!group) continue;
          const effectiveScene = getEffectiveSceneId(track);
          // Show tracks belonging to the source scene
          group.visible = sourceSceneId === undefined
            ? !effectiveScene  // Main = unassigned tracks
            : effectiveScene === sourceSceneId;
        }

        // Save camera state
        const savedPos = camera.position.clone();
        const savedRot = camera.rotation.clone();
        const perspCam = camera instanceof THREE.PerspectiveCamera ? camera : null;
        const savedFov = perspCam?.fov ?? 50;

        // Apply SceneCopy camera params
        const p = copyState.params;
        const deg2rad = Math.PI / 180;
        camera.position.set(
          (p.posX as number) ?? 0,
          (p.posY as number) ?? 0,
          (p.posZ as number) ?? 8,
        );
        camera.rotation.set(
          ((p.rotX as number) ?? 0) * deg2rad,
          ((p.rotY as number) ?? 0) * deg2rad,
          ((p.rotZ as number) ?? 0) * deg2rad,
        );
        const newFov = (p.fov as number) ?? 50;
        if (perspCam && perspCam.fov !== newFov) {
          perspCam.fov = newFov;
          perspCam.updateProjectionMatrix();
        }

        const isOpaque = sceneTrack?.sceneOpaque ?? false;
        gl.setRenderTarget(fbo);
        gl.setClearColor(isOpaque ? 0x0a0a0f : 0x000000, isOpaque ? 1 : 0);
        gl.clear();
        gl.render(sharedScene, camera);
        gl.setRenderTarget(null);

        // Restore camera state
        camera.position.copy(savedPos);
        camera.rotation.copy(savedRot);
        if (perspCam && perspCam.fov !== savedFov) {
          perspCam.fov = savedFov;
          perspCam.updateProjectionMatrix();
        }
      } else {
        // Normal scene render: show this scene's own tracks
        for (const track of allTracks) {
          const group = refs.get(track.id);
          if (group) group.visible = getEffectiveSceneId(track) === sceneId;
        }

        const isOpaque = sceneTrack?.sceneOpaque ?? false;
        gl.setRenderTarget(fbo);
        gl.setClearColor(isOpaque ? 0x0a0a0f : 0x000000, isOpaque ? 1 : 0);
        gl.clear();
        gl.render(sharedScene, camera);
        gl.setRenderTarget(null);
      }

      // Assign this scene's texture to the next active shader slot
      compositorMaterial.uniforms[`tScene${activeSlot}`].value = fbo.texture;

      // Update mask uniforms for this slot
      const maskStates = engine.getMaskStatesForScene(sceneId);
      compositorMaterial.uniforms[`maskCount${activeSlot}`].value = Math.min(maskStates.length, 4);

      // Clear strip data for this slot
      const stripBase = activeSlot * (MAX_STRIPS / 4);
      for (let s = 0; s < MAX_STRIPS / 4; s++) {
        compositorMaterial.uniforms.stripData.value[stripBase + s].set(0, 0, 0, 0);
      }

      for (let m = 0; m < 4; m++) {
        const baseIdx = (activeSlot * 4 + m) * 2;
        if (m < maskStates.length) {
          const mask = maskStates[m];
          const typeIdx = getMaskTypeIndex(mask.instrumentId);
          const [p1, p2, p3, p4, p5] = getMaskShaderParams(mask.instrumentId, mask.params);
          compositorMaterial.uniforms.maskParams.value[baseIdx].set(typeIdx, p1, p2, p3);
          compositorMaterial.uniforms.maskParams.value[baseIdx + 1].set(p4, p5, 0, 0);

          // Populate strip data from active notes for strip masks
          if (mask.instrumentId === 'stripMask') {
            const stripCount = (mask.params.stripCount as number) ?? 8;
            for (const [pitch] of mask.activeNotes) {
              if (pitch >= 0 && pitch < stripCount) {
                const vecIdx = stripBase + Math.floor(pitch / 4);
                const comp = pitch % 4;
                const vec = compositorMaterial.uniforms.stripData.value[vecIdx];
                if (comp === 0) vec.x = 1;
                else if (comp === 1) vec.y = 1;
                else if (comp === 2) vec.z = 1;
                else vec.w = 1;
              }
            }
          }
        } else {
          compositorMaterial.uniforms.maskParams.value[baseIdx].set(0, 0, 0, 0);
          compositorMaterial.uniforms.maskParams.value[baseIdx + 1].set(0, 0, 0, 0);
        }
      }

      activeSlot++;
    }

    // 3. Hide all tracks after scene renders (so R3F's own pass only draws the compositor quad)
    for (const track of allTracks) {
      const group = refs.get(track.id);
      if (group) group.visible = false;
    }

    // 4. Update remaining uniforms
    compositorMaterial.uniforms.tMain.value = mainFBO.texture;
    for (let i = activeSlot; i < MAX_SCENES; i++) {
      compositorMaterial.uniforms[`tScene${i}`].value = EMPTY_TEXTURE;
      compositorMaterial.uniforms[`maskCount${i}`].value = 0;
    }
    compositorMaterial.uniforms.sceneCount.value = activeSlot;
  });

  return (
    <>
      {/* Beat sync for visual state computation */}
      <VisualBeatSync />

      {/* Fullscreen compositor quad — rendered by R3F's normal render pass.
          Uses clip-space vertex shader so it fills the screen regardless of camera. */}
      <mesh ref={quadRef} frustumCulled={false} renderOrder={9999}>
        <planeGeometry args={[2, 2]} />
        <primitive object={compositorMaterial} attach="material" />
      </mesh>

      {/* Portal ALL tracks into the shared offscreen scene — visibility toggled per-frame */}
      {createPortal(
        <>
          {allTracks.map((track) => (
            <group
              key={track.id}
              ref={(g: THREE.Group | null) => {
                if (g) trackGroupRefs.current.set(track.id, g);
                else trackGroupRefs.current.delete(track.id);
              }}
            >
              <TrackRenderer
                trackId={track.id}
                instrumentId={track.instrumentId}
                plugins={pluginsByTrack[track.id] ?? []}
                isGroup={track.isGroup}
                childIds={track.childIds}
              />
            </group>
          ))}
        </>,
        sharedScene
      )}
    </>
  );
}
