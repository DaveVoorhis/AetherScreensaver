import * as THREE from 'three';
import { GEAR_MODULE, getGearPitchRadius } from './geometries.js';
import { TAU, randRange, randInt, pick, weightedPick } from './math.js';

const _vLocal = new THREE.Vector3();
const _vFramePos = new THREE.Vector3();
const _qFrame = new THREE.Quaternion();
const _qLocal = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _zAxis = new THREE.Vector3(0, 0, 1);

export const EXTERNAL_GEAR_TEETH = [8, 10, 12, 16, 20, 24];

export function gearShapeName(teeth) {
  return `gear${teeth}`;
}

export function ringGearShapeName(teeth) {
  return `ringGear${teeth}`;
}

/**
 * Valid epicyclic planetary sets where Z_R = Z_S + 2 * Z_P AND (Z_S + Z_R) % N === 0,
 * guaranteeing all N planets mesh simultaneously with BOTH the sun gear and the
 * internal-toothed outer ring gear with zero slip!
 */
export const PLANETARY_CONFIGS = [
  { sun: 16, planet: 8, ring: 32, planets: [3, 4, 6] },
  { sun: 12, planet: 10, ring: 32, planets: [4] },
  { sun: 12, planet: 12, ring: 36, planets: [3, 4, 6] },
  { sun: 16, planet: 12, ring: 40, planets: [4] },
  { sun: 20, planet: 10, ring: 40, planets: [3, 4, 5, 6] },
];

function pickGearMaterial(index, bias = 'mixed') {
  if (bias === 'glass') {
    return weightedPick([
      { value: 'dichroicGlass', weight: 3.2 },
      { value: 'crystalVeil', weight: 2.6 },
      { value: 'opticalGlass', weight: 2.8 },
      { value: 'tintedCrystal', weight: 2.2 },
      { value: 'iridescentOpal', weight: 1.6 },
    ]);
  }
  if (bias === 'metal') {
    return weightedPick([
      { value: 'liquidMetal', weight: 4.0 },
      { value: 'chromeMirror', weight: 3.4 },
      { value: 'obsidianLacquer', weight: 2.2 },
    ]);
  }
  // Alternating glass & metal so overlapping decks reveal meshed teeth through translucent gears!
  if (index % 2 === 0) {
    return pickGearMaterial(index, 'metal');
  }
  return pickGearMaterial(index, 'glass');
}

function pickBridgeMaterial() {
  return weightedPick([
    { value: 'chromeMirror', weight: 3.4 },
    { value: 'liquidMetal', weight: 3.2 },
    { value: 'obsidianLacquer', weight: 2.0 },
    { value: 'dichroicGlass', weight: 1.4 },
  ]);
}

function pickAxleMaterial() {
  return weightedPick([
    { value: 'chromeMirror', weight: 4.0 },
    { value: 'liquidMetal', weight: 3.5 },
    { value: 'obsidianLacquer', weight: 1.5 },
  ]);
}

/**
 * Creates a coherent, slowly precessing 3D mechanical chassis frame shared by
 * all gears, ring gears, axles, and bridges in a single connected mechanism.
 * Also provides a shared horological clock-time function `clockTime(time)` so
 * smooth escapement pulse waves never desynchronize meshed teeth.
 */
export function createMechanicalFrame(opts = {}) {
  const tiltX = opts.tiltX ?? randRange(-0.85, 0.85);
  const tiltY = opts.tiltY ?? randRange(0, TAU);
  const tiltZ = opts.tiltZ ?? randRange(-0.85, 0.85);
  const precessX = opts.precessX ?? randRange(-0.12, 0.12);
  const precessY = opts.precessY ?? randRange(-0.16, 0.16);
  const precessZ = opts.precessZ ?? randRange(-0.08, 0.08);
  const wobbleAmp = opts.wobbleAmp ?? randRange(0.12, 0.24);
  const wobbleFreq = opts.wobbleFreq ?? randRange(0.12, 0.22);
  const bobAmp = opts.bobAmp ?? randRange(0.04, 0.1);
  const phase = opts.phase ?? randRange(0, TAU);

  const offset = opts.offset ? opts.offset.clone() : new THREE.Vector3(0, 0, 0);

  // Shared horological escapement cadence: silky continuous motion with subtle harmonic pulse
  const escapementAmp = opts.escapementAmp ?? (Math.random() < 0.6 ? randRange(0.02, 0.05) : 0.0);
  const escapementFreq = opts.escapementFreq ?? pick([3.0, 4.0, 5.0]);

  return {
    clockTime(time) {
      return escapementAmp > 0 ? time + Math.sin(time * escapementFreq + phase) * escapementAmp : time;
    },
    evaluate(time, outPos, outQuat) {
      _euler.set(
        tiltX + time * precessX + Math.sin(time * wobbleFreq + phase) * wobbleAmp,
        tiltY + time * precessY,
        tiltZ + time * precessZ + Math.cos(time * wobbleFreq * 0.85 + phase) * wobbleAmp
      );
      outQuat.setFromEuler(_euler);
      outPos.copy(offset);
      outPos.y += Math.sin(time * 0.55 + phase) * bobAmp;
    },
  };
}

