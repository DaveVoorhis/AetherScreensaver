import * as THREE from 'three';
import {
  TAU,
  GOLDEN_ANGLE,
  randRange,
  randInt,
  pick,
  weightedPick,
} from './math.js';
import {
  createTorusKnotPath,
  createLissajousPath,
  createHelixPath,
  createRoseOrbitPath,
  createEpitrochoidPath,
  createOrbitalRingPath,
  createLemniscate3DPath,
  createSpiralVortexPath,
} from './paths.js';
import {
  buildConnectedClockworkAssembly,
  makeFrameFixedGearSlot,
} from './geartrain.js';

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vTan = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _mat4 = new THREE.Matrix4();
const _euler = new THREE.Euler();
const _qExtra = new THREE.Quaternion();

function makePathFollowerSlot(path, uOffset, speedMult, opts = {}) {
  const alignToTangent = opts.alignToTangent ?? true;
  const spinSpeed = opts.spinSpeed ?? randRange(-1.4, 1.4);
  const breathAmp = opts.breathAmp ?? randRange(0.04, 0.1);
  const breathFreq = opts.breathFreq ?? randRange(1.1, 2.2);
  const phase = opts.phase ?? uOffset * TAU;
  const radialOffset = opts.radialOffset ?? 0;

  return {
    evaluate(time, outPos, outQuat, outScaleMult) {
      const u = (((uOffset + time * speedMult) % 1) + 1) % 1;
      path.eval(u, time, outPos);

      if (radialOffset !== 0) {
        const len = outPos.length();
        if (len > 0.001) {
          outPos.addScaledVector(_vA.copy(outPos).divideScalar(len), radialOffset);
        }
      }

      if (alignToTangent) {
        const uNext = (((u + 0.004) % 1) + 1) % 1;
        path.eval(uNext, time, _vB);
        _vTan.copy(_vB).sub(outPos);
        if (_vTan.lengthSq() > 1e-8) {
          _vTan.normalize();
          _mat4.lookAt(_vA.set(0, 0, 0), _vTan, _up);
          outQuat.setFromRotationMatrix(_mat4);
          _euler.set(0, 0, time * spinSpeed + phase);
          _qExtra.setFromEuler(_euler);
          outQuat.multiply(_qExtra);
        }
      } else {
        _euler.set(time * spinSpeed * 0.6 + phase, time * spinSpeed + phase * 0.7, time * 0.25);
        outQuat.setFromEuler(_euler);
      }

      const b = 1 + Math.sin(time * breathFreq + phase) * breathAmp;
      outScaleMult.set(b, b, b);
    },
  };
}

/**
 * Gimbal rotation slot with optional silky chronometer escapement cadence
 * (sinusoidal harmonic tick-glide — never jerky, unmistakably horological!).
 */
function makeGimbalSlot(tiltX, tiltY, tiltZ, spinX, spinY, spinZ, phase = 0, opts = {}) {
  const bobAmp = opts.bobAmp ?? 0.04;
  const escapementAmp = opts.escapementAmp ?? 0.0;
  const escapementFreq = opts.escapementFreq ?? 4.0;
  const offsetY = opts.offsetY ?? 0.0;

  return {
    evaluate(time, outPos, outQuat, outScaleMult) {
      const pulse = escapementAmp > 0 ? Math.sin(time * escapementFreq + phase) * escapementAmp : 0;
      const tMod = time + pulse;
      outPos.set(0, offsetY + Math.sin(time * 0.65 + phase) * bobAmp, 0);
      _euler.set(tiltX + tMod * spinX, tiltY + tMod * spinY, tiltZ + tMod * spinZ);
      outQuat.setFromEuler(_euler);
      const b = 1 + Math.sin(time * 0.85 + phase) * 0.025;
      outScaleMult.set(b, b, b);
    },
  };
}

function makePhyllotaxisSlot(index, total, radius, spread, rotSpeed, waveSpeed, tiltMode) {
  const frac = (index + 0.5) / total;
  const phi = Math.acos(1 - 2 * frac);
  const theta0 = GOLDEN_ANGLE * index;

  return {
    evaluate(time, outPos, outQuat, outScaleMult) {
      const wave = Math.sin(frac * TAU * 2.5 - time * waveSpeed);
      const r = radius * (0.82 + 0.18 * Math.sin(phi * spread)) * (1 + wave * 0.1);
      const theta = theta0 + time * rotSpeed;
      const sinP = Math.sin(phi);

      outPos.set(
        r * sinP * Math.cos(theta),
        r * Math.cos(phi) * (1 + Math.cos(time * 0.45) * 0.08),
        r * sinP * Math.sin(theta)
      );

      _vA.copy(outPos).normalize();
      if (tiltMode === 'radial') {
        outQuat.setFromUnitVectors(_up, _vA);
        _euler.set(0, time * 0.55 + index * 0.2, Math.sin(time * 1.1 + index) * 0.1);
        _qExtra.setFromEuler(_euler);
        outQuat.multiply(_qExtra);
      } else {
        _mat4.lookAt(_vB.set(0, 0, 0), _vA, _up);
        outQuat.setFromRotationMatrix(_mat4);
        _euler.set(Math.PI * 0.5, 0, time * 0.6 + index * 0.3);
        _qExtra.setFromEuler(_euler);
        outQuat.multiply(_qExtra);
      }

      const s = 0.88 + 0.18 * (wave * 0.5 + 0.5);
      outScaleMult.set(s, s, s);
    },
  };
}

