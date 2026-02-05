'use client';

import { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import * as THREE from 'three';
import { PluginInstance } from '@/core/types';
import { getPlugin } from '@/plugins';

interface ShaderChainProps {
  inputTexture: THREE.Texture;
  plugins: PluginInstance[];
  size?: number;
}

// Default vertex shader for fullscreen quad
const DEFAULT_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Passthrough fragment shader
const PASSTHROUGH_FRAGMENT_SHADER = `
  uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);
  }
`;

interface ShaderPassData {
  material: THREE.ShaderMaterial;
  fbo: THREE.WebGLRenderTarget;
  instance: PluginInstance;
}

export function ShaderChain({ inputTexture, plugins, size = 1024 }: ShaderChainProps) {
  const { gl } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const sceneRef = useRef(new THREE.Scene());
  const cameraRef = useRef(new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));

  // Filter to only enabled shader plugins
  const shaderPlugins = plugins.filter((instance) => {
    if (!instance.enabled) return false;
    const plugin = getPlugin(instance.pluginId);
    return plugin?.category === 'shader' && plugin.fragmentShader;
  });

  // Create FBOs and materials for each shader pass
  const passes = useMemo<ShaderPassData[]>(() => {
    return shaderPlugins.map((instance) => {
      const plugin = getPlugin(instance.pluginId)!;

      // Create uniforms from plugin settings
      const uniforms: Record<string, THREE.IUniform> = {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(size, size) },
        time: { value: 0 },
      };

      // Add settings as uniforms
      if (plugin.settingsSchema) {
        for (const key of Object.keys(plugin.settingsSchema)) {
          uniforms[key] = { value: instance.settings[key] ?? plugin.defaultSettings[key] };
        }
      }

      const material = new THREE.ShaderMaterial({
        vertexShader: plugin.vertexShader || DEFAULT_VERTEX_SHADER,
        fragmentShader: plugin.fragmentShader,
        uniforms,
      });

      const fbo = new THREE.WebGLRenderTarget(size, size, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      });

      return { material, fbo, instance };
    });
  }, [shaderPlugins.map((p) => p.pluginId).join(','), size]);

  // Update uniforms when settings change
  useEffect(() => {
    passes.forEach((pass, i) => {
      const plugin = getPlugin(pass.instance.pluginId);
      if (!plugin?.settingsSchema) return;

      const currentInstance = shaderPlugins[i];
      if (!currentInstance) return;

      for (const key of Object.keys(plugin.settingsSchema)) {
        if (pass.material.uniforms[key]) {
          pass.material.uniforms[key].value =
            currentInstance.settings[key] ?? plugin.defaultSettings[key];
        }
      }
    });
  }, [passes, shaderPlugins]);

  // Cleanup
  useEffect(() => {
    return () => {
      passes.forEach((pass) => {
        pass.material.dispose();
        pass.fbo.dispose();
      });
    };
  }, [passes]);

  // Create a simple quad geometry for rendering
  const quadGeometry = useMemo(() => new THREE.PlaneGeometry(2, 2), []);

  // Final output material
  const outputMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: DEFAULT_VERTEX_SHADER,
      fragmentShader: PASSTHROUGH_FRAGMENT_SHADER,
      uniforms: {
        tDiffuse: { value: null },
      },
      transparent: true,
    });
  }, []);

  useFrame((state) => {
    const time = state.clock.elapsedTime;

    // Update time uniform for all passes
    passes.forEach((pass) => {
      if (pass.material.uniforms.time) {
        pass.material.uniforms.time.value = time;
      }
    });

    if (passes.length === 0) {
      // No shader plugins - just pass through input
      outputMaterial.uniforms.tDiffuse.value = inputTexture;
      return;
    }

    // Chain the shader passes
    let currentTexture: THREE.Texture = inputTexture;

    const quadMesh = new THREE.Mesh(quadGeometry, passes[0].material);
    sceneRef.current.add(quadMesh);

    passes.forEach((pass, i) => {
      // Set input texture
      pass.material.uniforms.tDiffuse.value = currentTexture;

      // Render to this pass's FBO
      quadMesh.material = pass.material;
      gl.setRenderTarget(pass.fbo);
      gl.render(sceneRef.current, cameraRef.current);

      // Output becomes input for next pass
      currentTexture = pass.fbo.texture;
    });

    // Reset render target
    gl.setRenderTarget(null);

    // Clean up
    sceneRef.current.remove(quadMesh);

    // Set final output
    outputMaterial.uniforms.tDiffuse.value = currentTexture;
  });

  // Render final quad with processed texture
  return (
    <mesh ref={meshRef} position={[0, 0, -5]}>
      <planeGeometry args={[10, 10]} />
      <primitive object={outputMaterial} attach="material" />
    </mesh>
  );
}