/**
 * Creates a VisualNode slot for a component fixed at (lx, ly, lz) inside a MechanicalFrame,
 * spinning around the frame's local Z axis at angle = omega * clockTime(time) + phi.
 * Always keeps outScaleMult = (1, 1, 1) so pitch circles remain strictly invariant!
 */
export function makeFrameFixedGearSlot(frame, lx, ly, lz, omega, phi) {
  return {
    evaluate(time, outPos, outQuat, outScaleMult) {
      frame.evaluate(time, _vFramePos, _qFrame);
      const tau = frame.clockTime(time);

      _vLocal.set(lx, ly, lz).applyQuaternion(_qFrame);
      outPos.copy(_vFramePos).add(_vLocal);

      _qLocal.setFromAxisAngle(_zAxis, omega * tau + phi);
      outQuat.copy(_qFrame).multiply(_qLocal);
      outScaleMult.set(1, 1, 1);
    },
  };
}

/**
 * Creates a VisualNode slot for a static watchmaker bridge spanning two axles
 * at (xA, yA) and (xB, yB) on plane z in the MechanicalFrame.
 */
function makeFrameStaticBridgeSlot(frame, xA, yA, xB, yB, lz) {
  const mx = (xA + xB) * 0.5;
  const my = (yA + yB) * 0.5;
  const angle = Math.atan2(yB - yA, xB - xA);
  const qBridge = new THREE.Quaternion().setFromAxisAngle(_zAxis, angle);

  return {
    evaluate(time, outPos, outQuat, outScaleMult) {
      frame.evaluate(time, _vFramePos, _qFrame);
      _vLocal.set(mx, my, lz).applyQuaternion(_qFrame);
      outPos.copy(_vFramePos).add(_vLocal);
      outQuat.copy(_qFrame).multiply(qBridge);
      outScaleMult.set(1, 1, 1);
    },
  };
}

/**
 * Builds an exact, tooth-for-tooth meshed Epicyclic Planetary Gearbox:
 * - Central Sun gear (Z_S)
 * - N orbiting Planet gears (Z_P) meshing simultaneously with BOTH Sun and Outer Ring
 * - Enclosing Internal-Toothed Annular Ring Gear (Z_R = Z_S + 2 * Z_P)
 * - Rotating Carrier Watchmaker Bridges linking Sun axle to every Planet axle
 * - Machined Axle Pins through Sun & every Planet hub
 * - Optional compound coaxial drive gear & external meshed satellite spur gear off the Sun shaft!
 */