function makeOrbitCoreSlot(radius, speed, tiltX, tiltZ, phase) {
  return {
    evaluate(time, outPos, outQuat, outScaleMult) {
      const a = time * speed + phase;
      outPos.set(
        Math.cos(a) * radius,
        Math.sin(a * 1.5 + phase) * radius * 0.35,
        Math.sin(a) * radius
      );
      _euler.set(tiltX, 0, tiltZ);
      _qExtra.setFromEuler(_euler);
      outPos.applyQuaternion(_qExtra);

      _euler.set(time * 0.7, time * 0.9, time * 0.5);
      outQuat.setFromEuler(_euler);
      const pulse = 0.92 + 0.14 * Math.sin(time * 2.4 + phase);
      outScaleMult.set(pulse, pulse, pulse);
    },
  };
}

function makeTourbillonSubOrbitSlot(parentRadius, parentSpeed, subRadius, subSpeed, tiltX, tiltZ, phase) {
  return {
    evaluate(time, outPos, outQuat, outScaleMult) {
      const pa = time * parentSpeed + phase;
      const sa = time * subSpeed + phase * 2.3;
      const cx = Math.cos(pa) * parentRadius;
      const cz = Math.sin(pa) * parentRadius;
      const sx = Math.cos(sa) * subRadius;
      const sy = Math.sin(sa * 1.5) * subRadius * 0.72;
      const sz = Math.sin(sa) * subRadius;

      outPos.set(cx + sx, sy, cz + sz);
      _euler.set(tiltX + Math.sin(time * 0.16) * 0.22, time * 0.08, tiltZ);
      _qExtra.setFromEuler(_euler);
      outPos.applyQuaternion(_qExtra);

      _euler.set(time * 0.9 + phase, time * 1.15, time * 0.65);
      outQuat.setFromEuler(_euler);
      const b = 0.92 + 0.12 * Math.sin(time * 2.0 + phase);
      outScaleMult.set(b, b, b);
    },
  };
}

function pickSurfaceMaterial(role) {
  if (role === 'translucent') {
    return weightedPick([
      { value: 'crystalVeil', weight: 3.4 },
      { value: 'dichroicGlass', weight: 3.4 },
      { value: 'tintedCrystal', weight: 2.5 },
      { value: 'frostedSheer', weight: 1.8 },
    ]);
  }
  if (role === 'glass') {
    return weightedPick([
      { value: 'dichroicGlass', weight: 3.0 },
      { value: 'crystalVeil', weight: 2.8 },
      { value: 'opticalGlass', weight: 2.6 },
      { value: 'tintedCrystal', weight: 2.2 },
      { value: 'iridescentOpal', weight: 2.0 },
      { value: 'smokedGlass', weight: 1.4 },
    ]);
  }
  if (role === 'metal') {
    return weightedPick([
      { value: 'liquidMetal', weight: 4.0 },
      { value: 'chromeMirror', weight: 3.4 },
      { value: 'obsidianLacquer', weight: 2.4 },
    ]);
  }
  return weightedPick([
    { value: 'dichroicGlass', weight: 2.8 },
    { value: 'crystalVeil', weight: 2.5 },
    { value: 'liquidMetal', weight: 2.8 },
    { value: 'chromeMirror', weight: 2.4 },
    { value: 'opticalGlass', weight: 2.2 },
    { value: 'obsidianLacquer', weight: 2.0 },
    { value: 'tintedCrystal', weight: 1.8 },
    { value: 'iridescentOpal', weight: 1.6 },
  ]);
}

// =========================================================================
// STRATUM 2: CALIBRATED HOROLOGICAL FRAMING DIALS (NON-GEAR)
// Frames the connected meshed gear train without obscuring tooth-to-tooth action!
// =========================================================================
function buildHorologicalDialFrameLayer(palette, sharedFrame) {
  const nodes = [];

  // 1. Chassis-mounted calibrated vernier bezel surrounding the connected geartrain plane
  nodes.push({
    shape: 'vernierDial',
    materialType: pick(['liquidMetal', 'chromeMirror']),
    palette,
    targetScale: new THREE.Vector3(5.6, 5.6, 5.6),
    slot: makeFrameFixedGearSlot(sharedFrame, 0, 0, 0, randRange(-0.18, 0.18), 0),
    spawnDelay: 0.48,
    growDuration: 2.5,
    growStyle: 'uniform',
    renderOrder: 5,
  });

  // 2. Orthogonal outer resonator & iris bezel rings
  const dialShapes = ['tuningForkRing', 'irisBlades'];
  for (let i = 0; i < 2; i++) {
    const sc = 4.9 + i * 0.75;
    nodes.push({
      shape: dialShapes[i],
      materialType: i === 0 ? 'dichroicGlass' : 'crystalVeil',
      palette,
      targetScale: new THREE.Vector3(sc, sc, sc),
      slot: makeGimbalSlot(
        randRange(-1.1, 1.1),
        randRange(0, TAU),
        randRange(-1.1, 1.1),
        (i % 2 === 0 ? 1 : -1) * 0.09,
        (i % 2 === 0 ? -1 : 1) * 0.13,
        (i % 2 === 0 ? 1 : -1) * 0.22,
        i * 1.4,
        { escapementAmp: 0.04, escapementFreq: 4.0 }
      ),
      spawnDelay: 0.65 + i * 0.25,
      growDuration: 2.7,
      growStyle: 'uniform',
      renderOrder: 6 + i,
    });
  }

  return nodes;
}

