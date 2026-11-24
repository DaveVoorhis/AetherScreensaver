import * as THREE from 'three';
import { TAU, randInt, randRange, pick } from './math.js';

/**
 * Composable 3D parametric path generators.
 * Each generator returns { name, closed, eval(u, time, targetVec) } where
 * u in [0, 1] traverses the path and `time` smoothly animates phase/breathing.
 */

export function createTorusKnotPath(opts = {}) {
  const p = opts.p ?? pick([2, 3, 4, 5]);
  const q = opts.q ?? pick([3, 5, 7, 2].filter((v) => v !== p));
  const R = opts.R ?? randRange(2.4, 3.6);
  const r = opts.r ?? randRange(0.75, 1.35);
  const speed = opts.speed ?? randRange(0.12, 0.28);
  const phase = opts.phase ?? randRange(0, TAU);
  const twist = opts.twist ?? randRange(0.15, 0.4);

  return {
    name: `Torus Knot (${p}:${q})`,
    closed: true,
    eval(u, time, out = new THREE.Vector3()) {
      const t = u * TAU + phase + time * speed;
      const breath = 1 + Math.sin(time * 0.45 + u * TAU) * 0.08;
      const cosQ = Math.cos(q * t);
      const sinQ = Math.sin(q * t);
      const rad = (R + r * cosQ) * breath;
      const x = rad * Math.cos(p * t);
      const y = r * sinQ * 1.35 * breath;
      const z = rad * Math.sin(p * t);

      // Gentle global precession twist
      const tw = time * twist * 0.25;
      const ct = Math.cos(tw);
      const st = Math.sin(tw);
      return out.set(x * ct - z * st, y, x * st + z * ct);
    },
  };
}

export function createLissajousPath(opts = {}) {
  const fx = opts.fx ?? randInt(1, 4);
  const fy = opts.fy ?? randInt(2, 5);
  const fz = opts.fz ?? randInt(1, 4);
  const ax = opts.ax ?? randRange(2.8, 4.2);
  const ay = opts.ay ?? randRange(2.0, 3.3);
  const az = opts.az ?? randRange(2.8, 4.2);
  const px = opts.px ?? randRange(0, TAU);
  const py = opts.py ?? randRange(0, TAU);
  const pz = opts.pz ?? randRange(0, TAU);
  const drift = opts.drift ?? randRange(0.14, 0.28);

  return {
    name: `Lissajous (${fx}:${fy}:${fz})`,
    closed: true,
    eval(u, time, out = new THREE.Vector3()) {
      const a = u * TAU;
      const dt = time * drift;
      return out.set(
        Math.sin(fx * a + px + dt) * ax,
        Math.sin(fy * a + py + dt * 0.7) * ay,
        Math.cos(fz * a + pz - dt * 0.55) * az
      );
    },
  };
}

export function createHelixPath(opts = {}) {
  const radius = opts.radius ?? randRange(1.7, 3.0);
  const height = opts.height ?? randRange(5.2, 7.6);
  const turns = opts.turns ?? randRange(2.0, 3.8);
  const strandOffset = opts.strandOffset ?? 0;
  const speed = opts.speed ?? randRange(0.25, 0.5);
  const waveAmp = opts.waveAmp ?? randRange(0.2, 0.55);

  return {
    name: 'Helical Strand',
    closed: false,
    eval(u, time, out = new THREE.Vector3()) {
      const s = u - 0.5;
      const angle = u * turns * TAU + strandOffset + time * speed;
      const taper = Math.sin(u * Math.PI); // Smooth tapered envelope
      const rad = radius * (0.45 + 0.65 * taper) + Math.sin(u * TAU * 2 - time * 0.8) * waveAmp;
      return out.set(Math.cos(angle) * rad, s * height, Math.sin(angle) * rad);
    },
  };
}

export function createRoseOrbitPath(opts = {}) {
  const k = opts.k ?? pick([2, 3, 4, 5, 1.5, 2.5]);
  const R = opts.R ?? randRange(3.2, 4.4);
  const zAmp = opts.zAmp ?? randRange(1.2, 2.2);
  const speed = opts.speed ?? randRange(0.14, 0.26);
  const phase = opts.phase ?? randRange(0, TAU);

  return {
    name: 'Rhodonea Orbit',
    closed: true,
    eval(u, time, out = new THREE.Vector3()) {
      const t = u * TAU * 2 + phase + time * speed;
      const r = Math.cos(k * t) * R;
      const x = r * Math.cos(t);
      const z = r * Math.sin(t);
      const y = Math.sin(k * t * 1.5 + time * 0.5) * zAmp;
      return out.set(x, y, z);
    },
  };
}