export function buildPlanetaryGearbox({
  frame,
  palette,
  gearScale = 1.48,
  zOffset = 0,
  baseDelay = 0.2,
  config = null,
  omegaSun = null,
  phiSun = null,
  driveMode = null,
  bridgeSide = 1,
  includeSunAxle = true,
  includeAxles = true,
  includeBridges = true,
  includeCompoundDrive = false,
  renderOrderBase = 3,
}) {
  const cfg = config || pick(PLANETARY_CONFIGS);
  const Zs = cfg.sun;
  const Zp = cfg.planet;
  const Zr = cfg.ring;
  const N = pick(cfg.planets);

  const dir = Math.random() < 0.5 ? 1 : -1;
  const wSun = omegaSun ?? randRange(0.75, 1.35) * dir;
  const pSun = phiSun ?? randRange(0, TAU);
  const phiCarrier = randRange(0, TAU);

  // Pick one of 3 kinematically exact planetary operating regimes
  const mode = driveMode || pick(['fixed-ring', 'differential', 'overdrive']);
  let wCarrier;
  if (mode === 'fixed-ring') {
    // Classic epicyclic reduction: outer ring stays locked to chassis while planets roll inside it!
    wCarrier = wSun * (Zs / (Zs + Zr));
  } else if (mode === 'differential') {
    // Slow-drifting carrier; sun spins forward, planets & outer ring counter-rotate crisply
    wCarrier = -wSun * randRange(0.05, 0.12);
  } else {
    // Harmonious dual-drive: carrier orbits while outer ring glides in counterpoint
    wCarrier = wSun * randRange(0.14, 0.24);
  }

  // Exact kinematic ring-gear angular velocity & phase (verified for even & odd Zp):
  // theta_R(tau) = beta_0(tau) - (theta_S(tau) - beta_0(tau)) * (Zs / Zr) + ((Zp % 2 === 0) ? PI/Zr : 0)
  const ringPhaseOffset = Zp % 2 === 0 ? Math.PI / Zr : 0;
  const wRing = wCarrier - (wSun - wCarrier) * (Zs / Zr);
  const phiRing = phiCarrier - (pSun - phiCarrier) * (Zs / Zr) + ringPhaseOffset;

  const rOrbit = gearScale * (GEAR_MODULE * (Zs + Zp)) * 0.5;
  const bridgeZ = zOffset + bridgeSide * 0.115 * gearScale;
  const axleLen = (includeCompoundDrive ? 0.62 : 0.36) * gearScale;
  const bridgeMat = pickBridgeMaterial();
  const axleMat = pickAxleMaterial();

  const sunMat = pickGearMaterial(0, 'metal');
  const planetMatA = pickGearMaterial(1, 'glass');
  const planetMatB = pickGearMaterial(2, 'metal');
  const ringMat = pickGearMaterial(3, Math.random() < 0.62 ? 'glass' : 'metal');

  const nodes = [];

  // 1. Central Sun Gear
  nodes.push({
    shape: gearShapeName(Zs),
    materialType: sunMat,
    palette,
    targetScale: new THREE.Vector3(gearScale, gearScale, gearScale),
    slot: makeFrameFixedGearSlot(frame, 0, 0, zOffset, wSun, pSun),
    spawnDelay: baseDelay,
    growDuration: 2.0,
    growStyle: 'uniform',
    renderOrder: renderOrderBase,
  });

  // Sun central axle shaft
  if (includeAxles && includeSunAxle) {
    const sunAxleZ = includeCompoundDrive
      ? zOffset - bridgeSide * 0.1 * gearScale
      : zOffset + bridgeSide * 0.04 * gearScale;
    nodes.push({
      shape: 'axlePin',
      materialType: axleMat,
      palette,
      targetScale: new THREE.Vector3(gearScale * 0.92, gearScale * 0.92, axleLen),
      slot: makeFrameFixedGearSlot(frame, 0, 0, sunAxleZ, wSun, pSun),
      spawnDelay: baseDelay + 0.05,
      growDuration: 1.8,
      growStyle: 'uniform',
      renderOrder: renderOrderBase,
    });
  }

  // 2. N Meshed Planet Gears + Planet Axles + Rotating Carrier Bridges
  for (let k = 0; k < N; k++) {
    const kOffset = (k / N) * TAU;
    const pMat = k % 2 === 0 ? planetMatA : planetMatB;

    const planetSlot = {
      evaluate(time, outPos, outQuat, outScaleMult) {
        frame.evaluate(time, _vFramePos, _qFrame);
        const tau = frame.clockTime(time);
        const beta = wCarrier * tau + phiCarrier + kOffset;
        const thetaS = wSun * tau + pSun;
        const thetaP = beta + Math.PI - (thetaS - beta) * (Zs / Zp) + Math.PI / Zp;

        _vLocal.set(Math.cos(beta) * rOrbit, Math.sin(beta) * rOrbit, zOffset).applyQuaternion(_qFrame);
        outPos.copy(_vFramePos).add(_vLocal);

        _qLocal.setFromAxisAngle(_zAxis, thetaP);
        outQuat.copy(_qFrame).multiply(_qLocal);
        outScaleMult.set(1, 1, 1);
      },
    };

    nodes.push({
      shape: gearShapeName(Zp),
      materialType: pMat,
      palette,
      targetScale: new THREE.Vector3(gearScale, gearScale, gearScale),
      slot: planetSlot,
      spawnDelay: baseDelay + 0.14 + k * 0.08,
      growDuration: 2.1,
      growStyle: 'uniform',
      renderOrder: renderOrderBase + 1,
    });

    if (includeAxles) {
      const planetAxleSlot = {
        evaluate(time, outPos, outQuat, outScaleMult) {
          frame.evaluate(time, _vFramePos, _qFrame);
          const tau = frame.clockTime(time);
          const beta = wCarrier * tau + phiCarrier + kOffset;
          const thetaS = wSun * tau + pSun;
          const thetaP = beta + Math.PI - (thetaS - beta) * (Zs / Zp) + Math.PI / Zp;

          _vLocal
            .set(Math.cos(beta) * rOrbit, Math.sin(beta) * rOrbit, zOffset + bridgeSide * 0.05 * gearScale)
            .applyQuaternion(_qFrame);
          outPos.copy(_vFramePos).add(_vLocal);

          _qLocal.setFromAxisAngle(_zAxis, thetaP);
          outQuat.copy(_qFrame).multiply(_qLocal);
          outScaleMult.set(1, 1, 1);
        },
      };
      nodes.push({
        shape: 'axlePin',
        materialType: axleMat,
        palette,
        targetScale: new THREE.Vector3(gearScale * 0.85, gearScale * 0.85, 0.34 * gearScale),
        slot: planetAxleSlot,
        spawnDelay: baseDelay + 0.18 + k * 0.08,
        growDuration: 1.8,
        growStyle: 'uniform',
        renderOrder: renderOrderBase + 1,
      });
    }

    if (includeBridges) {
      const carrierArmSlot = {
        evaluate(time, outPos, outQuat, outScaleMult) {
          frame.evaluate(time, _vFramePos, _qFrame);
          const tau = frame.clockTime(time);
          const beta = wCarrier * tau + phiCarrier + kOffset;

          _vLocal
            .set(Math.cos(beta) * rOrbit * 0.5, Math.sin(beta) * rOrbit * 0.5, bridgeZ)
            .applyQuaternion(_qFrame);
          outPos.copy(_vFramePos).add(_vLocal);

          _qLocal.setFromAxisAngle(_zAxis, beta);
          outQuat.copy(_qFrame).multiply(_qLocal);
          outScaleMult.set(1, 1, 1);
        },
      };
      nodes.push({
        shape: 'gearBridge',
        materialType: bridgeMat,
        palette,
        targetScale: new THREE.Vector3(rOrbit, gearScale * 0.78, gearScale * 0.78),
        slot: carrierArmSlot,
        spawnDelay: baseDelay + 0.22 + k * 0.08,
        growDuration: 2.0,
        growStyle: 'uniform',
        renderOrder: renderOrderBase + 2,
      });
    }
  }

  // 3. Enclosing Internal-Toothed Ring Gear (meshed simultaneously with all N planets!)
  nodes.push({
    shape: ringGearShapeName(Zr),
    materialType: ringMat,
    palette,
    targetScale: new THREE.Vector3(gearScale, gearScale, gearScale),
    slot: makeFrameFixedGearSlot(frame, 0, 0, zOffset, wRing, phiRing),
    spawnDelay: baseDelay + 0.36,
    growDuration: 2.4,
    growStyle: 'uniform',
    renderOrder: renderOrderBase + 2,
  });

  // 4. Optional coaxial compound second-stage gear mounted on the back of the Sun axle
  // meshing externally with an adjacent output wheel on deck zOffset - bridgeSide * 0.25 * gearScale!
  if (includeCompoundDrive) {
    const deckZ = zOffset - bridgeSide * 0.25 * gearScale;
    const zComp = Zs === 12 ? 16 : 12;
    const zOut = pick([16, 20, 24]);
    const alpha = randRange(0, TAU);
    const dist = gearScale * (GEAR_MODULE * (zComp + zOut)) * 0.5;
    const ox = Math.cos(alpha) * dist;
    const oy = Math.sin(alpha) * dist;

    const wOut = -wSun * (zComp / zOut);
    const phiOut = alpha + Math.PI - (pSun - alpha) * (zComp / zOut) + Math.PI / zOut;

    nodes.push({
      shape: gearShapeName(zComp),
      materialType: pickGearMaterial(4, 'glass'),
      palette,
      targetScale: new THREE.Vector3(gearScale, gearScale, gearScale),
      slot: makeFrameFixedGearSlot(frame, 0, 0, deckZ, wSun, pSun),
      spawnDelay: baseDelay + 0.42,
      growDuration: 2.1,
      growStyle: 'uniform',
      renderOrder: renderOrderBase + 1,
    });
    nodes.push({
      shape: gearShapeName(zOut),
      materialType: pickGearMaterial(5, 'metal'),
      palette,
      targetScale: new THREE.Vector3(gearScale, gearScale, gearScale),
      slot: makeFrameFixedGearSlot(frame, ox, oy, deckZ, wOut, phiOut),
      spawnDelay: baseDelay + 0.52,
      growDuration: 2.2,
      growStyle: 'uniform',
      renderOrder: renderOrderBase + 1,
    });
    nodes.push({
      shape: 'axlePin',
      materialType: axleMat,
      palette,
      targetScale: new THREE.Vector3(gearScale * 0.88, gearScale * 0.88, 0.34 * gearScale),
      slot: makeFrameFixedGearSlot(frame, ox, oy, deckZ - bridgeSide * 0.04 * gearScale, wOut, phiOut),
      spawnDelay: baseDelay + 0.54,
      growDuration: 1.9,
      growStyle: 'uniform',
      renderOrder: renderOrderBase + 1,
    });
    nodes.push({
      shape: 'gearBridge',
      materialType: bridgeMat,
      palette,
      targetScale: new THREE.Vector3(dist, gearScale * 0.78, gearScale * 0.78),
      slot: makeFrameStaticBridgeSlot(frame, 0, 0, ox, oy, deckZ - bridgeSide * 0.115 * gearScale),
      spawnDelay: baseDelay + 0.56,
      growDuration: 2.0,
      growStyle: 'uniform',
      renderOrder: renderOrderBase + 2,
    });
  }

  return {
    nodes,
    outerRadius: gearScale * (getGearPitchRadius(Zr) + 0.24),
    omegaSun: wSun,
    phiSun: pSun,
    omegaCarrier: wCarrier,
    omegaRing: wRing,
  };
}