// =========================================================================
// STRATUM 4: ENVELOPING WHISPER-CLEAR CONTAINMENT SHELLS & OUTER CAGES
// Ultra-clear translucent outer glass domes & filigree cages so you peer
// straight through glass into the meshed clockwork machinery turning inside!
// =========================================================================
function buildTranslucentContainmentLayer(palette) {
  const nodes = [];
  const style = pick([
    'dyson-crystal-dome',
    'double-cage-and-iris',
    'armillary-glass-shroud',
    'calibrated-veil-rings',
  ]);

  if (style === 'dyson-crystal-dome') {
    nodes.push({
      shape: 'ribbedGlassShell',
      materialType: 'crystalVeil',
      palette,
      targetScale: new THREE.Vector3(6.0, 6.0, 6.0),
      slot: makeGimbalSlot(0.2, 0.5, -0.3, 0.04, 0.08, -0.04, 0.5),
      spawnDelay: 0.9,
      growDuration: 3.3,
      growStyle: 'uniform',
      renderOrder: 8,
    });
    nodes.push({
      shape: 'doubleCage',
      materialType: pick(['chromeMirror', 'crystalVeil']),
      palette,
      targetScale: new THREE.Vector3(6.6, 6.6, 6.6),
      slot: makeGimbalSlot(-0.4, 0.2, 0.5, -0.05, -0.09, 0.04, 1.8),
      spawnDelay: 1.15,
      growDuration: 3.4,
      growStyle: 'uniform',
      renderOrder: 9,
    });
  } else if (style === 'double-cage-and-iris') {
    nodes.push({
      shape: 'doubleCage',
      materialType: 'liquidMetal',
      palette,
      targetScale: new THREE.Vector3(6.1, 6.1, 6.1),
      slot: makeGimbalSlot(0.3, 0.6, -0.4, 0.07, -0.1, 0.05, 0.4),
      spawnDelay: 0.9,
      growDuration: 3.2,
      growStyle: 'uniform',
    });
    nodes.push({
      shape: 'sphere',
      materialType: 'crystalVeil',
      palette,
      targetScale: new THREE.Vector3(6.7, 6.7, 6.7),
      slot: makeGimbalSlot(0.1, -0.4, 0.2, 0.04, 0.07, -0.03, 2.1),
      spawnDelay: 1.2,
      growDuration: 3.5,
      growStyle: 'uniform',
      renderOrder: 9,
    });
  } else if (style === 'armillary-glass-shroud') {
    nodes.push({
      shape: 'gyroArmillary',
      materialType: pick(['dichroicGlass', 'chromeMirror']),
      palette,
      targetScale: new THREE.Vector3(6.1, 6.1, 6.1),
      slot: makeGimbalSlot(0.4, 0.3, -0.5, 0.06, 0.1, -0.05, 0.6),
      spawnDelay: 0.9,
      growDuration: 3.3,
      growStyle: 'uniform',
      renderOrder: 8,
    });
    nodes.push({
      shape: 'ribbedGlassShell',
      materialType: 'frostedSheer',
      palette,
      targetScale: new THREE.Vector3(6.7, 6.7, 6.7),
      slot: makeGimbalSlot(-0.3, 0.7, 0.2, -0.04, -0.07, 0.04, 1.9),
      spawnDelay: 1.15,
      growDuration: 3.5,
      growStyle: 'uniform',
      renderOrder: 9,
    });
  } else {
    ['opticalAperture', 'segmentedArc'].forEach((shape, idx) => {
      const sc = 6.0 + idx * 0.75;
      nodes.push({
        shape,
        materialType: idx === 0 ? 'dichroicGlass' : 'crystalVeil',
        palette,
        targetScale: new THREE.Vector3(sc, sc, sc),
        slot: makeGimbalSlot(
          randRange(-1.0, 1.0),
          randRange(0, TAU),
          randRange(-1.0, 1.0),
          randRange(-0.08, 0.08),
          randRange(-0.12, 0.12),
          randRange(-0.14, 0.14),
          idx * 1.4
        ),
        spawnDelay: 0.95 + idx * 0.28,
        growDuration: 3.2,
        growStyle: 'uniform',
        renderOrder: 8 + idx,
      });
    });
  }

  return nodes;
}

// =========================================================================
// 9 HYPER-INTRICATE CONNECTED-GEARTRAIN ALIEN CLOCKWORK ARCHITECTURES
// Every single gear is mathematically meshed inside a connected geartrain!
// =========================================================================

