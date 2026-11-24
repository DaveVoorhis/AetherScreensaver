import * as THREE from 'three';
import {
  clamp,
  lerp,
  smootherstep,
  easeOrganicGrow,
  easeOrganicShrink,
  computePixelScale,
  randRange,
} from './math.js';
import {
  createPhysicalMaterial,
  getMaterialTargetSnapshot,
  getShaderClass,
} from './materials.js';

const SEGMENTS = 150;
const RADIAL = 9;

const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _norm = new THREE.Vector3();
const _binorm = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _altUp = new THREE.Vector3(1, 0, 0);
const _prevNorm = new THREE.Vector3();
const _vtx = new THREE.Vector3();
const _centerSample = new THREE.Vector3();

/**
 * A continuously animated 3D photorealistic optical tube / glass ribbon path.
 * Strictly obeys the 1-pixel rule and uses unified shader classes so morphing
 * between parametric curves never stalls or triggers shader recompiles.
 */
export class PathRibbon {
  constructor(config) {
    this.path = config.path;
    this.prevPath = null;
    this.baseRadius = config.radius ?? randRange(0.032, 0.08);
    this.materialType = config.materialType ?? 'crystalVeil';
    this.shaderClass = getShaderClass(this.materialType);
    this.material = createPhysicalMaterial(this.materialType, config.palette);
    this.baseEmissiveIntensity = this.material.emissiveIntensity || 0;
    this.baseOpacity = this.material.opacity ?? 1.0;

    const ringCount = SEGMENTS + 1;
    const vertsPerRing = RADIAL + 1;
    const totalVerts = ringCount * vertsPerRing;

    this._positions = new Float32Array(totalVerts * 3);
    this._normals = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);
    const indices = [];

    for (let i = 0; i < ringCount; i++) {
      const u = i / SEGMENTS;
      for (let j = 0; j < vertsPerRing; j++) {
        const v = j / RADIAL;
        const idx = i * vertsPerRing + j;
        uvs[idx * 2] = u;
        uvs[idx * 2 + 1] = v;
      }
    }

