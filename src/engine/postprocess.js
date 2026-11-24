import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OpticalLensFlareShader } from './lensFlare.js';

const FilmicGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.0 },
    uContrast: { value: 1.14 },
    uSaturation: { value: 1.1 },
    uVignette: { value: 0.38 },
    uChromatic: { value: 0.0016 },
    uGrain: { value: 0.016 },
    uTime: { value: 0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uVignette;
    uniform float uChromatic;
    uniform float uGrain;
    uniform float uTime;

    varying vec2 vUv;

    vec3 acesFilmic(vec3 x) {
      const float a = 2.51;
      const float b = 0.03;
      const float c = 2.43;
      const float d = 0.59;
      const float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    vec3 linearToSRGB(vec3 c) {
      vec3 lo = c * 12.92;
      vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
      return mix(lo, hi, step(vec3(0.0031308), c));
    }

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float r2 = dot(centered, centered);

      vec2 caOffset = centered * r2 * uChromatic * 2.6;
      float r = texture2D(tDiffuse, clamp(vUv + caOffset, 0.0005, 0.9995)).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, clamp(vUv - caOffset, 0.0005, 0.9995)).b;
      vec3 col = vec3(r, g, b);

      col *= uExposure;
      col = acesFilmic(col);
      col = linearToSRGB(col);

      col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = clamp(mix(vec3(luma), col, uSaturation), 0.0, 1.0);

      float vig = 1.0 - r2 * uVignette * 1.35;
      col *= clamp(vig, 0.35, 1.0);

      float grain = (hash12(gl_FragCoord.xy + fract(uTime * 17.3) * 100.0) - 0.5) * uGrain;
      col = clamp(col + grain, 0.0, 1.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostProcessPipeline {
  constructor(renderer, scene, camera) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = renderer.getPixelRatio();

    const rt = new THREE.WebGLRenderTarget(Math.floor(width * dpr), Math.floor(height * dpr), {
      type: THREE.HalfFloatType,
      samples: 4,
    });

    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // High HDR threshold so only true luminous cores & intense specular catchlights bloom
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.34, 0.42, 1.45);
    this.composer.addPass(this.bloomPass);

    this.flarePass = new ShaderPass(OpticalLensFlareShader);
    this.flarePass.uniforms.uAspect.value = width / Math.max(1, height);
    this.composer.addPass(this.flarePass);

    this.gradePass = new ShaderPass(FilmicGradeShader);
    this.composer.addPass(this.gradePass);
  }

  resize(width, height, dpr) {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
    this.flarePass.uniforms.uAspect.value = width / Math.max(1, height);
  }

  syncFlares(flareController, time) {
    this.flarePass.uniforms.uTime.value = time;
    this.flarePass.uniforms.uFlarePositions.value = flareController.positions;
    this.flarePass.uniforms.uFlareColors.value = flareController.colors;
    this.gradePass.uniforms.uTime.value = time;
  }

  setBloomStrength(val) {
    this.bloomPass.strength = val;
  }

  setGlareStrength(val) {
    this.flarePass.uniforms.uGlareStrength.value = val;
  }

  setContrast(val) {
    this.gradePass.uniforms.uContrast.value = val;
  }

  setExposure(val) {
    this.gradePass.uniforms.uExposure.value = val;
  }

  render() {
    this.composer.render();
  }
}