function buildAlienGrandComplicationCore(palette) {
  const assembly = buildConnectedClockworkAssembly(palette, 'coaxial-planetary-and-train');
  const nodes = [...assembly.nodes];
  const ribbons = [];

  // Coaxial iris & segmented bezel mounted cleanly outside the connected geartrain decks
  nodes.push(
    {
      shape: 'irisBlades',
      materialType: 'dichroicGlass',
      palette,
      targetScale: new THREE.Vector3(4.5, 4.5, 4.5),
      slot: makeFrameFixedGearSlot(assembly.frame, 0, 0, -1.05, -0.25, 0.4),
      spawnDelay: 0.42,
      growDuration: 2.5,
      growStyle: 'uniform',
      renderOrder: 5,
    },
    {
      shape: 'segmentedArc',
      materialType: 'chromeMirror',
      palette,
      targetScale: new THREE.Vector3(4.85, 4.85, 4.85),
      slot: makeFrameFixedGearSlot(assembly.frame, 0, 0, 1.05, 0.22, 1.2),
      spawnDelay: 0.5,
      growDuration: 2.6,
      growStyle: 'uniform',
      renderOrder: 5,
    }
  );

  // 18 peripheral optical lenses, articulated spires & helical coils orbiting outside the gear plane
  const orbitA = createOrbitalRingPath({ radius: 4.1, ecc: 0.06 });
  const orbitB = createEpitrochoidPath({ R: 2.8, r: 0.9, d: 1.4 });
  const satShapes = ['articulatedSpire', 'lensDisc', 'helicalCoil', 'hollowPrismRing', 'starPolyhedron'];
  for (let i = 0; i < 18; i++) {
    const onA = i % 2 === 0;
    const sz = randRange(0.32, 0.54);
    nodes.push({
      shape: satShapes[i % satShapes.length],
      materialType: i % 3 === 0 ? pickSurfaceMaterial('translucent') : i % 3 === 1 ? 'opticalGlass' : pickSurfaceMaterial('metal'),
      palette,
      targetScale: new THREE.Vector3(sz, sz, sz),
      slot: makePathFollowerSlot(onA ? orbitA : orbitB, i / 18, onA ? 0.038 : -0.032, {
        alignToTangent: true,
        spinSpeed: 1.4,
      }),
      spawnDelay: 0.5 + i * 0.06,
      growDuration: randRange(1.9, 2.7),
      growStyle: 'bud',
    });
  }

  ribbons.push(
    { path: orbitA, radius: 0.044, materialType: 'crystalVeil', palette, spawnDelay: 0.45 },
    { path: orbitB, radius: 0.034, materialType: 'dichroicGlass', palette, spawnDelay: 0.7 },
    { path: createHelixPath({ radius: 3.1, height: 5.8, turns: 2.8 }), radius: 0.024, materialType: 'chromeMirror', palette, spawnDelay: 0.95 },
    { path: createHelixPath({ radius: 3.1, height: 5.8, turns: 2.8, strandOffset: Math.PI }), radius: 0.018, materialType: 'emissiveCore', palette, spawnDelay: 1.15 }
  );

  return { subtitle: 'Alien Grand Complication', nodes, ribbons, frame: assembly.frame };
}

function buildEpicyclicEngineCore(palette) {
  const assembly = buildConnectedClockworkAssembly(palette, 'twin-coaxial-planetary');
  const nodes = [...assembly.nodes];
  const ribbons = [];

  const trackA = createEpitrochoidPath({ R: 2.9, r: 0.95, d: 1.5 });
  const trackB = createRoseOrbitPath({ R: 4.25 });
  const satShapes = ['lensDisc', 'articulatedSpire', 'starPolyhedron', 'helicalCoil', 'hollowPrismRing'];

  for (let i = 0; i < 18; i++) {
    const onA = i % 2 === 0;
    const sz = randRange(0.32, 0.54);
    nodes.push({
      shape: satShapes[i % satShapes.length],
      materialType: i % 2 === 0 ? pickSurfaceMaterial('translucent') : pickSurfaceMaterial('metal'),
      palette,
      targetScale: new THREE.Vector3(sz, sz, sz),
      slot: makePathFollowerSlot(onA ? trackA : trackB, i / 18, onA ? 0.036 : -0.03, {
        alignToTangent: true,
        spinSpeed: 1.5,
      }),
      spawnDelay: 0.5 + i * 0.06,
      growDuration: randRange(1.9, 2.7),
      growStyle: 'bud',
    });
  }

  ribbons.push(
    { path: trackA, radius: 0.046, materialType: 'crystalVeil', palette, spawnDelay: 0.45 },
    { path: trackB, radius: 0.034, materialType: 'dichroicGlass', palette, spawnDelay: 0.75 },
    { path: createOrbitalRingPath({ radius: 4.35 }), radius: 0.022, materialType: 'chromeMirror', palette, spawnDelay: 1.0 },
    { path: createLemniscate3DPath({ scale: 4.3 }), radius: 0.018, materialType: 'emissiveCore', palette, spawnDelay: 1.2 }
  );

  return { subtitle: 'Epicyclic Horology Engine', nodes, ribbons, frame: assembly.frame };
}

function buildCompoundTrainCore(palette) {
  const assembly = buildConnectedClockworkAssembly(palette, 'compound-train-hero');
  const nodes = [...assembly.nodes];
  const ribbons = [];

  // Encompassing calibrated armillary & optical lenses framing the sprawling 13-gear compound train
  nodes.push(
    {
      shape: 'gyroArmillary',
      materialType: 'dichroicGlass',
      palette,
      targetScale: new THREE.Vector3(4.65, 4.65, 4.65),
      slot: makeGimbalSlot(0.5, 0.8, -0.4, 0.12, -0.16, 0.08, 0.3),
      spawnDelay: 0.45,
      growDuration: 2.7,
      growStyle: 'uniform',
      renderOrder: 6,
    },
    {
      shape: 'segmentedArc',
      materialType: 'liquidMetal',
      palette,
      targetScale: new THREE.Vector3(5.1, 5.1, 5.1),
      slot: makeGimbalSlot(-0.7, 0.3, 0.9, -0.14, 0.18, -0.12, 1.4, { escapementAmp: 0.04, escapementFreq: 4.0 }),
      spawnDelay: 0.55,
      growDuration: 2.7,
      growStyle: 'uniform',
      renderOrder: 6,
    }
  );

  const ringPath = createOrbitalRingPath({ radius: 4.3 });
  const satShapes = ['articulatedSpire', 'lensDisc', 'helicalCoil', 'crystalPrism', 'starPolyhedron'];
  for (let i = 0; i < 16; i++) {
    const sz = randRange(0.32, 0.52);
    nodes.push({
      shape: satShapes[i % satShapes.length],
      materialType: i % 2 === 0 ? pickSurfaceMaterial('glass') : pickSurfaceMaterial('metal'),
      palette,
      targetScale: new THREE.Vector3(sz, sz, sz),
      slot: makePathFollowerSlot(ringPath, i / 16, 0.036, { alignToTangent: true, spinSpeed: 1.3 }),
      spawnDelay: 0.5 + i * 0.065,
      growDuration: randRange(1.9, 2.7),
      growStyle: 'bud',
    });
  }

  ribbons.push(
    { path: ringPath, radius: 0.044, materialType: 'crystalVeil', palette, spawnDelay: 0.45 },
    { path: createLissajousPath({ ax: 4.1, ay: 3.5, az: 4.1 }), radius: 0.032, materialType: 'dichroicGlass', palette, spawnDelay: 0.75 },
    { path: createTorusKnotPath({ p: 2, q: 3, R: 3.7, r: 0.75 }), radius: 0.022, materialType: 'chromeMirror', palette, spawnDelay: 1.0 },
    { path: createOrbitalRingPath({ radius: 4.55 }), radius: 0.018, materialType: 'emissiveCore', palette, spawnDelay: 1.2 }
  );

  return { subtitle: 'Compound Watchmaker Train', nodes, ribbons, frame: assembly.frame };
}