    for (let i = 0; i < SEGMENTS; i++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = i * vertsPerRing + j;
        const b = (i + 1) * vertsPerRing + j;
        const c = (i + 1) * vertsPerRing + (j + 1);
        const d = i * vertsPerRing + (j + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this._normals, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(indices);

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    if (this.shaderClass === 'translucent') {
      this.mesh.renderOrder = 4;
    }

    this._spine = Array.from({ length: ringCount }, () => new THREE.Vector3());

    this.state = 'WAITING';
    this.age = -(config.spawnDelay ?? 0);
    this.growDuration = config.growDuration ?? randRange(2.4, 3.8);
    this.life = 0;

    this._morphTime = 0;
    this._morphDuration = 4.2;
    this._startRadius = this.baseRadius;
    this._targetRadius = this.baseRadius;
    this._startMat = null;
    this._targetMat = null;

    this._shrinkDelay = 0;
    this._shrinkTime = 0;
    this._shrinkDuration = 2.4;
    this._shrinkMode = Math.random() < 0.5 ? 'retract' : 'converge';
  }

  beginMorph(newConfig) {
    if (this.state === 'DEAD' || this.state === 'SHRINKING') return;
    if (this.state === 'WAITING') {
      this.path = newConfig.path;
      this.baseRadius = newConfig.radius ?? this.baseRadius;
      return;
    }

    if (this.state === 'REASSEMBLING' && this.prevPath) {
      const oldA = this.prevPath;
      const oldB = this.path;
      const frozenFrac = smootherstep(clamp(this._morphTime / this._morphDuration, 0, 1));
      this.prevPath = {
        closed: oldB.closed,
        eval(u, t, out) {
          oldA.eval(u, t, _p0);
          oldB.eval(u, t, _p1);
          return out.copy(_p0).lerp(_p1, frozenFrac);
        },
      };
    } else {
      this.prevPath = this.path;
    }

    this.state = 'REASSEMBLING';
    this.path = newConfig.path;
    this._morphTime = 0;
    this._morphDuration = newConfig.morphDuration ?? randRange(3.8, 5.4);
    this._startRadius = this.baseRadius;
    this._targetRadius = newConfig.radius ?? randRange(0.032, 0.08);

    this._startMat = {
      color: this.material.color.clone(),
      emissive: this.material.emissive.clone(),
      emissiveIntensity: this.baseEmissiveIntensity,
      metalness: this.material.metalness,
      roughness: this.material.roughness,
      transmission: this.material.transmission,
      opacity: this.baseOpacity,
      iridescence: this.material.iridescence,
      attenuationColor: this.material.attenuationColor
        ? this.material.attenuationColor.clone()
        : new THREE.Color(0xffffff),
    };
    this._targetMat = getMaterialTargetSnapshot(
      newConfig.materialType ?? this.materialType,
      newConfig.palette,
      this.shaderClass
    );
    this.materialType = newConfig.materialType ?? this.materialType;
  }

  beginShrink(delay = 0, duration = null) {
    if (this.state === 'DEAD' || this.state === 'SHRINKING') return;
    if (this.state === 'WAITING') {
      this.state = 'DEAD';
      this.mesh.visible = false;
      return;
    }
    this.state = 'SHRINKING';
    this._shrinkDelay = delay;
    this._shrinkTime = 0;
    this._shrinkDuration = duration ?? randRange(2.0, 3.2);
  }

  _evalSpinePoint(u, time, morphFrac, out) {
    if (this.prevPath && morphFrac < 1) {
      this.prevPath.eval(u, time, _p0);
      this.path.eval(u, time, _p1);
      return out.copy(_p0).lerp(_p1, morphFrac);
    }
    return this.path.eval(u, time, out);
  }

  update(time, dt, camera, viewportHeightPx) {
    if (this.state === 'DEAD') return;

    this.age += dt;
    let startU = 0;
    let endU = 1;
    let radiusFactor = 1;
    let morphFrac = 1;

    if (this.state === 'WAITING') {
      if (this.age < 0) return;
      this.state = 'GROWING';
      this.mesh.visible = true;
    }

    if (this.state === 'GROWING') {
      const rawT = clamp(this.age / this.growDuration, 0, 1);
      const g = easeOrganicGrow(rawT);
      this.life = clamp(g, 0, 1);
      startU = 0;
      endU = lerp(0.002, 1.0, smootherstep(rawT));
      radiusFactor = clamp(g, 0, 1);
      if (rawT >= 1) {
        this.state = 'ALIVE';
        this.life = 1;
      }
    } else if (this.state === 'ALIVE') {
      this.life = 1;
      startU = 0;
      endU = 1;
      radiusFactor = 1;
    } else if (this.state === 'REASSEMBLING') {
      this._morphTime += dt;
      const rawT = clamp(this._morphTime / this._morphDuration, 0, 1);
      morphFrac = smootherstep(rawT);
      this.baseRadius = lerp(this._startRadius, this._targetRadius, morphFrac);

      if (this._startMat && this._targetMat) {
        const s = this._startMat;
        const tg = this._targetMat;
        this.material.color.copy(s.color).lerp(tg.color, morphFrac);
        this.material.emissive.copy(s.emissive).lerp(tg.emissive, morphFrac);
        this.material.metalness = lerp(s.metalness, tg.metalness, morphFrac);
        this.material.roughness = lerp(s.roughness, tg.roughness, morphFrac);
        if (this.shaderClass === 'refractive') {
          this.material.transmission = Math.max(0.05, lerp(s.transmission, tg.transmission, morphFrac));
        } else if (this.shaderClass === 'translucent') {
          this.baseOpacity = lerp(s.opacity, tg.opacity, morphFrac);
          this.material.opacity = this.baseOpacity;
        }
        this.material.iridescence = Math.max(0.005, lerp(s.iridescence, tg.iridescence, morphFrac));
        if (this.material.attenuationColor) {
          this.material.attenuationColor.copy(s.attenuationColor).lerp(tg.attenuationColor, morphFrac);
        }
        this.baseEmissiveIntensity = lerp(s.emissiveIntensity, tg.emissiveIntensity, morphFrac);
        this.material.emissiveIntensity = this.baseEmissiveIntensity;
      }

      if (rawT >= 1) {
        this.state = 'ALIVE';
        this.prevPath = null;
        this._startMat = null;
        this._targetMat = null;
      }
      this.life = 1;
    } else if (this.state === 'SHRINKING') {
      if (this._shrinkDelay > 0) {
        this._shrinkDelay -= dt;
      } else {
        this._shrinkTime += dt;
        const rawT = clamp(this._shrinkTime / this._shrinkDuration, 0, 1);
        const s = easeOrganicShrink(rawT);
        this.life = s;
        const retract = smootherstep(clamp(rawT / 0.92, 0, 1));
        if (this._shrinkMode === 'retract') {
          startU = lerp(0, 0.998, retract);
          endU = 1.0;
        } else {
          startU = lerp(0, 0.499, retract);
          endU = lerp(1.0, 0.501, retract);
        }
        radiusFactor = s;
        if (rawT >= 1) {
          this.state = 'DEAD';
          this.life = 0;
          this.mesh.visible = false;
          return;
        }
      }
    }

    this._evalSpinePoint((startU + endU) * 0.5, time, morphFrac, _centerSample);
    const onePxRad = computePixelScale(_centerSample, 0.5, camera, viewportHeightPx, 1.0) * 0.5;
    const effectiveRadius = Math.max(onePxRad, lerp(onePxRad, this.baseRadius, radiusFactor));

    if (this.baseEmissiveIntensity > 0) {
      this.material.emissiveIntensity = this.baseEmissiveIntensity * (0.25 + 0.75 * this.life);
    }

    const span = Math.max(0.0005, endU - startU);
    for (let i = 0; i <= SEGMENTS; i++) {
      const f = i / SEGMENTS;
      const u = startU + f * span;
      this._evalSpinePoint(u, time, morphFrac, this._spine[i]);
    }

    const vertsPerRing = RADIAL + 1;
    for (let i = 0; i <= SEGMENTS; i++) {
      const f = i / SEGMENTS;
      const curr = this._spine[i];
      const prev = this._spine[Math.max(0, i - 1)];
      const next = this._spine[Math.min(SEGMENTS, i + 1)];

      _tan.copy(next).sub(prev);
      if (_tan.lengthSq() < 1e-10) {
        _tan.set(0, 1, 0);
      } else {
        _tan.normalize();
      }

      if (i === 0) {
        const ref = Math.abs(_tan.dot(_up)) > 0.92 ? _altUp : _up;
        _norm.crossVectors(_tan, ref).normalize();
        _prevNorm.copy(_norm);
      } else {
        _norm.copy(_prevNorm).addScaledVector(_tan, -_prevNorm.dot(_tan));
        if (_norm.lengthSq() < 1e-8) {
          const ref = Math.abs(_tan.dot(_up)) > 0.92 ? _altUp : _up;
          _norm.crossVectors(_tan, ref);
        }
        _norm.normalize();
        _prevNorm.copy(_norm);
      }
      _binorm.crossVectors(_tan, _norm).normalize();

      const tipTaper =
        this.path.closed && this.state === 'ALIVE'
          ? 1.0
          : Math.pow(Math.sin(f * Math.PI), 0.35);
      const r = Math.max(onePxRad * 0.5, effectiveRadius * tipTaper);

      for (let j = 0; j <= RADIAL; j++) {
        const theta = (j / RADIAL) * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const nx = _norm.x * cosT + _binorm.x * sinT;
        const ny = _norm.y * cosT + _binorm.y * sinT;
        const nz = _norm.z * cosT + _binorm.z * sinT;

        _vtx.set(curr.x + nx * r, curr.y + ny * r, curr.z + nz * r);

        const idx = (i * vertsPerRing + j) * 3;
        this._positions[idx] = _vtx.x;
        this._positions[idx + 1] = _vtx.y;
        this._positions[idx + 2] = _vtx.z;

        this._normals[idx] = nx;
        this._normals[idx + 1] = ny;
        this._normals[idx + 2] = nz;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }

  dispose() {
    if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
    this.geometry.dispose();
    this.material.dispose();
  }
}
