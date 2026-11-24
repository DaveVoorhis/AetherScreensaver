import * as THREE from 'three';
import {
  clamp,
  damp,
  generatePalette,
  randRange,
  shuffle,
} from './math.js';
import { getShaderClass } from './materials.js';
import { VisualNode } from './visualNode.js';
import { PathRibbon } from './pathRibbon.js';
import { composeSystem } from './systemComposer.js';

function isExactShapeRequired(shape) {
  return (
    shape.startsWith('gear') ||
    shape.startsWith('ringGear') ||
    shape === 'axlePin' ||
    shape === 'thinRing' ||
    shape === 'torus' ||
    shape === 'torusKnot' ||
    shape === 'torusKnotComplex' ||
    shape === 'filigreeCage' ||
    shape === 'doubleCage' ||
    shape === 'gyroArmillary' ||
    shape === 'ribbedGlassShell' ||
    shape === 'opticalAperture' ||
    shape === 'vernierDial' ||
    shape === 'irisBlades' ||
    shape === 'tuningForkRing' ||
    shape === 'segmentedArc'
  );
}

export class ScreensaverDirector {
  constructor(scene, camera, geoLib, lightRig, backdropUniforms, flareController) {
    this.scene = scene;
    this.camera = camera;
    this.geoLib = geoLib;
    this.lightRig = lightRig;
    this.backdropUniforms = backdropUniforms;
    this.flareController = flareController;

    this.root = new THREE.Group();
    scene.add(this.root);

    this.nodes = [];
    this.ribbons = [];

    this.time = 0;
    this.speedMultiplier = 1.0;
    this.generationCount = 0;
    this.currentPalette = null;
    this.currentSystemName = 'Genesis · Singularity';
    this.phaseLabel = 'Growing from 1px seed';

    this._phase = 'ACTIVE'; // 'ACTIVE' | 'REASSEMBLING' | 'COLLAPSING'
    this._phaseTimer = 0;
    this._holdDuration = 16;
    this._pendingRebirthSpec = null;

    this._bgAccentA = new THREE.Color(0x1d4ed8);
    this._bgAccentB = new THREE.Color(0x7c3aed);
    this._bgCenter = new THREE.Color(0x0b1220);

    // Cinematographic camera state (framed for crisp macro horological legibility)
    this.camAzimuth = 0.55;
    this.camElevation = 0.22;
    this.camDistance = 11.2;
    this._targetCamDistance = 11.2;
    this._camAzVel = 0.13;
    this._camElevPhase = 0.4;
    this._camRollPhase = 0.0;
    this._userOrbitActive = false;
    this._userIdleTimer = 10;
    this._camLookTarget = new THREE.Vector3(0, 0, 0);

    this._spawnInitialGenesis();
  }

  _applyPaletteAtmosphere(palette) {
    this.currentPalette = palette;
    this.lightRig.setPalette(palette);
    this._bgAccentA.copy(palette.rimA).multiplyScalar(0.55);
    this._bgAccentB.copy(palette.rimB).multiplyScalar(0.45);
    this._bgCenter.copy(palette.secondary).lerp(palette.bg, 0.55);
  }

  _spawnInitialGenesis() {
    const palette = generatePalette();
    const spec = composeSystem(palette);
    this.generationCount = 1;
    this.currentSystemName = spec.name;
    this.phaseLabel = 'Growing organically from 1px seed';
    this._applyPaletteAtmosphere(palette);

    const origin = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < spec.nodeSpecs.length; i++) {
      const ns = spec.nodeSpecs[i];
      const node = new VisualNode(
        {
          ...ns,
          seedOrigin: i === 0 ? null : ns.growStyle === 'bud' ? origin : null,
        },
        this.geoLib
      );
      this.root.add(node.mesh);
      this.nodes.push(node);
    }

    for (const rs of spec.ribbonSpecs) {
      const ribbon = new PathRibbon(rs);
      this.root.add(ribbon.mesh);
      this.ribbons.push(ribbon);
    }