function buildQuantumDysonChronometerCore(palette) {
  const assembly = buildConnectedClockworkAssembly(palette, 'coaxial-planetary-and-train');
  const nodes = [...assembly.nodes];
  const ribbons = [];

  const shells = [
    { shape: 'doubleCage', sc: 4.45, mat: 'dichroicGlass', sx: -0.14, sy: 0.2, sz: -0.1 },
    { shape: 'segmentedArc', sc: 4.9, mat: 'obsidianLacquer', sx: 0.18, sy: 0.22, sz: 0.12 },
    { shape: 'segmentedArc', sc: 4.9, mat: 'opticalGlass', sx: -0.18, sy: -0.22, sz: -0.12 },
  ];
  shells.forEach((sh, i) => {
    nodes.push({
      shape: sh.shape,
      materialType: sh.mat,
      palette,
      targetScale: new THREE.Vector3(sh.sc, sh.sc, sh.sc),
      slot: makeGimbalSlot(i * 0.85, i * 1.1, -i * 0.6, sh.sx, sh.sy, sh.sz, i, {
        escapementAmp: i % 2 === 0 ? 0.04 : 0.0,
        escapementFreq: 5.0,
      }),
      spawnDelay: 0.35 + i * 0.18,
      growDuration: 2.7,
      growStyle: 'uniform',
      renderOrder: 5 + (i % 3),
    });
  });

  // 20 radial articulated chronometer spires & crystal capacitors on an outer golden sphere
  const count = 20;
  for (let i = 0; i < count; i++) {
    const isSpire = i % 2 === 0;
    const sz = isSpire ? randRange(0.46, 0.68) : randRange(0.32, 0.5);
    nodes.push({
      shape: isSpire ? 'articulatedSpire' : pick(['lensDisc', 'starPolyhedron', 'helicalCoil', 'crystalPrism']),
      materialType: isSpire
        ? i % 4 === 0
          ? 'liquidMetal'
          : pickSurfaceMaterial('translucent')
        : 'opticalGlass',
      palette,
      targetScale: new THREE.Vector3(sz, sz * (isSpire ? 1.2 : 1.0), sz),
      slot: makePhyllotaxisSlot(i, count, isSpire ? 3.9 : 4.25, 1.05, 0.18, 1.4, 'radial'),
      spawnDelay: 0.45 + (i / count) * 1.5,
      growDuration: randRange(1.9, 2.7),
      growStyle: isSpire ? 'axial' : 'uniform',
    });
  }

  ribbons.push(
    { path: createTorusKnotPath({ p: 3, q: 5, R: 3.7, r: 0.85 }), radius: 0.042, materialType: 'crystalVeil', palette, spawnDelay: 0.45 },
    { path: createLissajousPath({ ax: 4.2, ay: 3.6, az: 4.2 }), radius: 0.032, materialType: 'dichroicGlass', palette, spawnDelay: 0.75 },
    { path: createOrbitalRingPath({ radius: 4.4 }), radius: 0.022, materialType: 'chromeMirror', palette, spawnDelay: 0.95 },
    { path: createLemniscate3DPath({ scale: 4.35 }), radius: 0.018, materialType: 'emissiveCore', palette, spawnDelay: 1.2 }
  );

  return { subtitle: 'Quantum Dyson Chronometer', nodes, ribbons, frame: assembly.frame };
}

