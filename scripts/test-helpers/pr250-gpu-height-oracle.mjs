// Float target readback executes the production GLSL, rather than a JS port.
export async function gpuHeightOracle() {
  const THREE = await import('three');
  const { decorateGpuRoughMaterial } = await import('/site/gpu-rough-surface.js');
  const { roughProfileOffsetAtPoint } = await import('/site/surface-rendering.js');
  const renderer = new THREE.WebGLRenderer();
  if (!renderer.extensions.has('EXT_color_buffer_float'))
    throw new Error('Float height oracle requires EXT_color_buffer_float');
  const target = new THREE.WebGLRenderTarget(32, 32, {
    type: THREE.FloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;
  const results = [];
  for (const morphology of ['stochastic', 'pyramid']) {
    for (const polarity of ['normal', 'inverted']) {
      const appearance = {
        kind: 'rough',
        morphology,
        polarity,
        featureSize: 0.7,
        meanHeight: 0.35,
        etchDepth: 0.9,
        featureCv: 0.25,
        heightCv: 0.3,
        seed: 20261015,
        sampleOrigin: [0.37, -0.19],
      };
      const decorated = new THREE.MeshBasicMaterial();
      decorateGpuRoughMaterial(decorated, appearance);
      const shader = {
        vertexShader: '#include <common>',
        fragmentShader: '#include <common>',
        uniforms: {},
      };
      decorated.onBeforeCompile(shader, renderer);
      const profile = shader.fragmentShader
        .replace('#include <common>', '')
        .replace(/varying[^;]*;/g, '');
      const material = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: shader.uniforms,
        vertexShader:
          'precision highp float; in vec3 position; void main(){gl_Position=vec4(position,1.0);}',
        fragmentShader: `precision highp float; precision highp int; out vec4 outColor; ${profile}\nvoid main(){vec2 xy=(floor(gl_FragCoord.xy)-vec2(16.0))*0.21+vec2(0.013,0.027);outColor=vec4(waferCadRoughProfile(xy),0.0,0.0,1.0);}`,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      scene.add(mesh);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const data = new Float32Array(32 * 32 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 32, 32, data);
      let maximumErrorUm = 0,
        sumSquared = 0;
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const cpu = roughProfileOffsetAtPoint(
            (x - 16) * 0.21 + 0.013,
            (y - 16) * 0.21 + 0.027,
            appearance,
          );
          const error = Math.abs(data[(y * 32 + x) * 4] - cpu);
          maximumErrorUm = Math.max(maximumErrorUm, error);
          sumSquared += error * error;
        }
      }
      results.push({
        morphology,
        polarity,
        samples: 1024,
        maximumErrorUm,
        rmsErrorUm: Math.sqrt(sumSquared / 1024),
      });
      scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
      decorated.dispose();
    }
  }
  target.dispose();
  renderer.dispose();
  return results;
}