    this._phase = 'ACTIVE';
    this._phaseTimer = 0;
    this._holdDuration = randRange(15, 20);
  }

  triggerTransition(forceMode = null) {
    if (this._phase === 'COLLAPSING') return;

    const nextPalette = generatePalette(this.currentPalette?.name ?? '');
    const nextSpec = composeSystem(nextPalette);
    this.generationCount++;

    if (forceMode === 'singularity') {
      this._beginSingularityCollapse(nextSpec);
    } else {
      this._beginContinuousBlend(nextSpec);
    }
  }

  _beginSingularityCollapse(nextSpec) {
    this._phase = 'COLLAPSING';
    this._phaseTimer = 0;
    this._pendingRebirthSpec = nextSpec;
    this.phaseLabel = 'Shrinking to 1px singularity';

    const center = new THREE.Vector3(0, 0, 0);
    const activeNodes = this.nodes.filter((n) => n.state !== 'DEAD' && n.state !== 'SHRINKING');
    activeNodes.forEach((node, idx) => {
      const delay = (idx / Math.max(1, activeNodes.length)) * 0.9;
      node.beginShrink(delay, randRange(1.5, 2.2), center);
    });

    const activeRibbons = this.ribbons.filter((r) => r.state !== 'DEAD' && r.state !== 'SHRINKING');
    activeRibbons.forEach((ribbon, idx) => {
      ribbon.beginShrink(idx * 0.2, randRange(1.6, 2.3));
    });
  }

  _beginContinuousBlend(nextSpec) {
    this._phase = 'REASSEMBLING';
    this._phaseTimer = 0;
    this._holdDuration = randRange(15, 20);
    this.currentSystemName = nextSpec.name;
    this.phaseLabel = 'Blending into new formation';
    this._applyPaletteAtmosphere(nextSpec.palette);

    this._targetCamDistance = randRange(9.8, 12.4);
    this._camAzVel = randRange(0.1, 0.18) * (Math.random() < 0.5 ? 1 : -1);

    const pool = shuffle(
      this.nodes.filter((n) => n.state === 'ALIVE' || n.state === 'GROWING' || n.state === 'REASSEMBLING')
    );

    const assignedSlots = new Set();
    const usedNodes = new Set();
    const anchorPositions = [];

    const assignNodeToSlot = (node, sIdx, spec) => {
      usedNodes.add(node);
      assignedSlots.add(sIdx);
      anchorPositions.push(node.mesh.position.clone());
      const stagger = randRange(0.0, 0.85);
      node.beginReassemble(
        {
          ...spec,
          reassembleDuration: randRange(3.6, 5.2),
        },
        stagger
      );
    };

    // Pass 1: Match luminous flare cores -> luminous flare cores for seamless light continuity
    for (let sIdx = 0; sIdx < nextSpec.nodeSpecs.length; sIdx++) {
      const spec = nextSpec.nodeSpecs[sIdx];
      if (!spec.isFlareEmitter) continue;
      const match = pool.find((n) => !usedNodes.has(n) && n.isFlareEmitter);
      if (match) assignNodeToSlot(match, sIdx, spec);
    }

    // Pass 2: Match EXACT shape + EXACT shaderClass (preserves exact gear tooth counts, bridges & axles!)
    for (let sIdx = 0; sIdx < nextSpec.nodeSpecs.length; sIdx++) {
      if (assignedSlots.has(sIdx)) continue;
      const spec = nextSpec.nodeSpecs[sIdx];
      const wantClass = getShaderClass(spec.materialType);
      const match = pool.find(
        (n) => !usedNodes.has(n) && n.shape === spec.shape && n.shaderClass === wantClass
      );
      if (match) assignNodeToSlot(match, sIdx, spec);
    }

    // Pass 3: Match EXACT shape across compatible shader classes (gear12 -> gear12, axlePin -> axlePin, etc.)
    for (let sIdx = 0; sIdx < nextSpec.nodeSpecs.length; sIdx++) {
      if (assignedSlots.has(sIdx)) continue;
      const spec = nextSpec.nodeSpecs[sIdx];
      const match = pool.find((n) => !usedNodes.has(n) && n.shape === spec.shape);
      if (match) assignNodeToSlot(match, sIdx, spec);
    }

    // Pass 4: Match remaining non-mechanical/non-shell primitives with EXACT shaderClass
    // Never swaps gears, ring gears, axles, or bridges onto mismatched geometries!
    for (let sIdx = 0; sIdx < nextSpec.nodeSpecs.length; sIdx++) {
      if (assignedSlots.has(sIdx)) continue;
      const spec = nextSpec.nodeSpecs[sIdx];
      if (isExactShapeRequired(spec.shape)) continue;
      const wantClass = getShaderClass(spec.materialType);
      const match = pool.find(
        (n) => !usedNodes.has(n) && !isExactShapeRequired(n.shape) && n.shaderClass === wantClass
      );
      if (match) assignNodeToSlot(match, sIdx, spec);
    }

    // Pass 5: Any un-reused old forms smoothly shrink down to 1px in parallel while continuing motion
    let shrinkIdx = 0;
    for (const node of pool) {
      if (!usedNodes.has(node)) {
        node.beginShrink(randRange(0.0, 0.7) + shrinkIdx * 0.03, randRange(1.8, 2.8), null);
        shrinkIdx++;
      }
    }

    // Pass 6: Any new shape slots bloom organically from 1px sparks (gears bloom right off their axle!)
    let spawnIdx = 0;
    for (let sIdx = 0; sIdx < nextSpec.nodeSpecs.length; sIdx++) {
      if (assignedSlots.has(sIdx)) continue;
      const spec = nextSpec.nodeSpecs[sIdx];
      const seedOrigin =
        anchorPositions.length > 0 && !isExactShapeRequired(spec.shape)
          ? anchorPositions[spawnIdx % anchorPositions.length]
          : null;
      const node = new VisualNode(
        {
          ...spec,
          spawnDelay: 0.1 + randRange(0, 0.85) + spawnIdx * 0.035,
          growDuration: randRange(2.1, 3.4),
          seedOrigin,
        },
        this.geoLib
      );
      this.root.add(node.mesh);
      this.nodes.push(node);
      spawnIdx++;
    }

    // Ribbons: match by shaderClass when possible, morph smoothly, shrink extras & grow new ones in parallel
    const activeRibbons = this.ribbons.filter((r) => r.state !== 'DEAD' && r.state !== 'SHRINKING');
    const newRibbons = nextSpec.ribbonSpecs;
    const usedRibbons = new Set();
    const assignedRibbons = new Set();

    for (let i = 0; i < newRibbons.length; i++) {
      const wantClass = getShaderClass(newRibbons[i].materialType);
      const match = activeRibbons.find((r) => !usedRibbons.has(r) && r.shaderClass === wantClass);
      if (match) {
        usedRibbons.add(match);
        assignedRibbons.add(i);
        match.beginMorph(newRibbons[i]);
      }
    }
    for (let i = 0; i < newRibbons.length; i++) {
      if (assignedRibbons.has(i)) continue;
      const match = activeRibbons.find((r) => !usedRibbons.has(r));
      if (match) {
        usedRibbons.add(match);
        assignedRibbons.add(i);
        match.beginMorph(newRibbons[i]);
      }
    }
    let rShrink = 0;
    for (const r of activeRibbons) {
      if (!usedRibbons.has(r)) {
        r.beginShrink(rShrink * 0.2, randRange(2.0, 3.0));
        rShrink++;
      }
    }
    let rSpawn = 0;
    for (let i = 0; i < newRibbons.length; i++) {
      if (assignedRibbons.has(i)) continue;
      const ribbon = new PathRibbon({
        ...newRibbons[i],
        spawnDelay: 0.25 + rSpawn * 0.35,
      });
      this.root.add(ribbon.mesh);
      this.ribbons.push(ribbon);
      rSpawn++;
    }
  }

  _executeRebirthFromSingularity() {
    const spec = this._pendingRebirthSpec;
    this._pendingRebirthSpec = null;
    if (!spec) return;

    this.currentSystemName = spec.name;
    this.phaseLabel = 'Growing organically from 1px seed';
    this._applyPaletteAtmosphere(spec.palette);
    this._targetCamDistance = randRange(9.8, 12.4);

    const origin = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < spec.nodeSpecs.length; i++) {
      const ns = spec.nodeSpecs[i];
      const node = new VisualNode(
        {
          ...ns,
          seedOrigin: i === 0 ? null : ns.growStyle === 'bud' ? origin : null,
        },
        this.geoLib
      );
      this.root.add(node.mesh);
      this.nodes.push(node);
    }

    for (const rs of spec.ribbonSpecs) {
      const ribbon = new PathRibbon(rs);
      this.root.add(ribbon.mesh);
      this.ribbons.push(ribbon);
    }

    this._phase = 'ACTIVE';
    this._phaseTimer = 0;
    this._holdDuration = randRange(15, 20);
  }

  nudgeCamera(deltaAz, deltaElev) {
    this.camAzimuth += deltaAz;
    this.camElevation = clamp(this.camElevation + deltaElev, -1.15, 1.15);
    this._userOrbitActive = true;
    this._userIdleTimer = 0;
  }

  nudgeZoom(delta) {
    this._targetCamDistance = clamp(this._targetCamDistance + delta, 5.5, 20.0);
    this._userIdleTimer = 0;
  }

  endUserOrbit() {
    this._userOrbitActive = false;
  }

  update(rawDt, viewportHeightPx) {
    const dt = Math.min(rawDt, 0.05) * this.speedMultiplier;
    this.time += dt;
    this._phaseTimer += dt;
    this._userIdleTimer += rawDt;

    // 1. Update cinematographic autonomous camera
    if (!this._userOrbitActive && this._userIdleTimer > 2.2) {
      const autoBlend = clamp((this._userIdleTimer - 2.2) / 3.0, 0, 1);
      this.camAzimuth += this._camAzVel * dt * autoBlend;
      this._camElevPhase += dt * 0.14 * autoBlend;
      const targetElev = Math.sin(this._camElevPhase) * 0.42;
      this.camElevation = damp(this.camElevation, targetElev, 0.45 * autoBlend, dt);
    }

    this._camRollPhase += dt * 0.11;
    const breathDist = this._targetCamDistance + Math.sin(this.time * 0.19) * 1.05;
    this.camDistance = damp(this.camDistance, breathDist, 1.4, dt);

    const cosE = Math.cos(this.camElevation);
    this.camera.position.set(
      Math.cos(this.camAzimuth) * cosE * this.camDistance,
      Math.sin(this.camElevation) * this.camDistance,
      Math.sin(this.camAzimuth) * cosE * this.camDistance
    );
    this.camera.lookAt(this._camLookTarget);
    this.camera.rotateZ(Math.sin(this._camRollPhase) * 0.045);

    // 2. Smoothly crossfade studio backdrop
    const bgLerp = 1 - Math.exp(-1.1 * dt);
    this.backdropUniforms.uAccentA.value.lerp(this._bgAccentA, bgLerp);
    this.backdropUniforms.uAccentB.value.lerp(this._bgAccentB, bgLerp);
    this.backdropUniforms.uColorCenter.value.lerp(this._bgCenter, bgLerp);
    this.backdropUniforms.uTime.value = this.time;

    // 3. Update all VisualNodes & collect luminous emitters
    const flareEmitters = [];
    let totalLife = 0;
    let aliveOrGrowing = 0;

    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      node.update(this.time, dt, this.camera, viewportHeightPx);
      if (node.state === 'DEAD') {
        node.dispose();
        this.nodes.splice(i, 1);
        continue;
      }
      totalLife += node.life;
      if (node.state !== 'SHRINKING') aliveOrGrowing++;

      const fi = node.getFlareInfo();
      if (fi) flareEmitters.push(fi);
    }

    // 4. Update all PathRibbons
    for (let i = this.ribbons.length - 1; i >= 0; i--) {
      const ribbon = this.ribbons[i];
      ribbon.update(this.time, dt, this.camera, viewportHeightPx);
      if (ribbon.state === 'DEAD') {
        ribbon.dispose();
        this.ribbons.splice(i, 1);
        continue;
      }
      totalLife += ribbon.life;
    }

    // 5. Update persistent lights & optical lens flares
    const activity = clamp(totalLife / 18, 0.05, 1.0);
    this.lightRig.update(this.time, dt, activity);
    this.lightRig.syncCoreLights(flareEmitters, dt);
    this.flareController.update(flareEmitters, this.camera);

    // 6. Phase progression
    if (this._phase === 'COLLAPSING') {
      if (this.nodes.length === 0 && this.ribbons.length === 0) {
        this._executeRebirthFromSingularity();
      }
    } else if (this._phase === 'REASSEMBLING') {
      const anyStillReassembling =
        this.nodes.some((n) => n.state === 'REASSEMBLING' || n.state === 'GROWING') ||
        this.ribbons.some((r) => r.state === 'REASSEMBLING' || r.state === 'GROWING');
      if (!anyStillReassembling && this._phaseTimer > 4.0) {
        this._phase = 'ACTIVE';
        this.phaseLabel = `${this.nodes.length} forms · ${this.ribbons.length} optical ${this.ribbons.length === 1 ? 'path' : 'paths'}`;
      }
    } else if (this._phase === 'ACTIVE') {
      const anyGrowing = this.nodes.some((n) => n.state === 'GROWING' || n.state === 'WAITING');
      if (!anyGrowing) {
        this.phaseLabel = `${this.nodes.length} forms · ${this.ribbons.length} optical ${this.ribbons.length === 1 ? 'path' : 'paths'}`;
      }
      if (this._phaseTimer >= this._holdDuration && aliveOrGrowing > 0) {
        this.triggerTransition();
      }
    }
  }

  getStatus() {
    return {
      name: this.currentSystemName,
      meta: this.phaseLabel,
      accentHex: this.currentPalette ? `#${this.currentPalette.emissive.getHexString()}` : '#7cd4ff',
    };
  }
}