function buildCelestialOrreryEngineCore(palette) {
  const assembly = buildConnectedClockworkAssembly(palette, 'twin-coaxial-planetary');
  const nodes = [...assembly.nodes];
  const ribbons = [];

  // 4 peripheral optical tourbillon pods (non-gear lenses, nested tori, spires & coils)
  const podCount = 4;
  const perPod = 5;
  const subShapes = ['nestedTorus', 'lensDisc', 'articulatedSpire', 'starPolyhedron', 'helicalCoil'];
  for (let p = 0; p < podCount; p++) {
    const pPhase = (p / podCount) * TAU;
    const tiltX = randRange(-0.85, 0.85);
    const tiltZ = randRange(-0.85, 0.85);
    for (let j = 0; j < perPod; j++) {
      const isCenter = j === 0;
      const sz = isCenter ? 0.68 : randRange(0.26, 0.44);
      nodes.push({
        shape: subShapes[j],
        materialType: isCenter
          ? p % 2 === 0
            ? 'liquidMetal'
            : 'dichroicGlass'
          : j % 2 === 0
            ? pickSurfaceMaterial('translucent')
            : pickSurfaceMaterial('metal'),
        palette,
        targetScale: new THREE.Vector3(sz, sz, sz),
        slot: makeTourbillonSubOrbitSlot(
          3.95 + (p % 2) * 0.4,
          0.22 * (p % 2 === 0 ? 1 : -1),
          isCenter ? 0.0 : 0.78,
          1.25 * (j % 2 === 0 ? 1 : -1),
          tiltX,
          tiltZ,
          pPhase + (j / perPod) * TAU
        ),
        spawnDelay: 0.4 + p * 0.14 + j * 0.05,
        growDuration: randRange(1.9, 2.8),
        growStyle: isCenter ? 'uniform' : 'bud',
      });
    }
  }

  ribbons.push(
    { path: createEpitrochoidPath({ R: 2.8, r: 0.9, d: 1.45 }), radius: 0.046, materialType: 'crystalVeil', palette, spawnDelay: 0.45 },
    { path: createEpitrochoidPath({ R: 3.0, r: 0.95, d: 1.6, ratio: 5 }), radius: 0.034, materialType: 'dichroicGlass', palette, spawnDelay: 0.75 },
    { path: createRoseOrbitPath({ R: 4.35 }), radius: 0.022, materialType: 'liquidMetal', palette, spawnDelay: 0.95 },
    { path: createOrbitalRingPath({ radius: 4.0 }), radius: 0.018, materialType: 'emissiveCore', palette, spawnDelay: 1.15 }
  );

  return { subtitle: 'Celestial Orrery Engine', nodes, ribbons, frame: assembly.frame };
}

function buildRadiolarianCathedralCore(palette) {
  const assembly = buildConnectedClockworkAssembly(palette, 'compound-train-hero');
  const nodes = [...assembly.nodes];
  const ribbons = [];

  const shellSpecs = [
    { shape: 'ribbedGlassShell', mat: 'dichroicGlass', sc: 4.5, order: 5 },
    { shape: 'starPolyhedron', mat: 'crystalVeil', sc: 4.9, order: 6 },
  ];
  shellSpecs.forEach((sh, i) => {
    nodes.push({
      shape: sh.shape,
      materialType: sh.mat,
      palette,
      targetScale: new THREE.Vector3(sh.sc, sh.sc, sh.sc),
      slot: makeGimbalSlot(
        i * 0.7,
        i * 1.1,
        -i * 0.5,
        (i % 2 === 0 ? 1 : -1) * 0.14,
        (i % 2 === 0 ? -1 : 1) * 0.18,
        0.09,
        i
      ),
      spawnDelay: 0.45 + i * 0.25,
      growDuration: 2.7,
      growStyle: 'uniform',
      renderOrder: sh.order,
    });
  });

  const spireCount = 20;
  for (let i = 0; i < spireCount; i++) {
    const isSpire = i % 2 === 0;
    const sz = randRange(0.4, 0.64);
    nodes.push({
      shape: isSpire ? 'articulatedSpire' : pick(['crystalPrism', 'helicalCoil', 'lensDisc', 'octahedron']),
      materialType: isSpire ? 'opticalGlass' : pickSurfaceMaterial('translucent'),
      palette,
      targetScale: new THREE.Vector3(sz, sz * (isSpire ? 1.25 : 1.0), sz),
      slot: makePhyllotaxisSlot(i, spireCount, isSpire ? 3.85 : 4.2, 1.1, 0.18, 1.35, 'radial'),
      spawnDelay: 0.45 + (i / spireCount) * 1.5,
      growDuration: randRange(1.9, 2.7),
      growStyle: 'axial',
    });
  }

  ribbons.push(
    { path: createSpiralVortexPath({ maxR: 4.25, turns: 3.2 }), radius: 0.046, materialType: 'crystalVeil', palette, spawnDelay: 0.55 },
    { path: createSpiralVortexPath({ maxR: 4.25, turns: 3.2, phase: Math.PI }), radius: 0.034, materialType: 'dichroicGlass', palette, spawnDelay: 0.85 },
    { path: createLissajousPath({ ax: 4.0, ay: 3.4, az: 4.0 }), radius: 0.02, materialType: 'emissiveCore', palette, spawnDelay: 1.1 },
    { path: createOrbitalRingPath({ radius: 4.45 }), radius: 0.022, materialType: 'chromeMirror', palette, spawnDelay: 1.3 }
  );

  return { subtitle: 'Radiolarian Glass Cathedral', nodes, ribbons, frame: assembly.frame };
}

