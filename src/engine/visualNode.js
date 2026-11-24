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

const _tmpPos = new THREE.Vector3();
const _tmpPos2 = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpQuat2 = new THREE.Quaternion();
const _tmpScaleMult = new THREE.Vector3(1, 1, 1);
const _tmpScaleMult2 = new THREE.Vector3(1, 1, 1);
const _midCtrl = new THREE.Vector3();
const _bezierA = new THREE.Vector3();
const _bezierB = new THREE.Vector3();

let _nextNodeId = 1;

export class VisualNode {
  constructor(config, geoLib) {
    this.id = _nextNodeId++;
    this.shape = config.shape;
    this.materialType = config.materialType;
    this.shaderClass = getShaderClass(config.materialType);
    this.localRadius = geoLib.getRadius(config.shape);
    this.geometry = geoLib.get(config.shape);
    this.material = createPhysicalMaterial(config.materialType, config.palette);

    this.baseEmissiveIntensity = this.material.emissiveIntensity || 0;
    this.baseOpacity = this.shaderClass === 'translucent' && config.targetScale.x > 3.5 ? (this.material.opacity ?? 0.2) * 0.72 : (this.material.opacity ?? 1.0); if (this.shaderClass === 'translucent') this.material.opacity = this.baseOpacity;
    this.isFlareEmitter = !!config.isFlareEmitter;
    this.flareStrength = config.flareStrength ?? (this.isFlareEmitter ? 1.0 : 0.0);
    this.flareColor = config.palette.emissive.clone();

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    if (this.shaderClass === 'translucent') {
      // Larger enclosing shells render slightly later so nested translucent layers stack cleanly
      this.mesh.renderOrder = config.renderOrder ?? (config.targetScale.x > 2.5 ? 6 : 3);
    }

    // Lifecycle state: 'WAITING' -> 'GROWING' -> 'ALIVE' -> ('REASSEMBLING' -> 'ALIVE')* -> 'SHRINKING' -> 'DEAD'
    this.state = 'WAITING';
    this.age = -(config.spawnDelay ?? 0);
    this.growDuration = config.growDuration ?? randRange(1.8, 3.2);
    this.growStyle = config.growStyle ?? 'uniform';
    this.seedOrigin = config.seedOrigin ? config.seedOrigin.clone() : null;

    this.slot = config.slot;
    this.prevSlot = null;
    this.targetScale = config.targetScale.clone();
    this.prevTargetScale = config.targetScale.clone();
    this.life = 0;

    // Continuous cross-blend reassembly state (never pauses motion)
    this._reDelay = 0;
    this._reTime = 0;
    this._reDuration = 4.2;
    this._reSwirlAxis = new THREE.Vector3();
    this._reSwirlAmp = 1.6;
    this._reTargetMat = null;
    this._reStartMat = null;
    this._reTargetFlareStrength = 0;
    this._reStartFlareStrength = 0;
    this._reTargetFlareColor = new THREE.Color();
    this._reStartFlareColor = new THREE.Color();

    // Shrink state (maintains orbital momentum while contracting cleanly to 1px)
    this._shrinkDelay = 0;
    this._shrinkTime = 0;
    this._shrinkDuration = 2.2;
    this._shrinkCollapseTarget = null;

    this._pinpointColor = config.palette.accent.clone();
  }

