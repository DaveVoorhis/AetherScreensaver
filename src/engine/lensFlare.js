import * as THREE from 'three';

export const MAX_FLARES = 6;

/**
 * Projects active luminous 3D emitters into NDC space and updates uniforms
 * for the HDR Optical Lens Flare ShaderPass.
 * Strictly obeys the 1-pixel lifecycle rule: flare intensity & halo radius
 * scale directly from each emitter's organic growth scalar (0 at 1px seed).
 */
export class LensFlareController {
  constructor() {
    this.positions = Array.from({ length: MAX_FLARES }, () => new THREE.Vector4(0, 0, 0, 0));
    this.colors = Array.from({ length: MAX_FLARES }, () => new THREE.Vector3(1, 1, 1));
    this.globalStrength = 0.85;
    this._proj = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._toEmitter = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
  }

  update(emitters, camera) {
    camera.getWorldPosition(this._camPos);
    camera.getWorldDirection(this._camDir);

    const scored = [];
    for (const e of emitters) {
      if (!e || e.life <= 0.002 || e.strength <= 0.001) continue;
      this._toEmitter.copy(e.position).sub(this._camPos);
      const dist = this._toEmitter.length();
      if (dist < 0.2) continue;
      const forwardDot = this._toEmitter.dot(this._camDir) / dist;
      if (forwardDot <= 0.05) continue;

      this._proj.copy(e.position).project(camera);
      const edgeDist = Math.max(Math.abs(this._proj.x), Math.abs(this._proj.y));
      const edgeFade = 1 - THREE.MathUtils.smoothstep(edgeDist, 0.85, 1.38);
      if (edgeFade <= 0.001) continue;

      const lifeCurve = e.life * e.life;
      const intensity = e.strength * lifeCurve * edgeFade * this.globalStrength * (5.2 / (dist + 4.5));
      if (intensity <= 0.002) continue;

      scored.push({
        ndcX: this._proj.x,
        ndcY: this._proj.y,
        intensity,
        life: e.life,
        color: e.color,
      });
    }

    scored.sort((a, b) => b.intensity - a.intensity);

    for (let i = 0; i < MAX_FLARES; i++) {
      if (i < scored.length) {
        const s = scored[i];
        this.positions[i].set(s.ndcX, s.ndcY, s.intensity, s.life);
        this.colors[i].set(s.color.r, s.color.g, s.color.b);
      } else {
        this.positions[i].set(0, 0, 0, 0);
        this.colors[i].set(0, 0, 0);
      }
    }
  }
}

/**
 * HDR Cinema Lens Flare + Anamorphic Streak Shader
 * Renders physically-inspired multi-element lens reflections:
 * - Tight optical corona that preserves sculpture clarity
 * - 6-blade aperture diffraction starburst
 * - Silky-smooth horizontal anamorphic streak glare
 * - Opposite-axis chromatic bokeh rings & hexagonal iris ghosts
 */