export function createEpitrochoidPath(opts = {}) {
  const R = opts.R ?? randRange(2.0, 2.8);
  const r = opts.r ?? randRange(0.65, 1.15);
  const d = opts.d ?? randRange(1.1, 1.9);
  const ratio = opts.ratio ?? pick([3, 4, 5, 6]);
  const zAmp = opts.zAmp ?? randRange(0.9, 1.8);
  const speed = opts.speed ?? randRange(0.15, 0.28);

  return {
    name: 'Celestial Epicycle',
    closed: true,
    eval(u, time, out = new THREE.Vector3()) {
      const t = u * TAU + time * speed;
      const x = (R + r) * Math.cos(t) - d * Math.cos(ratio * t + time * 0.35);
      const z = (R + r) * Math.sin(t) - d * Math.sin(ratio * t + time * 0.35);
      const y = Math.sin(ratio * t - time * 0.5) * zAmp;
      return out.set(x * 0.88, y, z * 0.88);
    },
  };
}

export function createOrbitalRingPath(opts = {}) {
  const radius = opts.radius ?? randRange(2.4, 4.4);
  const ecc = opts.ecc ?? randRange(0.0, 0.28);
  const tiltX = opts.tiltX ?? randRange(-1.1, 1.1);
  const tiltZ = opts.tiltZ ?? randRange(-1.1, 1.1);
  const speed = opts.speed ?? randRange(0.18, 0.42) * (Math.random() < 0.5 ? 1 : -1);
  const precess = opts.precess ?? randRange(0.08, 0.22);

  const euler = new THREE.Euler(tiltX, 0, tiltZ);
  const quat = new THREE.Quaternion();

  return {
    name: 'Astrolabe Ring',
    closed: true,
    eval(u, time, out = new THREE.Vector3()) {
      const a = u * TAU + time * speed;
      out.set(Math.cos(a) * radius * (1 + ecc), Math.sin(a * 2 + time * 0.5) * 0.14, Math.sin(a) * radius * (1 - ecc));
      euler.set(tiltX + Math.sin(time * precess) * 0.25, time * precess * 0.6, tiltZ + Math.cos(time * precess) * 0.25);
      quat.setFromEuler(euler);
      return out.applyQuaternion(quat);
    },
  };
}

export function createLemniscate3DPath(opts = {}) {
  const scale = opts.scale ?? randRange(3.2, 4.5);
  const yScale = opts.yScale ?? randRange(1.1, 2.0);
  const speed = opts.speed ?? randRange(0.18, 0.32);
  const phase = opts.phase ?? randRange(0, TAU);

  return {
    name: 'Infinity Ribbon',
    closed: true,
    eval(u, time, out = new THREE.Vector3()) {
      const t = u * TAU + phase + time * speed;
      const denom = 1 + Math.sin(t) * Math.sin(t);
      const x = (scale * Math.cos(t)) / denom;
      const z = (scale * Math.sin(t) * Math.cos(t)) / denom;
      const y = Math.sin(2 * t + time * 0.45) * yScale;
      return out.set(x, y, z);
    },
  };
}

export function createSpiralVortexPath(opts = {}) {
  const maxR = opts.maxR ?? randRange(3.4, 4.6);
  const height = opts.height ?? randRange(3.8, 5.8);
  const turns = opts.turns ?? randRange(2.5, 4.5);
  const speed = opts.speed ?? randRange(0.22, 0.42);
  const phase = opts.phase ?? randRange(0, TAU);

  return {
    name: 'Vortex Spiral',
    closed: false,
    eval(u, time, out = new THREE.Vector3()) {
      const a = u * turns * TAU + phase + time * speed;
      const r = Math.sin(u * Math.PI) * maxR;
      const y = (u - 0.5) * height + Math.cos(u * TAU + time * 0.6) * 0.35;
      return out.set(Math.cos(a) * r, y, Math.sin(a) * r);
    },
  };
}

export function createRandomRibbonPath(opts = {}) {
  const factory = pick([
    createTorusKnotPath,
    createLissajousPath,
    createHelixPath,
    createRoseOrbitPath,
    createEpitrochoidPath,
    createOrbitalRingPath,
    createLemniscate3DPath,
    createSpiralVortexPath,
  ]);
  return factory(opts);
}