  beginReassemble(newConfig, delay = 0) {
    if (this.state === 'DEAD' || this.state === 'SHRINKING') return;

    if (this.state === 'WAITING') {
      this.slot = newConfig.slot;
      this.targetScale.copy(newConfig.targetScale);
      this.materialType = newConfig.materialType;
      this.isFlareEmitter = !!newConfig.isFlareEmitter;
      this.flareStrength = newConfig.flareStrength ?? 0;
      this.flareColor.copy(newConfig.palette.emissive);
      const snap = getMaterialTargetSnapshot(newConfig.materialType, newConfig.palette, this.shaderClass);
      this._applyMatSnapshot(snap, 1.0);
      this.baseEmissiveIntensity = snap.emissiveIntensity;
      this.baseOpacity = snap.opacity;
      return;
    }

    if (this.state === 'REASSEMBLING' && this._reTime > 0) {
      const snapPos = this.mesh.position.clone();
      const snapQuat = this.mesh.quaternion.clone();
      const oldTarget = this.slot;
      const startTimeOffset = this._reTime;
      this.prevSlot = {
        evaluate(time, outPos, outQuat, outScaleMult) {
          oldTarget.evaluate(time, _tmpPos2, _tmpQuat2, outScaleMult);
          const f = clamp((time - startTimeOffset) * 0.7, 0, 1);
          outPos.copy(snapPos).lerp(_tmpPos2, f * 0.25);
          outQuat.copy(snapQuat).slerp(_tmpQuat2, f * 0.25);
        },
      };
      this.prevTargetScale.copy(this.mesh.scale);
    } else {
      this.prevSlot = this.slot;
      this.prevTargetScale.copy(this.targetScale);
    }

    this.state = 'REASSEMBLING';
    this._reDelay = delay;
    this._reTime = 0;
    this._reDuration = newConfig.reassembleDuration ?? randRange(3.6, 5.4);

    this._reSwirlAxis
      .set(randRange(-1, 1), randRange(-1, 1), randRange(-1, 1))
      .normalize();
    this._reSwirlAmp = randRange(1.0, 2.6);

    this._reStartMat = {
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
    this._reTargetMat = getMaterialTargetSnapshot(
      newConfig.materialType,
      newConfig.palette,
      this.shaderClass
    );

    this._reStartFlareStrength = this.isFlareEmitter ? this.flareStrength : 0;
    this._reTargetFlareStrength = newConfig.isFlareEmitter ? (newConfig.flareStrength ?? 1.0) : 0;
    this._reStartFlareColor.copy(this.flareColor);
    this._reTargetFlareColor.copy(newConfig.palette.emissive);

    this.slot = newConfig.slot;
    this.targetScale.copy(newConfig.targetScale);
    this.materialType = newConfig.materialType;
    this.isFlareEmitter = this._reStartFlareStrength > 0 || this._reTargetFlareStrength > 0;
    this._pinpointColor.copy(newConfig.palette.accent);
    if (this.shaderClass === 'translucent') {
      this.mesh.renderOrder = newConfig.renderOrder ?? (this.targetScale.x > 2.5 ? 6 : 3);
    }
  }

  beginShrink(delay = 0, duration = null, collapseTarget = null) {
    if (this.state === 'DEAD' || this.state === 'SHRINKING') return;
    if (this.state === 'WAITING') {
      this.state = 'DEAD';
      this.mesh.visible = false;
      return;
    }

    this.state = 'SHRINKING';
    this._shrinkDelay = delay;
    this._shrinkTime = 0;
    this._shrinkDuration = duration ?? randRange(1.8, 3.0);
    this._shrinkCollapseTarget = collapseTarget ? collapseTarget.clone() : null;
  }

  _applyMatSnapshot(target, t) {
    if (!this._reStartMat || t >= 1) {
      this.material.color.copy(target.color);
      this.material.emissive.copy(target.emissive);
      this.material.metalness = target.metalness;
      this.material.roughness = target.roughness;
      if (this.shaderClass === 'refractive') {
        this.material.transmission = Math.max(0.05, target.transmission);
      } else if (this.shaderClass === 'translucent') {
        this.baseOpacity = target.opacity;
        this.material.opacity = target.opacity;
      }
      this.material.iridescence = Math.max(0.005, target.iridescence);
      if (this.material.attenuationColor) {
        this.material.attenuationColor.copy(target.attenuationColor);
      }
      return;
    }
    const s = this._reStartMat;
    this.material.color.copy(s.color).lerp(target.color, t);
    this.material.emissive.copy(s.emissive).lerp(target.emissive, t);
    this.material.metalness = lerp(s.metalness, target.metalness, t);
    this.material.roughness = lerp(s.roughness, target.roughness, t);
    if (this.shaderClass === 'refractive') {
      this.material.transmission = Math.max(0.05, lerp(s.transmission, target.transmission, t));
    } else if (this.shaderClass === 'translucent') {
      this.baseOpacity = lerp(s.opacity, target.opacity, t);
      this.material.opacity = this.baseOpacity;
    }
    this.material.iridescence = Math.max(0.005, lerp(s.iridescence, target.iridescence, t));
    if (this.material.attenuationColor) {
      this.material.attenuationColor.copy(s.attenuationColor).lerp(target.attenuationColor, t);
    }
  }

  update(time, dt, camera, viewportHeightPx) {
    if (this.state === 'DEAD') return;

    this.age += dt;

    // 1. WAITING FOR 1-PIXEL BIRTH SPARK
    if (this.state === 'WAITING') {
      if (this.age < 0) return;
      this.state = 'GROWING';
      this.mesh.visible = true;
      _tmpScaleMult.set(1, 1, 1);
      this.slot.evaluate(time, _tmpPos, _tmpQuat, _tmpScaleMult);
      this.mesh.position.copy(this.seedOrigin || _tmpPos);
      this.mesh.quaternion.copy(_tmpQuat);
      const px = computePixelScale(this.mesh.position, this.localRadius, camera, viewportHeightPx, 1.0);
      this.mesh.scale.set(px, px, px);
      this.life = 0.0;
    }

    // 2. GROWING FROM EXACTLY 1 PIXEL -> FULL ORGANIC FORM
    if (this.state === 'GROWING') {
      const rawT = clamp(this.age / this.growDuration, 0, 1);
      const g = easeOrganicGrow(rawT);
      this.life = clamp(g, 0, 1);

      _tmpScaleMult.set(1, 1, 1);
      this.slot.evaluate(time, _tmpPos, _tmpQuat, _tmpScaleMult);

      if (this.seedOrigin) {
        const travel = smootherstep(rawT);
        _midCtrl
          .copy(this.seedOrigin)
          .lerp(_tmpPos, 0.5)
          .addScaledVector(
            _tmpPos2.set(Math.sin(this.id * 1.7), Math.cos(this.id * 2.3), Math.sin(this.id * 0.9)),
            0.55 * Math.sin(travel * Math.PI)
          );
        _bezierA.copy(this.seedOrigin).lerp(_midCtrl, travel);
        _bezierB.copy(_midCtrl).lerp(_tmpPos, travel);
        this.mesh.position.copy(_bezierA).lerp(_bezierB, travel);
      } else {
        this.mesh.position.copy(_tmpPos);
      }
      this.mesh.quaternion.copy(_tmpQuat);

      const px = computePixelScale(this.mesh.position, this.localRadius, camera, viewportHeightPx, 1.0);
      const tx = this.targetScale.x * _tmpScaleMult.x;
      const ty = this.targetScale.y * _tmpScaleMult.y;
      const tz = this.targetScale.z * _tmpScaleMult.z;

      if (this.growStyle === 'axial') {
        const gAxis = easeOrganicGrow(clamp(rawT * 1.25, 0, 1));
        const gRad = easeOrganicGrow(clamp((rawT - 0.16) / 0.84, 0, 1));
        this.mesh.scale.set(
          Math.max(px, lerp(px, tx, gRad)),
          Math.max(px, lerp(px, ty, gAxis)),
          Math.max(px, lerp(px, tz, gRad))
        );
      } else if (this.growStyle === 'radial') {
        const gRad = easeOrganicGrow(clamp(rawT * 1.2, 0, 1));
        const gDepth = easeOrganicGrow(clamp((rawT - 0.18) / 0.82, 0, 1));
        this.mesh.scale.set(
          Math.max(px, lerp(px, tx, gRad)),
          Math.max(px, lerp(px, ty, gDepth)),
          Math.max(px, lerp(px, tz, gRad))
        );
      } else {
        this.mesh.scale.set(
          Math.max(px, lerp(px, tx, g)),
          Math.max(px, lerp(px, ty, g)),
          Math.max(px, lerp(px, tz, g))
        );
      }

      if (this.shaderClass === 'translucent') {
        this.material.opacity = lerp(0.85, this.baseOpacity, smootherstep(rawT));
      }

      const sparkGlow = Math.exp(-rawT * 9.0) * 1.5;
      if (this.baseEmissiveIntensity > 0) {
        this.material.emissiveIntensity = lerp(1.0, this.baseEmissiveIntensity, this.life);
      } else if (sparkGlow > 0.02) {
        this.material.emissive.copy(this._pinpointColor);
        this.material.emissiveIntensity = sparkGlow;
      } else {
        this.material.emissiveIntensity = 0;
      }

      if (rawT >= 1) {
        this.state = 'ALIVE';
        this.life = 1.0;
        if (this.shaderClass === 'translucent') this.material.opacity = this.baseOpacity;
        if (this.baseEmissiveIntensity === 0) {
          this.material.emissive.setHex(0x000000);
          this.material.emissiveIntensity = 0;
        }
      }
    }

    // 3. ALIVE — CHOREOGRAPHED KINETIC SYSTEM
    else if (this.state === 'ALIVE') {
      this.life = 1.0;
      _tmpScaleMult.set(1, 1, 1);
      this.slot.evaluate(time, _tmpPos, _tmpQuat, _tmpScaleMult);
      this.mesh.position.copy(_tmpPos);
      this.mesh.quaternion.copy(_tmpQuat);
      this.mesh.scale.set(
        this.targetScale.x * _tmpScaleMult.x,
        this.targetScale.y * _tmpScaleMult.y,
        this.targetScale.z * _tmpScaleMult.z
      );
      if (this.baseEmissiveIntensity > 0) {
        this.material.emissiveIntensity =
          this.baseEmissiveIntensity * (0.88 + 0.16 * Math.sin(time * 2.1 + this.id));
      }
    }

    // 4. REASSEMBLING — CONTINUOUS KINETIC CROSS-BLEND
    else if (this.state === 'REASSEMBLING') {
      _tmpScaleMult2.set(1, 1, 1);
      if (this.prevSlot) {
        this.prevSlot.evaluate(time, _tmpPos2, _tmpQuat2, _tmpScaleMult2);
      } else {
        _tmpPos2.copy(this.mesh.position);
        _tmpQuat2.copy(this.mesh.quaternion);
      }

      if (this._reDelay > 0) {
        this._reDelay -= dt;
        this.mesh.position.copy(_tmpPos2);
        this.mesh.quaternion.copy(_tmpQuat2);
        this.mesh.scale.set(
          this.prevTargetScale.x * _tmpScaleMult2.x,
          this.prevTargetScale.y * _tmpScaleMult2.y,
          this.prevTargetScale.z * _tmpScaleMult2.z
        );
      } else {
        this._reTime += dt;
        const rawT = clamp(this._reTime / this._reDuration, 0, 1);
        const u = smootherstep(rawT);

        _tmpScaleMult.set(1, 1, 1);
        this.slot.evaluate(time, _tmpPos, _tmpQuat, _tmpScaleMult);

        _midCtrl.copy(_tmpPos2).lerp(_tmpPos, 0.5);
        _midCtrl.addScaledVector(this._reSwirlAxis, this._reSwirlAmp * Math.sin(u * Math.PI));

        _bezierA.copy(_tmpPos2).lerp(_midCtrl, u);
        _bezierB.copy(_midCtrl).lerp(_tmpPos, u);
        this.mesh.position.copy(_bezierA).lerp(_bezierB, u);

        this.mesh.quaternion.copy(_tmpQuat2).slerp(_tmpQuat, u);

        const ox = this.prevTargetScale.x * _tmpScaleMult2.x;
        const oy = this.prevTargetScale.y * _tmpScaleMult2.y;
        const oz = this.prevTargetScale.z * _tmpScaleMult2.z;
        const tx = this.targetScale.x * _tmpScaleMult.x;
        const ty = this.targetScale.y * _tmpScaleMult.y;
        const tz = this.targetScale.z * _tmpScaleMult.z;

        const breath = 1 - Math.sin(u * Math.PI) * 0.08;
        this.mesh.scale.set(
          lerp(ox, tx, u) * breath,
          lerp(oy, ty, u) * breath,
          lerp(oz, tz, u) * breath
        );

        if (this._reTargetMat) {
          this._applyMatSnapshot(this._reTargetMat, u);
          this.baseEmissiveIntensity = lerp(
            this._reStartMat.emissiveIntensity,
            this._reTargetMat.emissiveIntensity,
            u
          );
          this.material.emissiveIntensity = this.baseEmissiveIntensity;
        }

        this.flareStrength = lerp(this._reStartFlareStrength, this._reTargetFlareStrength, u);
        this.flareColor.copy(this._reStartFlareColor).lerp(this._reTargetFlareColor, u);
        this.life = 1.0;

        if (rawT >= 1) {
          this.state = 'ALIVE';
          this.prevSlot = null;
          this.isFlareEmitter = this._reTargetFlareStrength > 0.01;
          this._reStartMat = null;
          this._reTargetMat = null;
        }
      }
    }

    // 5. SHRINKING — CONTINUE SMOOTH ORBIT WHILE CONTRACTING TO EXACTLY 1 PIXEL
    else if (this.state === 'SHRINKING') {
      _tmpScaleMult.set(1, 1, 1);
      this.slot.evaluate(time, _tmpPos, _tmpQuat, _tmpScaleMult);

      if (this._shrinkDelay > 0) {
        this._shrinkDelay -= dt;
        this.mesh.position.copy(_tmpPos);
        this.mesh.quaternion.copy(_tmpQuat);
        this.mesh.scale.set(
          this.targetScale.x * _tmpScaleMult.x,
          this.targetScale.y * _tmpScaleMult.y,
          this.targetScale.z * _tmpScaleMult.z
        );
      } else {
        this._shrinkTime += dt;
        const rawT = clamp(this._shrinkTime / this._shrinkDuration, 0, 1);
        const s = easeOrganicShrink(rawT);
        this.life = s;

        if (this._shrinkCollapseTarget) {
          const pull = smootherstep(rawT);
          this.mesh.position.copy(_tmpPos).lerp(this._shrinkCollapseTarget, pull * 0.85);
        } else {
          this.mesh.position.copy(_tmpPos);
        }
        this.mesh.quaternion.copy(_tmpQuat);

        const px = computePixelScale(this.mesh.position, this.localRadius, camera, viewportHeightPx, 1.0);
        const curX = this.targetScale.x * _tmpScaleMult.x;
        const curY = this.targetScale.y * _tmpScaleMult.y;
        const curZ = this.targetScale.z * _tmpScaleMult.z;
        this.mesh.scale.set(
          Math.max(px, lerp(px, curX, s)),
          Math.max(px, lerp(px, curY, s)),
          Math.max(px, lerp(px, curZ, s))
        );

        if (this.shaderClass === 'translucent') {
          this.material.opacity = lerp(this.baseOpacity, 0.85, smootherstep(rawT));
        }

        const finalPinpoint = rawT > 0.72 ? Math.sin(((rawT - 0.72) / 0.28) * Math.PI) * 1.2 : 0;
        if (this.baseEmissiveIntensity > 0) {
          this.material.emissiveIntensity = this.baseEmissiveIntensity * s + finalPinpoint * 0.7;
        } else if (finalPinpoint > 0.02) {
          this.material.emissive.copy(this._pinpointColor);
          this.material.emissiveIntensity = finalPinpoint;
        }

        if (rawT >= 1) {
          this.state = 'DEAD';
          this.life = 0;
          this.mesh.visible = false;
        }
      }
    }
  }

  getFlareInfo() {
    if (!this.isFlareEmitter || this.state === 'WAITING' || this.state === 'DEAD') return null;
    if (this.flareStrength <= 0.01 || this.life <= 0.01) return null;
    return {
      position: this.mesh.position,
      color: this.flareColor,
      strength: this.flareStrength,
      life: this.life,
    };
  }

  dispose() {
    if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
    this.material.dispose();
  }
}