export const OpticalLensFlareShader = {
  uniforms: {
    tDiffuse: { value: null },
    uAspect: { value: 1.777 },
    uTime: { value: 0 },
    uFlarePositions: { value: Array.from({ length: MAX_FLARES }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uFlareColors: { value: Array.from({ length: MAX_FLARES }, () => new THREE.Vector3(1, 1, 1)) },
    uGlareStrength: { value: 0.45 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    #define MAX_FLARES 6
    uniform sampler2D tDiffuse;
    uniform float uAspect;
    uniform float uTime;
    uniform vec4 uFlarePositions[MAX_FLARES];
    uniform vec3 uFlareColors[MAX_FLARES];
    uniform float uGlareStrength;

    varying vec2 vUv;

    float hexDist(vec2 p) {
      p = abs(p);
      float c = dot(p, normalize(vec2(1.0, 1.7320508)));
      return max(c, p.x);
    }

    vec3 computeSingleFlare(vec2 p, vec2 lPos, vec3 col, float intensity, float life) {
      vec3 acc = vec3(0.0);
      vec2 d = p - lPos;
      float dist = length(d);

      // 1. Crisp pinpoint optical core + delicate controlled corona
      float core = exp(-dist * 24.0) * 0.42 + exp(-dist * 7.5) * 0.11;
      acc += (col * 0.72 + vec3(0.28)) * core * intensity;

      // 2. 6-point cinema aperture diffraction starburst
      float angle = atan(d.y, d.x) + 0.22;
      float rays = pow(abs(cos(angle * 3.0)), 22.0) * exp(-dist * 8.0) * 0.34;
      float fineRays = pow(abs(cos(angle * 6.0 + 0.5)), 42.0) * exp(-dist * 11.0) * 0.18;
      acc += mix(col, vec3(1.0), 0.45) * (rays + fineRays) * intensity;

      // 3. Silky-smooth horizontal anamorphic streak glare (analytic, zero aliasing)
      float anamorphicX = exp(-abs(d.x) * 2.2);
      float anamorphicY = exp(-abs(d.y) * 62.0);
      float anamorphicHaloY = exp(-abs(d.y) * 18.0) * 0.18;
      vec3 streakCol = mix(col, vec3(0.55, 0.80, 1.0), 0.45);
      acc += streakCol * anamorphicX * (anamorphicY + anamorphicHaloY) * intensity * (0.28 + 0.85 * uGlareStrength);

      // 4. Multi-element chromatic optical ghosts along the axis through screen center
      float offCenter = clamp(length(lPos), 0.0, 1.2);
      float ghostEnergy = intensity * life * (0.35 + 0.75 * offCenter);

      // Ghost A: Chromatic dispersed ring across center
      vec2 g1 = -lPos * 0.54;
      float r1R = length(p - g1 * 0.972);
      float r1G = length(p - g1);
      float r1B = length(p - g1 * 1.028);
      float ringR = smoothstep(0.11, 0.095, r1R) * smoothstep(0.068, 0.092, r1R);
      float ringG = smoothstep(0.11, 0.095, r1G) * smoothstep(0.068, 0.092, r1G);
      float ringB = smoothstep(0.11, 0.095, r1B) * smoothstep(0.068, 0.092, r1B);
      acc += vec3(ringR * 1.15, ringG * 0.95, ringB * 1.2) * (col * 0.55 + 0.45) * ghostEnergy * 0.18;

      // Ghost B: Soft hexagonal iris bokeh
      vec2 g2 = -lPos * 0.92;
      float h2 = hexDist((p - g2) * 8.2);
      float hex2 = smoothstep(1.05, 0.62, h2) * (0.55 + 0.45 * smoothstep(0.55, 0.95, h2));
      acc += mix(col, vec3(0.7, 0.9, 1.0), 0.35) * hex2 * ghostEnergy * 0.12;

      // Ghost C: Crisp warm inner reflection
      vec2 g3 = lPos * 0.38;
      float h3 = hexDist((p - g3) * 18.0);
      float hex3 = smoothstep(1.0, 0.35, h3);
      acc += mix(col, vec3(1.0, 0.88, 0.72), 0.4) * hex3 * ghostEnergy * 0.14;

      // Ghost D: Distant subtle chromatic aperture disc
      vec2 g4 = -lPos * 1.32;
      float d4R = length(p - g4 * 0.985);
      float d4G = length(p - g4);
      float d4B = length(p - g4 * 1.015);
      vec3 disc4 = vec3(
        smoothstep(0.17, 0.02, d4R),
        smoothstep(0.165, 0.02, d4G),
        smoothstep(0.16, 0.02, d4B)
      );
      acc += disc4 * (col * 0.5 + 0.5) * ghostEnergy * 0.08;

      // Ghost E: Large ultra-delicate rainbow lens halo
      float haloR = exp(-pow((dist - 0.36) * 15.0, 2.0));
      float haloG = exp(-pow((dist - 0.38) * 15.0, 2.0));
      float haloB = exp(-pow((dist - 0.40) * 15.0, 2.0));
      acc += vec3(haloR, haloG, haloB) * (col * 0.45 + 0.55) * ghostEnergy * 0.055;

      return acc;
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);

      vec2 p = (vUv * 2.0 - 1.0);
      p.x *= uAspect;

      vec3 flare = vec3(0.0);
      for (int i = 0; i < MAX_FLARES; i++) {
        vec4 fp = uFlarePositions[i];
        if (fp.z > 0.001) {
          vec2 lPos = vec2(fp.x * uAspect, fp.y);
          flare += computeSingleFlare(p, lPos, uFlareColors[i], fp.z, fp.w);
        }
      }

      // Smooth continuous horizontal specular streak on HDR glints (fine non-dotted sampling)
      if (uGlareStrength > 0.01) {
        vec3 specStreak = vec3(0.0);
        float texelX = 1.0 / 1280.0;
        for (int s = -10; s <= 10; s++) {
          float fs = float(s);
          vec2 offset = vec2(fs * texelX * 2.4, 0.0);
          vec3 sampleCol = texture2D(tDiffuse, clamp(vUv + offset, 0.001, 0.999)).rgb;
          float lum = dot(sampleCol, vec3(0.2126, 0.7152, 0.0722));
          float bright = max(0.0, lum - 1.9);
          float w = exp(-abs(fs) * 0.24);
          specStreak += sampleCol * (bright / (lum + 0.001)) * w;
        }
        flare += specStreak * vec3(0.80, 0.91, 1.12) * 0.022 * uGlareStrength;
      }

      gl_FragColor = vec4(base.rgb + flare, base.a);
    }
  `,
};