/**
 * Procedurally constructs a connected, collision-free, multi-deck Compound Branching
 * Horological Gear Train!
 *
 * Every single gear either:
 *   (a) Meshes tooth-for-tooth externally with its parent gear on the same Z-deck
 *       (exact D_AB, exact ω_B = -ω_A * Z_A / Z_B, exact phase φ_B, linked by a watchmaker bridge!), OR
 *   (b) Sits coaxially on an existing gear's shared `axlePin` on an adjacent Z-deck
 *       (identical ω, different tooth count -> compound gear ratio multiplier!), from which
 *       a whole new plane of externally meshed gears branches out!
 */
export function buildCascadingGearTrain({
  frame,
  palette,
  gearScale = 1.38,
  gearCount = 11,
  zOffset = 0,
  baseDelay = 0.25,
  omega0 = null,
  phi0 = null,
  startX = 0,
  startY = 0,
  maxRadius = 3.65,
  allowedLayers = [-1, 0, 1],
  recenter = true,
  allowCompoundDecks = true,
  includeBridges = true,
  includeAxles = true,
  skipRootAxle = false,
  renderOrderBase = 3,
}) {
  const layerStepZ = 0.25 * gearScale;
  const dir0 = Math.random() < 0.5 ? 1 : -1;
  const rootOmega = omega0 ?? randRange(0.45, 0.85) * dir0;
  const rootTeeth = pick([12, 16, 20]);
  const rootPhi = phi0 ?? randRange(0, TAU);

  const gears = [];
  const meshLinks = [];
  const axles = new Map();

  const addAxleSpan = (x, y, layer, omega, phi, depth, isRoot = false) => {
    const key = `${x.toFixed(3)},${y.toFixed(3)}`;
    if (!axles.has(key)) {
      axles.set(key, { x, y, minLayer: layer, maxLayer: layer, omega, phi, firstDepth: depth, isRoot });
    } else {
      const ax = axles.get(key);
      ax.minLayer = Math.min(ax.minLayer, layer);
      ax.maxLayer = Math.max(ax.maxLayer, layer);
    }
  };

  gears.push({
    x: startX,
    y: startY,
    layer: 0,
    teeth: rootTeeth,
    omega: rootOmega,
    phi: rootPhi,
    depth: 0,
    isCompoundChild: false,
  });
  addAxleSpan(startX, startY, 0, rootOmega, rootPhi, 0, true);

  const clearanceMargin = 0.14 * gearScale;

  const hasCollisionOnLayer = (cx, cy, candidateTeeth, layer, ignoreGear) => {
    const rCandTip = gearScale * (getGearPitchRadius(candidateTeeth) + 0.92 * GEAR_MODULE);
    for (const g of gears) {
      if (g === ignoreGear || g.layer !== layer) continue;
      const rOtherTip = gearScale * (getGearPitchRadius(g.teeth) + 0.92 * GEAR_MODULE);
      const dx = cx - g.x;
      const dy = cy - g.y;
      const minAllowed = rCandTip + rOtherTip + clearanceMargin;
      if (dx * dx + dy * dy < minAllowed * minAllowed) {
        return true;
      }
    }
    return false;
  };

  let safety = 0;
  while (gears.length < gearCount && safety < 260) {
    safety++;

    const parent = gears[randInt(0, gears.length - 1)];
    const absW = Math.abs(parent.omega);

    // 26% chance to step coaxially onto an allowed adjacent Z-deck (compound ratio multiplier!)
    const tryCompound =
      allowCompoundDecks &&
      allowedLayers.length > 1 &&
      gears.length >= 2 &&
      !parent.isCompoundChild &&
      Math.random() < 0.26;

    if (tryCompound) {
      const neighborLayers = allowedLayers.filter((l) => Math.abs(l - parent.layer) === 1);
      if (neighborLayers.length > 0) {
        const targetLayer = pick(neighborLayers);
        const altChoices = EXTERNAL_GEAR_TEETH.filter(
          (z) => z !== parent.teeth && Math.abs(z - parent.teeth) >= 4
        );
        const newTeeth = pick(altChoices);

        const occupied = gears.some(
          (g) => g.layer === targetLayer && Math.hypot(g.x - parent.x, g.y - parent.y) < 0.05
        );
        if (!occupied && !hasCollisionOnLayer(parent.x, parent.y, newTeeth, targetLayer, null)) {
          gears.push({
            x: parent.x,
            y: parent.y,
            layer: targetLayer,
            teeth: newTeeth,
            omega: parent.omega,
            phi: parent.phi,
            depth: parent.depth + 1,
            isCompoundChild: true,
          });
          addAxleSpan(parent.x, parent.y, targetLayer, parent.omega, parent.phi, parent.depth + 1);
          continue;
        }
      }
    }

    // In-plane external tooth-to-tooth meshing
    let candidateTeethPool = EXTERNAL_GEAR_TEETH;
    if (absW > 1.8) {
      candidateTeethPool = [16, 20, 24];
    } else if (absW < 0.3) {
      candidateTeethPool = [8, 10, 12];
    }
    const childTeeth = pick(candidateTeethPool);
    const dist = gearScale * (GEAR_MODULE * (parent.teeth + childTeeth)) * 0.5;

    const baseAngle = randRange(0, TAU);
    let placed = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const alpha = baseAngle + (attempt / 12) * TAU;
      const nx = parent.x + Math.cos(alpha) * dist;
      const ny = parent.y + Math.sin(alpha) * dist;

      const outerR = Math.hypot(nx, ny) + gearScale * getGearPitchRadius(childTeeth);
      if (outerR > maxRadius) continue;

      if (hasCollisionOnLayer(nx, ny, childTeeth, parent.layer, parent)) continue;

      // Exact tooth-in-valley external meshing kinematics!
      const childOmega = -parent.omega * (parent.teeth / childTeeth);
      const childPhi =
        alpha + Math.PI - (parent.phi - alpha) * (parent.teeth / childTeeth) + Math.PI / childTeeth;

      const child = {
        x: nx,
        y: ny,
        layer: parent.layer,
        teeth: childTeeth,
        omega: childOmega,
        phi: childPhi,
        depth: parent.depth + 1,
        isCompoundChild: false,
      };
      gears.push(child);
      meshLinks.push({ a: parent, b: child, layer: parent.layer });
      addAxleSpan(nx, ny, parent.layer, childOmega, childPhi, child.depth);
      placed = true;
      break;
    }

    if (!placed && safety > 130) {
      maxRadius += 0.25;
    }
  }

  // Optionally recenter XY centroid so standalone trains stay visually balanced
  if (recenter) {
    let cx = 0;
    let cy = 0;
    for (const g of gears) {
      cx += g.x;
      cy += g.y;
    }
    cx = cx / gears.length - startX;
    cy = cy / gears.length - startY;
    for (const g of gears) {
      g.x -= cx;
      g.y -= cy;
    }
    for (const ax of axles.values()) {
      ax.x -= cx;
      ax.y -= cy;
    }
  }

  const nodes = [];
  const bridgeMat = pickBridgeMaterial();
  const axleMat = pickAxleMaterial();

  gears.forEach((g, idx) => {
    const lz = zOffset + g.layer * layerStepZ;
    nodes.push({
      shape: gearShapeName(g.teeth),
      materialType: pickGearMaterial(idx, 'mixed'),
      palette,
      targetScale: new THREE.Vector3(gearScale, gearScale, gearScale),
      slot: makeFrameFixedGearSlot(frame, g.x, g.y, lz, g.omega, g.phi),
      spawnDelay: baseDelay + g.depth * 0.13 + (idx % 3) * 0.03,
      growDuration: 2.0,
      growStyle: 'uniform',
      renderOrder: renderOrderBase + (g.layer + 1),
    });
  });

  if (includeAxles) {
    for (const ax of axles.values()) {
      if (skipRootAxle && ax.isRoot) continue;
      const zMin = zOffset + ax.minLayer * layerStepZ;
      const zMax = zOffset + ax.maxLayer * layerStepZ;
      const zMid = (zMin + zMax) * 0.5;
      const span = zMax - zMin + 0.34 * gearScale;
      nodes.push({
        shape: 'axlePin',
        materialType: axleMat,
        palette,
        targetScale: new THREE.Vector3(gearScale * 0.85, gearScale * 0.85, span),
        slot: makeFrameFixedGearSlot(frame, ax.x, ax.y, zMid, ax.omega, ax.phi),
        spawnDelay: baseDelay + ax.firstDepth * 0.13 + 0.06,
        growDuration: 1.8,
        growStyle: 'uniform',
        renderOrder: renderOrderBase + 1,
      });
    }
  }

  if (includeBridges) {
    meshLinks.forEach((link, idx) => {
      const dist = Math.hypot(link.b.x - link.a.x, link.b.y - link.a.y);
      const bridgeSide = link.layer >= 0 ? 1 : -1;
      const bz = zOffset + link.layer * layerStepZ + bridgeSide * 0.115 * gearScale;
      nodes.push({
        shape: 'gearBridge',
        materialType: idx % 3 === 0 ? 'dichroicGlass' : bridgeMat,
        palette,
        targetScale: new THREE.Vector3(dist, gearScale * 0.72, gearScale * 0.72),
        slot: makeFrameStaticBridgeSlot(frame, link.a.x, link.a.y, link.b.x, link.b.y, bz),
        spawnDelay: baseDelay + link.b.depth * 0.13 + 0.1,
        growDuration: 1.9,
        growStyle: 'uniform',
        renderOrder: renderOrderBase + 2,
      });
    });
  }

  return { nodes, gearCount: gears.length };
}