function buildAstrolabeCore(palette) {
  const assembly = buildConnectedClockworkAssembly(palette, 'dual-parallel-trains');
  const nodes = [...assembly.nodes];
  const ribbons = [];
  const ringShapes = ['opticalAperture', 'hollowPrismRing', 'segmentedArc', 'thinRing'];

  for (let i = 0; i < ringShapes.length; i++) {
    const scale = 4.25 + i * 0.46;
    nodes.push({
      shape: ringShapes[i],
      materialType: i % 2 === 0 ? pickSurfaceMaterial('translucent') : 'liquidMetal',
      palette,
      targetScale: new THREE.Vector3(scale, scale, scale),
      slot: makeGimbalSlot(
        randRange(0, Math.PI),
        randRange(0, Math.PI),
        randRange(0, Math.PI),
        randRange(-0.22, 0.22),
        randRange(-0.28, 0.28),
        randRange(-0.2, 0.2),
        i * 0.8,
        { escapementAmp: i % 2 === 0 ? 0.04 : 0.0, escapementFreq: 4.5 }
      ),
      spawnDelay: 0.35 + i * 0.18,
      growDuration: randRange(2.2, 2.9),
      growStyle: 'uniform',
      renderOrder: 5 + (i % 3),
    });
  }

  const trackA = createOrbitalRingPath({ radius: 4.05 });
  const trackB = createLemniscate3DPath({ scale: 4.35 });
  const satShapes = ['articulatedSpire', 'lensDisc', 'starPolyhedron', 'helicalCoil', 'crystalPrism'];

  for (let i = 0; i < 16; i++) {
    const onA = i % 2 === 0;
    const sz = randRange(0.28, 0.5);
    nodes.push({
      shape: satShapes[i % satShapes.length],
      materialType: onA ? pickSurfaceMaterial('glass') : pickSurfaceMaterial('metal'),
      palette,
      targetScale: new THREE.Vector3(sz, sz, sz),
      slot: makePathFollowerSlot(onA ? trackA : trackB, i / 16, onA ? 0.042 : -0.036, {
        alignToTangent: true,
        spinSpeed: 1.4,
      }),
      spawnDelay: 0.5 + i * 0.06,
      growDuration: randRange(1.8, 2.7),
      growStyle: 'bud',
    });
  }

  ribbons.push(
    { path: trackA, radius: 0.044, materialType: 'crystalVeil', palette, spawnDelay: 0.5 },
    { path: trackB, radius: 0.034, materialType: 'dichroicGlass', palette, spawnDelay: 0.8 },
    { path: createOrbitalRingPath({ radius: 4.6 }), radius: 0.022, materialType: 'chromeMirror', palette, spawnDelay: 1.05 },
    { path: createOrbitalRingPath({ radius: 4.85 }), radius: 0.018, materialType: 'emissiveCore', palette, spawnDelay: 1.25 }
  );

  return { subtitle: 'Gyroscopic Alien Astrolabe', nodes, ribbons, frame: assembly.frame };
}

function buildHelixSculptureCore(palette) {
  const assembly = buildConnectedClockworkAssembly(palette, 'coaxial-planetary-and-train');
  const nodes = [...assembly.nodes];
  const ribbons = [];

  const strands = 3;
  const perStrand = 7;
  const radius = randRange(3.25, 3.75);
  const height = randRange(6.2, 7.2);
  const turns = randRange(2.4, 3.2);
  const speed = randRange(0.22, 0.36) * (Math.random() < 0.5 ? 1 : -1);

  const shapeA = pick(['hollowPrismRing', 'lensDisc', 'nestedTorus']);
  const shapeB = pick(['articulatedSpire', 'helicalCoil', 'starPolyhedron', 'crystalPrism']);

  for (let s = 0; s < strands; s++) {
    const strandOffset = (s / strands) * TAU;
    const hPath = createHelixPath({ radius, height, turns, strandOffset, speed });

    ribbons.push({
      path: hPath,
      radius: s === 0 ? 0.056 : s === 1 ? 0.04 : 0.026,
      materialType: s === 0 ? 'dichroicGlass' : s === 1 ? 'crystalVeil' : 'chromeMirror',
      palette,
      spawnDelay: 0.35 + s * 0.22,
    });

    for (let i = 0; i < perStrand; i++) {
      const u = (i + 0.5) / perStrand;
      const env = 0.65 + 0.5 * Math.sin(u * Math.PI);
      const sz = randRange(0.32, 0.54) * env;
      nodes.push({
        shape: (i + s) % 2 === 0 ? shapeA : shapeB,
        materialType: s === 2 ? pickSurfaceMaterial('metal') : pickSurfaceMaterial('glass'),
        palette,
        targetScale: new THREE.Vector3(sz, sz, sz),
        slot: makePathFollowerSlot(hPath, u, 0.0, { alignToTangent: true, spinSpeed: 1.5 }),
        spawnDelay: 0.45 + u * 1.4 + s * 0.16,
        growDuration: randRange(1.8, 2.6),
        growStyle: 'bud',
      });
    }
  }

  ribbons.push({
    path: createHelixPath({ radius: radius * 0.85, height: height * 0.92, turns: turns * 1.4, speed: -speed * 1.2 }),
    radius: 0.018,
    materialType: 'emissiveCore',
    palette,
    spawnDelay: 0.9,
  });

  return { subtitle: 'Triple-Helix Clockwork Conduit', nodes, ribbons, frame: assembly.frame };
}