/**
 * Builds a complete, collision-free 3D horological clockwork assembly combining
 * Epicyclic Planetary Gearboxes and/or Multi-Deck Compound Branching Gear Trains
 * so every single gear on screen is physically meshed and mechanically connected!
 */
export function buildConnectedClockworkAssembly(palette, style = 'coaxial-planetary-and-train') {
  const nodes = [];
  const sharedFrame = createMechanicalFrame({
    tiltX: randRange(-0.65, 0.65),
    tiltY: randRange(0, TAU),
    tiltZ: randRange(-0.65, 0.65),
  });

  if (style === 'twin-coaxial-planetary') {
    // Double-deck Epicyclic Planetary Horology Movement:
    // Front & back planetary gearboxes driven coaxially by one master central chrome shaft!
    const scaleA = randRange(1.42, 1.62);
    const scaleB = scaleA * randRange(0.76, 0.9);
    const omega = randRange(0.8, 1.25) * (Math.random() < 0.5 ? 1 : -1);
    const zSep = 0.44 * scaleA;

    const cfgA = pick(PLANETARY_CONFIGS);
    const cfgB = pick(PLANETARY_CONFIGS.filter((c) => c !== cfgA));

    const boxFront = buildPlanetaryGearbox({
      frame: sharedFrame,
      palette,
      gearScale: scaleA,
      zOffset: zSep,
      baseDelay: 0.18,
      config: cfgA,
      omegaSun: omega,
      driveMode: 'fixed-ring',
      bridgeSide: 1,
      includeSunAxle: false,
      renderOrderBase: 4,
    });

    const boxBack = buildPlanetaryGearbox({
      frame: sharedFrame,
      palette,
      gearScale: scaleB,
      zOffset: -zSep,
      baseDelay: 0.36,
      config: cfgB,
      omegaSun: omega,
      driveMode: 'differential',
      bridgeSide: -1,
      includeSunAxle: false,
      includeCompoundDrive: true,
      renderOrderBase: 3,
    });

    // Long master central drive shaft linking both coaxial planetary Sun gears!
    nodes.push({
      shape: 'axlePin',
      materialType: 'chromeMirror',
      palette,
      targetScale: new THREE.Vector3(scaleA * 0.95, scaleA * 0.95, zSep * 2 + 0.68 * scaleA),
      slot: makeFrameFixedGearSlot(sharedFrame, 0, 0, 0, omega, 0),
      spawnDelay: 0.14,
      growDuration: 2.0,
      growStyle: 'uniform',
      renderOrder: 3,
    });

    nodes.push(...boxFront.nodes, ...boxBack.nodes);
    return { nodes, frame: sharedFrame };
  }

  if (style === 'compound-train-hero') {
    // Sprawling 13–15 gear multi-deck Compound Branching Watchmaker Gear Train!
    const train = buildCascadingGearTrain({
      frame: sharedFrame,
      palette,
      gearScale: randRange(1.36, 1.54),
      gearCount: randInt(12, 14),
      zOffset: 0,
      baseDelay: 0.18,
      maxRadius: 3.9,
      allowedLayers: [-1, 0, 1],
      recenter: true,
      allowCompoundDecks: true,
      includeBridges: true,
      includeAxles: true,
      renderOrderBase: 3,
    });
    nodes.push(...train.nodes);
    return { nodes, frame: sharedFrame };
  }

  if (style === 'dual-parallel-trains') {
    // Front & back parallel compound gear trains coupled by a master central shaft
    const scale = randRange(1.28, 1.44);
    const omega = randRange(0.55, 0.95) * (Math.random() < 0.5 ? 1 : -1);
    const phi = randRange(0, TAU);
    const zHalf = 0.42 * scale;

    const trainFront = buildCascadingGearTrain({
      frame: sharedFrame,
      palette,
      gearScale: scale,
      gearCount: randInt(7, 9),
      zOffset: zHalf,
      baseDelay: 0.18,
      omega0: omega,
      phi0: phi,
      maxRadius: 3.65,
      allowedLayers: [0, 1],
      recenter: false,
      allowCompoundDecks: true,
      skipRootAxle: true,
      renderOrderBase: 4,
    });

    const trainBack = buildCascadingGearTrain({
      frame: sharedFrame,
      palette,
      gearScale: scale,
      gearCount: randInt(7, 9),
      zOffset: -zHalf,
      baseDelay: 0.34,
      omega0: omega,
      phi0: phi,
      maxRadius: 3.65,
      allowedLayers: [-1, 0],
      recenter: false,
      allowCompoundDecks: true,
      skipRootAxle: true,
      renderOrderBase: 2,
    });

    nodes.push({
      shape: 'axlePin',
      materialType: 'liquidMetal',
      palette,
      targetScale: new THREE.Vector3(scale * 0.95, scale * 0.95, zHalf * 2 + 0.65 * scale),
      slot: makeFrameFixedGearSlot(sharedFrame, 0, 0, 0, omega, phi),
      spawnDelay: 0.14,
      growDuration: 2.0,
      growStyle: 'uniform',
      renderOrder: 3,
    });

    nodes.push(...trainFront.nodes, ...trainBack.nodes);
    return { nodes, frame: sharedFrame };
  }

  // Default ('coaxial-planetary-and-train'):
  // Front Epicyclic Planetary Gearbox + Rear Compound Cascading Gear Train coupled coaxially
  // on the exact same central chrome drive shaft (zero clipping, layered glass-through-metal clarity!)
  const scale = randRange(1.38, 1.56);
  const omega = randRange(0.8, 1.2) * (Math.random() < 0.5 ? 1 : -1);
  const phi = randRange(0, TAU);
  const zFront = 0.36 * scale;
  const zBack = -0.34 * scale;

  const box = buildPlanetaryGearbox({
    frame: sharedFrame,
    palette,
    gearScale: scale,
    zOffset: zFront,
    baseDelay: 0.18,
    omegaSun: omega,
    phiSun: phi,
    bridgeSide: 1,
    includeSunAxle: false,
    includeBridges: true,
    includeAxles: true,
    includeCompoundDrive: false,
    renderOrderBase: 4,
  });

  const train = buildCascadingGearTrain({
    frame: sharedFrame,
    palette,
    gearScale: scale * 0.94,
    gearCount: randInt(8, 10),
    zOffset: zBack,
    baseDelay: 0.34,
    omega0: omega,
    phi0: phi,
    maxRadius: 3.65,
    allowedLayers: [-1, 0],
    recenter: false,
    allowCompoundDecks: true,
    includeBridges: true,
    includeAxles: true,
    skipRootAxle: true,
    renderOrderBase: 2,
  });

  // Master central chrome drive shaft physically linking front Planetary Sun & rear Gear Train root!
  nodes.push({
    shape: 'axlePin',
    materialType: 'chromeMirror',
    palette,
    targetScale: new THREE.Vector3(scale * 0.98, scale * 0.98, zFront - zBack + 0.65 * scale),
    slot: makeFrameFixedGearSlot(sharedFrame, 0, 0, (zFront + zBack) * 0.5, omega, phi),
    spawnDelay: 0.14,
    growDuration: 2.0,
    growStyle: 'uniform',
    renderOrder: 3,
  });

  nodes.push(...box.nodes, ...train.nodes);
  return { nodes, frame: sharedFrame };
}