function buildTorusKnotConstellationCore(palette) {
  const assembly = buildConnectedClockworkAssembly(palette, 'twin-coaxial-planetary');
  const nodes = [...assembly.nodes];
  const ribbons = [];

  const p = pick([2, 3, 4]);
  const q = pick([3, 5, 7].filter((v) => v !== p));
  const R = randRange(3.55, 4.05);
  const r = randRange(0.78, 1.08);
  const knotPath = createTorusKnotPath({ p, q, R, r });

  const count = 20;
  const mainShapes = ['irisBlades', 'hollowPrismRing', 'lensDisc', 'nestedTorus'];
  const altShapes = ['articulatedSpire', 'starPolyhedron', 'helicalCoil', 'crystalPrism'];

  for (let i = 0; i < count; i++) {
    const u = i / count;
    const alt = i % 2 === 0;
    const sz = alt ? randRange(0.32, 0.5) : randRange(0.4, 0.62);
    nodes.push({
      shape: alt ? altShapes[i % altShapes.length] : mainShapes[i % mainShapes.length],
      materialType: alt
        ? pickSurfaceMaterial('metal')
        : i % 3 === 0
          ? pickSurfaceMaterial('translucent')
          : 'opticalGlass',
      palette,
      targetScale: new THREE.Vector3(sz, sz, sz),
      slot: makePathFollowerSlot(knotPath, u, 0.028, { alignToTangent: true, spinSpeed: 1.5 }),
      spawnDelay: 0.4 + u * 1.5,
      growDuration: randRange(1.8, 2.7),
      growStyle: 'uniform',
    });
  }

  ribbons.push(
    { path: knotPath, radius: 0.062, materialType: 'crystalVeil', palette, spawnDelay: 0.35 },
    { path: createTorusKnotPath({ p, q, R: R * 1.06, r: r * 0.82, phase: Math.PI / p }), radius: 0.038, materialType: 'dichroicGlass', palette, spawnDelay: 0.7 },
    { path: createTorusKnotPath({ p, q, R: R * 0.94, r: r * 1.1, phase: (Math.PI * 2) / p }), radius: 0.02, materialType: 'emissiveCore', palette, spawnDelay: 1.0 },
    { path: createOrbitalRingPath({ radius: R + r * 0.85 }), radius: 0.022, materialType: 'chromeMirror', palette, spawnDelay: 1.2 }
  );

  return { subtitle: `Toroidal Clockwork (${p}:${q})`, nodes, ribbons, frame: assembly.frame };
}

// =========================================================================
// STRATUM 0: QUANTUM SINGULARITY JEWEL HEART & ORBITING FLARE SPARKS
// =========================================================================
function buildLuminousCores(palette) {
  const cores = [];
  const sz = randRange(0.28, 0.38);
  cores.push({
    shape: pick(['starPolyhedron', 'octahedron', 'icosahedron']),
    materialType: 'emissiveCore',
    palette,
    targetScale: new THREE.Vector3(sz, sz, sz),
    slot: {
      evaluate(time, outPos, outQuat, outScaleMult) {
        outPos.set(
          Math.sin(time * 0.45) * 0.06,
          Math.cos(time * 0.6) * 0.06,
          Math.sin(time * 0.35 + 1.0) * 0.06
        );
        _euler.set(time * 0.5, time * 0.7, time * 0.4);
        outQuat.setFromEuler(_euler);
        const p = 0.92 + 0.12 * Math.sin(time * 2.2);
        outScaleMult.set(p, p, p);
      },
    },
    spawnDelay: 0.0,
    growDuration: 2.0,
    growStyle: 'uniform',
    isFlareEmitter: true,
    flareStrength: 0.92,
  });

  const orbiterCount = pick([2, 3]);
  const orbitR = randRange(3.6, 4.5);
  const orbitSpeed = randRange(0.36, 0.62) * (Math.random() < 0.5 ? 1 : -1);
  const tiltX = randRange(-0.9, 0.9);
  const tiltZ = randRange(-0.9, 0.9);

  for (let i = 0; i < orbiterCount; i++) {
    const s = randRange(0.16, 0.24);
    cores.push({
      shape: pick(['starPolyhedron', 'octahedron', 'sphere']),
      materialType: 'emissiveCore',
      palette,
      targetScale: new THREE.Vector3(s, s, s),
      slot: makeOrbitCoreSlot(
        orbitR * (1 + i * 0.1),
        orbitSpeed * (i % 2 === 0 ? 1 : -0.82),
        tiltX + i * 0.45,
        tiltZ - i * 0.38,
        (i / orbiterCount) * TAU
      ),
      spawnDelay: 0.35 + i * 0.28,
      growDuration: randRange(1.8, 2.4),
      growStyle: 'bud',
      isFlareEmitter: true,
      flareStrength: randRange(0.65, 0.88),
    });
  }

  return cores;
}

const CORE_BUILDERS = [
  buildAlienGrandComplicationCore,
  buildEpicyclicEngineCore,
  buildCompoundTrainCore,
  buildQuantumDysonChronometerCore,
  buildCelestialOrreryEngineCore,
  buildRadiolarianCathedralCore,
  buildAstrolabeCore,
  buildHelixSculptureCore,
  buildTorusKnotConstellationCore,
];

let _lastCoreIdx = -1;

/**
 * Composes an intricate 5-stratum connected-geartrain alien clockwork kinetic system:
 * - Stratum 0: Luminous jewel-bearing singularity heart & orbiting flare sparks
 * - Stratum 1: Hero mathematically meshed Geartrain Assembly (Epicyclic Planetary Gearboxes
 *              and/or Multi-Deck Compound Branching Trains with axles & watchmaker bridges — ZERO free-floating gears!)
 * - Stratum 2: Calibrated horological framing vernier dials & resonator halos
 * - Stratum 3: Peripheral optical tourbillon satellites, spires & 4 braided optical conduits
 * - Stratum 4: Whisper-clear enveloping translucent glass domes & filigree double-cages
 */
export function composeSystem(palette) {
  let idx = randInt(0, CORE_BUILDERS.length - 1);
  if (idx === _lastCoreIdx) {
    idx = (idx + randInt(1, CORE_BUILDERS.length - 1)) % CORE_BUILDERS.length;
  }
  _lastCoreIdx = idx;

  const core = CORE_BUILDERS[idx](palette);
  const flareCores = buildLuminousCores(palette);
  const dialFrame = buildHorologicalDialFrameLayer(palette, core.frame);
  const containment = buildTranslucentContainmentLayer(palette);

  return {
    name: `${palette.name} · ${core.subtitle}`,
    subtitle: core.subtitle,
    palette,
    nodeSpecs: [...flareCores, ...core.nodes, ...dialFrame, ...containment],
    ribbonSpecs: core.ribbons,
  };
}
