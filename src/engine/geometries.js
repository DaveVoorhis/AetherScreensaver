import * as THREE from 'three';

/**
 * Standardized horological gear module (in local units at scale 1.0).
 * Pitch radius of any gear with Z teeth is: R_p = (GEAR_MODULE * Z) / 2.
 * Any two external gears A & B at the same scale S mesh tooth-for-tooth at
 * center distance D = S * GEAR_MODULE * (Z_A + Z_B) / 2.
 */
export const GEAR_MODULE = 0.085;

export function getGearPitchRadius(teeth) {
  return (GEAR_MODULE * teeth) * 0.5;
}

function mergeNonIndexedGeometries(geos) {
  let totalFloats = 0;
  const nonIndexed = geos.map((g) => {
    const ni = g.index ? g.toNonIndexed() : g;
    totalFloats += ni.attributes.position.array.length;
    return ni;
  });

  const positions = new Float32Array(totalFloats);
  const normals = new Float32Array(totalFloats);
  const uvs = new Float32Array((totalFloats / 3) * 2);

  let posOffset = 0;
  let uvOffset = 0;
  for (const ni of nonIndexed) {
    if (!ni.attributes.normal) ni.computeVertexNormals();
    const pArr = ni.attributes.position.array;
    const nArr = ni.attributes.normal.array;
    positions.set(pArr, posOffset);
    normals.set(nArr, posOffset);
    const vertCount = pArr.length / 3;
    if (ni.attributes.uv) {
      uvs.set(ni.attributes.uv.array, uvOffset);
    }
    posOffset += pArr.length;
    uvOffset += vertCount * 2;
  }

  for (let i = 0; i < geos.length; i++) {
    if (nonIndexed[i] !== geos[i]) nonIndexed[i].dispose();
    geos[i].dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return out;
}

function createSuperellipsoidGeometry(rx = 0.52, ry = 0.52, rz = 0.52, n1 = 0.38, n2 = 0.38, segsU = 30, segsV = 20) {
  const geo = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];

  const sgnPow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

  for (let iv = 0; iv <= segsV; iv++) {
    const v = -Math.PI * 0.5 + (iv / segsV) * Math.PI;
    const cosV = Math.cos(v);
    const sinV = Math.sin(v);
    for (let iu = 0; iu <= segsU; iu++) {
      const u = -Math.PI + (iu / segsU) * Math.PI * 2;
      const cosU = Math.cos(u);
      const sinU = Math.sin(u);

      const x = rx * sgnPow(cosV, n1) * sgnPow(cosU, n2);
      const y = ry * sgnPow(sinV, n1);
      const z = rz * sgnPow(cosV, n1) * sgnPow(sinU, n2);
      positions.push(x, y, z);
      uvs.push(iu / segsU, iv / segsV);
    }
  }

  const stride = segsU + 1;
  for (let iv = 0; iv < segsV; iv++) {
    for (let iu = 0; iu < segsU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createOpticalLensGeometry() {
  const pts = [];
  const R = 0.62;
  const H = 0.19;
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = -Math.PI * 0.5 + t * Math.PI;
    const r = Math.cos(angle) * R;
    const y = Math.sin(angle) * H;
    const edgeFactor = Math.pow(Math.max(0, Math.cos(angle)), 6);
    pts.push(new THREE.Vector2(Math.max(0.0001, r), y * (1 - edgeFactor * 0.25)));
  }
  const geo = new THREE.LatheGeometry(pts, 44);
  geo.computeVertexNormals();
  return geo;
}

function createBeveledCylinderGeometry() {
  const r = 0.34;
  const h = 0.62;
  const bevel = 0.065;
  const pts = [
    new THREE.Vector2(0.0001, -h),
    new THREE.Vector2(r - bevel, -h),
    new THREE.Vector2(r - bevel * 0.25, -h + bevel * 0.25),
    new THREE.Vector2(r, -h + bevel),
    new THREE.Vector2(r, h - bevel),
    new THREE.Vector2(r - bevel * 0.25, h - bevel * 0.25),
    new THREE.Vector2(r - bevel, h),
    new THREE.Vector2(0.0001, h),
  ];
  const geo = new THREE.LatheGeometry(pts, 32);
  geo.computeVertexNormals();
  return geo;
}

function createTeardropGeometry() {
  const pts = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = (t - 0.42) * 1.25;
    const r = Math.sin(Math.pow(t, 0.72) * Math.PI) * 0.44 * (1 - 0.38 * t);
    pts.push(new THREE.Vector2(Math.max(0.0001, r), y));
  }
  const geo = new THREE.LatheGeometry(pts, 32);
  geo.computeVertexNormals();
  return geo;
}

function createSpindleGeometry() {
  const pts = [];
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = t * 2 - 1;
    const y = u * 0.92;
    const r = Math.pow(Math.max(0, 1 - u * u), 1.35) * 0.24;
    pts.push(new THREE.Vector2(Math.max(0.0001, r), y));
  }
  const geo = new THREE.LatheGeometry(pts, 28);
  geo.computeVertexNormals();
  return geo;
}

function createCrystalPrismGeometry() {
  const top = new THREE.CylinderGeometry(0.001, 0.32, 0.65, 6, 1, false);
  top.translate(0, 0.325, 0);
  const bot = new THREE.CylinderGeometry(0.32, 0.001, 0.65, 6, 1, false);
  bot.translate(0, -0.325, 0);
  return mergeNonIndexedGeometries([top, bot]);
}

function createArcSegmentGeometry() {
  const radius = 0.62;
  const tube = 0.062;
  const arc = Math.PI * 0.62;
  const curve = new THREE.CatmullRomCurve3(
    Array.from({ length: 15 }, (_, i) => {
      const a = -arc * 0.5 + (i / 14) * arc;
      return new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    })
  );
  const geo = new THREE.TubeGeometry(curve, 30, tube, 14, false);
  geo.computeVertexNormals();
  return geo;
}

function createFiligreeCageGeometry() {
  const base = new THREE.IcosahedronGeometry(0.62, 0);
  const edges = new THREE.EdgesGeometry(base, 1);
  const pos = edges.attributes.position;
  const parts = [];
  const up = new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const q = new THREE.Quaternion();

  for (let i = 0; i < pos.count; i += 2) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    dir.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-4) continue;
    mid.addVectors(a, b).multiplyScalar(0.5);
    q.setFromUnitVectors(up, dir.clone().normalize());

    const strut = new THREE.CylinderGeometry(0.017, 0.017, len, 6, 1);
    strut.applyQuaternion(q);
    strut.translate(mid.x, mid.y, mid.z);
    parts.push(strut);
  }

  const seen = new Set();
  for (let i = 0; i < pos.count; i++) {
    a.fromBufferAttribute(pos, i);
    const key = `${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = new THREE.SphereGeometry(0.032, 8, 6);
    node.translate(a.x, a.y, a.z);
    parts.push(node);
  }

  base.dispose();
  edges.dispose();
  return mergeNonIndexedGeometries(parts);
}

function createRibbedGlassShellGeometry() {
  const geo = new THREE.SphereGeometry(0.58, 60, 34);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const theta = Math.atan2(v.z, v.x);
    const phi = Math.acos(THREE.MathUtils.clamp(v.y / 0.58, -1, 1));
    const flute = 1 + Math.sin(theta * 18) * Math.pow(Math.sin(phi), 1.4) * 0.055;
    v.multiplyScalar(flute);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function createOpticalApertureGeometry() {
  const rIn = 0.57;
  const rOut = 0.67;
  const h = 0.042;
  const bevel = 0.015;
  const pts = [
    new THREE.Vector2(rIn + bevel, -h),
    new THREE.Vector2(rOut - bevel, -h),
    new THREE.Vector2(rOut, -h + bevel),
    new THREE.Vector2(rOut, h - bevel),
    new THREE.Vector2(rOut - bevel, h),
    new THREE.Vector2(rIn + bevel, h),
    new THREE.Vector2(rIn, h - bevel),
    new THREE.Vector2(rIn, -h + bevel),
    new THREE.Vector2(rIn + bevel, -h),
  ];
  const geo = new THREE.LatheGeometry(pts, 44);
  geo.computeVertexNormals();
  return geo;
}

function createHollowPrismRingGeometry() {
  const rIn = 0.52;
  const rOut = 0.63;
  const h = 0.082;
  const pts = [
    new THREE.Vector2(rIn, -h),
    new THREE.Vector2(rOut, -h),
    new THREE.Vector2(rOut + 0.04, 0),
    new THREE.Vector2(rOut, h),
    new THREE.Vector2(rIn, h),
    new THREE.Vector2(rIn - 0.03, 0),
    new THREE.Vector2(rIn, -h),
  ];
  const geo = new THREE.LatheGeometry(pts, 6);
  const nonIdx = geo.toNonIndexed();
  nonIdx.computeVertexNormals();
  geo.dispose();
  return nonIdx;
}

function createHelicalCoilGeometry() {
  const pts = [];
  const turns = 3.5;
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * turns * Math.PI * 2;
    const env = 0.65 + 0.35 * Math.sin(t * Math.PI);
    const r = 0.32 * env;
    const y = (t - 0.5) * 1.15;
    pts.push(new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 86, 0.03, 10, false);
  geo.computeVertexNormals();
  return geo;
}

function createStarPolyhedronGeometry() {
  const t1 = new THREE.TetrahedronGeometry(0.58, 0);
  const t2 = new THREE.TetrahedronGeometry(0.58, 0);
  t2.rotateY(Math.PI * 0.5);
  t2.rotateX(Math.PI);
  return mergeNonIndexedGeometries([t1, t2]);
}

function createNestedTorusGeometry() {
  const r1 = new THREE.TorusGeometry(0.56, 0.028, 12, 52);
  const r2 = new THREE.TorusGeometry(0.45, 0.024, 12, 44);
  r2.rotateX(Math.PI * 0.5);
  const r3 = new THREE.TorusGeometry(0.34, 0.02, 12, 36);
  r3.rotateY(Math.PI * 0.5);
  return mergeNonIndexedGeometries([r1, r2, r3]);
}

// =========================================================================
// STANDARDIZED-MODULE MESHING HOROLOGICAL GEAR FAMILY
// Tooth #0 is ALWAYS centered precisely along +X (angle = 0) so analytical
// tooth-in-valley meshing phase math is exact to the radian!
// =========================================================================

/**
 * External involute-profile skeletonized horological gear with exact module GEAR_MODULE.
 * Center of Tooth #0 is at angle = 0; valleys are at (k + 0.5) * 2π / teeth.
 */
function createModularGearGeometry(teeth, spokes = 5, depth = 0.078) {
  const m = GEAR_MODULE;
  const rPitch = (m * teeth) * 0.5;
  const rRoot = rPitch - 1.12 * m;
  const rTip = rPitch + 0.88 * m;
  const step = (Math.PI * 2) / teeth;

  // Center tooth #0 squarely at angle 0 (symmetric flanks around 0)
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const centerA = i * step;
    const aRootL = centerA - step * 0.34;
    const aTipL = centerA - step * 0.16;
    const aTipR = centerA + step * 0.16;
    const aRootR = centerA + step * 0.34;

    if (i === 0) shape.moveTo(Math.cos(aRootL) * rRoot, Math.sin(aRootL) * rRoot);
    else shape.lineTo(Math.cos(aRootL) * rRoot, Math.sin(aRootL) * rRoot);
    shape.lineTo(Math.cos(aTipL) * rTip, Math.sin(aTipL) * rTip);
    shape.lineTo(Math.cos(aTipR) * rTip, Math.sin(aTipR) * rTip);
    shape.lineTo(Math.cos(aRootR) * rRoot, Math.sin(aRootR) * rRoot);
  }
  shape.closePath();

  const innerRimR = Math.max(0.12, rRoot - 0.11);
  const hubR = Math.min(innerRimR * 0.45, Math.max(0.11, rPitch * 0.24));

  // Cut open watchmaker radial windows between spokes when gear is large enough
  if (spokes > 0 && innerRimR > hubR + 0.09) {
    const spokeStep = (Math.PI * 2) / spokes;
    const pad = Math.min(0.18, 0.045 / Math.max(0.18, hubR));
    for (let s = 0; s < spokes; s++) {
      const startA = s * spokeStep + pad;
      const endA = (s + 1) * spokeStep - pad;
      if (endA <= startA + 0.1) continue;
      const hole = new THREE.Path();
      const segs = 7;
      const rIn = hubR + 0.04;
      hole.moveTo(Math.cos(startA) * rIn, Math.sin(startA) * rIn);
      for (let k = 0; k <= segs; k++) {
        const a = startA + (k / segs) * (endA - startA);
        hole.lineTo(Math.cos(a) * innerRimR, Math.sin(a) * innerRimR);
      }
      for (let k = segs; k >= 0; k--) {
        const a = startA + (k / segs) * (endA - startA);
        hole.lineTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
      }
      hole.closePath();
      shape.holes.push(hole);
    }
  }

  // Central axle bearing bore
  const bore = new THREE.Path();
  bore.absarc(0, 0, Math.max(0.045, hubR * 0.42), 0, Math.PI * 2, true);
  shape.holes.push(bore);

  const gearBody = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.011,
    bevelSize: 0.009,
    bevelSegments: 1,
    curveSegments: 6,
  });
  gearBody.translate(0, 0, -depth * 0.5);

  const parts = [gearBody];
  // Machined bearing hub collar
  const collar = new THREE.TorusGeometry(Math.max(0.065, hubR * 0.8), 0.018, 8, 22);
  parts.push(collar);

  // Subtle decorative rim chamfer ring on larger wheels
  if (rPitch > 0.55) {
    const grooveR = (rRoot + innerRimR) * 0.5;
    const gFront = new THREE.TorusGeometry(grooveR, 0.012, 6, 36);
    gFront.translate(0, 0, depth * 0.52);
    const gBack = new THREE.TorusGeometry(grooveR, 0.012, 6, 36);
    gBack.translate(0, 0, -depth * 0.52);
    parts.push(gFront, gBack);
  }

  return mergeNonIndexedGeometries(parts);
}

/**
 * Internal-toothed annular Ring Gear with exact module GEAR_MODULE!
 * Meshes seamlessly around planetary gears (Z_ring = Z_sun + 2 * Z_planet).
 * Internal valley #0 (recess between inward teeth) is centered precisely at angle = 0
 * so a planet gear tooth pointing outward at angle 0 lands squarely in valley #0!
 */
function createInternalRingGearGeometry(teeth, depth = 0.095) {
  const m = GEAR_MODULE;
  const rPitch = (m * teeth) * 0.5;
  // For internal gear: tooth tips point INWARD (rTipIn < rPitch), roots are OUTWARD (rRootOut > rPitch)
  const rTipIn = rPitch - 0.86 * m;
  const rRootOut = rPitch + 1.14 * m;
  const rOuterRim = rRootOut + 0.14;
  const step = (Math.PI * 2) / teeth;

  // Outer machined circular rim with subtle sculpted external lugs
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOuterRim, 0, Math.PI * 2, false);

  // Inner hole contour with inward-pointing gear teeth!
  // Valley #0 is centered at angle 0 (r = rRootOut); teeth are centered at (i + 0.5) * step (r = rTipIn)
  const hole = new THREE.Path();
  for (let i = 0; i < teeth; i++) {
    const toothCenter = (i + 0.5) * step;
    const aRootL = toothCenter - step * 0.34;
    const aTipL = toothCenter - step * 0.16;
    const aTipR = toothCenter + step * 0.16;
    const aRootR = toothCenter + step * 0.34;

    if (i === 0) hole.moveTo(Math.cos(aRootL) * rRootOut, Math.sin(aRootL) * rRootOut);
    else hole.lineTo(Math.cos(aRootL) * rRootOut, Math.sin(aRootL) * rRootOut);
    hole.lineTo(Math.cos(aTipL) * rTipIn, Math.sin(aTipL) * rTipIn);
    hole.lineTo(Math.cos(aTipR) * rTipIn, Math.sin(aTipR) * rTipIn);
    hole.lineTo(Math.cos(aRootR) * rRootOut, Math.sin(aRootR) * rRootOut);
  }
  hole.closePath();
  shape.holes.push(hole);

  const body = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 1,
    curveSegments: 48,
  });
  body.translate(0, 0, -depth * 0.5);

  const parts = [body];
  // Outer calibrated bezel rail & 8 cardinal mount lugs
  parts.push(new THREE.TorusGeometry(rOuterRim + 0.03, 0.022, 8, 56));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const lug = new THREE.OctahedronGeometry(0.055, 0);
    lug.translate(Math.cos(a) * (rOuterRim + 0.06), Math.sin(a) * (rOuterRim + 0.06), 0);
    parts.push(lug);
  }

  return mergeNonIndexedGeometries(parts);
}

/**
 * Machined clockwork axle shaft aligned along Z (matches gear rotation axis!),
 * with stepped bearing collars and jewel end-caps. Unit length = 1.0 along Z.
 */
function createAxlePinGeometry() {
  const parts = [];
  const shaft = new THREE.CylinderGeometry(0.036, 0.036, 1.0, 10);
  shaft.rotateX(Math.PI * 0.5);
  parts.push(shaft);

  const collarA = new THREE.CylinderGeometry(0.068, 0.068, 0.14, 12);
  collarA.rotateX(Math.PI * 0.5);
  collarA.translate(0, 0, 0.36);
  const collarB = new THREE.CylinderGeometry(0.068, 0.068, 0.14, 12);
  collarB.rotateX(Math.PI * 0.5);
  collarB.translate(0, 0, -0.36);
  parts.push(collarA, collarB);

  const capA = new THREE.OctahedronGeometry(0.062, 0);
  capA.translate(0, 0, 0.52);
  const capB = new THREE.OctahedronGeometry(0.062, 0);
  capB.translate(0, 0, -0.52);
  parts.push(capA, capB);

  return mergeNonIndexedGeometries(parts);
}

/**
 * Skeletonized watchmaker bridge bar spanning from (-0.5, 0, 0) to (+0.5, 0, 0)
 * so scaling X by exact center-to-center distance D connects two gear axles cleanly!
 */
function createGearBridgeGeometry() {
  const parts = [];
  // Twin slender parallel bridge rails so gears underneath remain visible
  const railA = new THREE.BoxGeometry(1.0, 0.032, 0.038);
  railA.translate(0, 0.045, 0);
  const railB = new THREE.BoxGeometry(1.0, 0.032, 0.038);
  railB.translate(0, -0.045, 0);
  parts.push(railA, railB);

  // Center jewel cross-tie
  const tie = new THREE.BoxGeometry(0.08, 0.12, 0.045);
  parts.push(tie);

  // End bearing bosses at x = -0.5 and x = +0.5
  const bossL = new THREE.TorusGeometry(0.085, 0.024, 8, 18);
  bossL.translate(-0.5, 0, 0);
  const bossR = new THREE.TorusGeometry(0.085, 0.024, 8, 18);
  bossR.translate(0.5, 0, 0);
  parts.push(bossL, bossR);

  return mergeNonIndexedGeometries(parts);
}

// ---------- OTHER ALIEN HOROLOGY & CONTAINMENT GEOMETRIES ----------

function createVernierDialGeometry() {
  const parts = [];
  const mainR = 0.64;
  const innerR = 0.54;

  parts.push(new THREE.TorusGeometry(mainR, 0.016, 10, 60));
  parts.push(new THREE.TorusGeometry(innerR, 0.011, 8, 52));

  const ticks = 24;
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2;
    const isCardinal = i % 6 === 0;
    const isMajor = i % 2 === 0;
    const len = isCardinal ? 0.15 : isMajor ? 0.11 : 0.068;
    const w = isCardinal ? 0.018 : 0.011;
    const midR = mainR - len * 0.5 + (isCardinal ? 0.025 : 0);

    const tick = new THREE.BoxGeometry(len, w, isCardinal ? 0.036 : 0.022);
    tick.rotateZ(a);
    tick.translate(Math.cos(a) * midR, Math.sin(a) * midR, 0);
    parts.push(tick);

    if (isCardinal) {
      const jewel = new THREE.OctahedronGeometry(0.034, 0);
      jewel.translate(Math.cos(a) * (mainR + 0.042), Math.sin(a) * (mainR + 0.042), 0);
      parts.push(jewel);
    }
  }

  return mergeNonIndexedGeometries(parts);
}

function createIrisBladesGeometry() {
  const parts = [];
  const blades = 12;
  const ringR = 0.54;

  parts.push(new THREE.TorusGeometry(0.64, 0.018, 10, 52));
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const vane = new THREE.BoxGeometry(0.24, 0.072, 0.018);
    vane.rotateX(0.32);
    vane.rotateZ(a + 0.62);
    vane.translate(Math.cos(a) * ringR, Math.sin(a) * ringR, (i % 2 === 0 ? 1 : -1) * 0.008);
    parts.push(vane);

    const pivot = new THREE.CylinderGeometry(0.016, 0.016, 0.042, 8);
    pivot.rotateX(Math.PI * 0.5);
    pivot.translate(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
    parts.push(pivot);
  }

  return mergeNonIndexedGeometries(parts);
}

function createTuningForkRingGeometry() {
  const parts = [];
  const R = 0.64;
  parts.push(new THREE.TorusGeometry(R, 0.02, 10, 56));
  parts.push(new THREE.TorusGeometry(R * 0.92, 0.01, 8, 48));

  const count = 12;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const isLong = i % 2 === 0;
    const prongLen = isLong ? 0.17 : 0.10;
    const prong = new THREE.ConeGeometry(isLong ? 0.026 : 0.018, prongLen, 6);
    prong.rotateZ(a + Math.PI * 0.5);
    const pr = R - prongLen * 0.52;
    prong.translate(Math.cos(a) * pr, Math.sin(a) * pr, 0);
    parts.push(prong);

    if (isLong) {
      const tip = new THREE.SphereGeometry(0.022, 8, 6);
      const tr = R - prongLen - 0.032;
      tip.translate(Math.cos(a) * tr, Math.sin(a) * tr, 0);
      parts.push(tip);
    }
  }

  return mergeNonIndexedGeometries(parts);
}

function createGyroArmillaryGeometry() {
  const parts = [];
  const eq = new THREE.TorusGeometry(0.62, 0.02, 10, 52);
  eq.rotateX(Math.PI * 0.5);
  parts.push(eq);

  const ecl = new THREE.TorusGeometry(0.58, 0.026, 10, 48);
  ecl.rotateX(Math.PI * 0.5 + 0.41);
  parts.push(ecl);

  const m1 = new THREE.TorusGeometry(0.53, 0.016, 10, 44);
  parts.push(m1);
  const m2 = new THREE.TorusGeometry(0.53, 0.016, 10, 44);
  m2.rotateY(Math.PI * 0.5);
  parts.push(m2);

  parts.push(new THREE.CylinderGeometry(0.012, 0.012, 1.32, 8));
  const capTop = new THREE.OctahedronGeometry(0.048, 0);
  capTop.translate(0, 0.66, 0);
  const capBot = new THREE.OctahedronGeometry(0.048, 0);
  capBot.translate(0, -0.66, 0);
  parts.push(capTop, capBot);

  return mergeNonIndexedGeometries(parts);
}

function createDoubleCageGeometry() {
  const parts = [];
  const up = new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const q = new THREE.Quaternion();

  const addEdges = (srcGeo, radius, beadR) => {
    const edges = new THREE.EdgesGeometry(srcGeo, 1);
    const pos = edges.attributes.position;
    for (let i = 0; i < pos.count; i += 2) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      dir.subVectors(b, a);
      const len = dir.length();
      if (len < 1e-4) continue;
      mid.addVectors(a, b).multiplyScalar(0.5);
      q.setFromUnitVectors(up, dir.clone().normalize());
      const strut = new THREE.CylinderGeometry(radius, radius, len, 6, 1);
      strut.applyQuaternion(q);
      strut.translate(mid.x, mid.y, mid.z);
      parts.push(strut);
    }
    const seen = new Set();
    for (let i = 0; i < pos.count; i++) {
      a.fromBufferAttribute(pos, i);
      const key = `${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const node = new THREE.OctahedronGeometry(beadR, 0);
      node.translate(a.x, a.y, a.z);
      parts.push(node);
    }
    edges.dispose();
  };

  const outer = new THREE.IcosahedronGeometry(0.64, 0);
  const inner = new THREE.OctahedronGeometry(0.44, 0);
  inner.rotateY(Math.PI * 0.25);
  addEdges(outer, 0.013, 0.028);
  addEdges(inner, 0.015, 0.032);
  outer.dispose();
  inner.dispose();

  return mergeNonIndexedGeometries(parts);
}

function createArticulatedSpireGeometry() {
  const parts = [];
  const topCone = new THREE.CylinderGeometry(0.002, 0.16, 0.72, 6);
  topCone.translate(0, 0.36, 0);
  const botCone = new THREE.CylinderGeometry(0.16, 0.002, 0.42, 6);
  botCone.translate(0, -0.21, 0);
  parts.push(topCone, botCone);

  const collars = [
    { y: 0.0, r: 0.21, tube: 0.026 },
    { y: 0.22, r: 0.155, tube: 0.02 },
    { y: 0.44, r: 0.10, tube: 0.015 },
    { y: -0.14, r: 0.14, tube: 0.018 },
  ];
  for (const c of collars) {
    const ring = new THREE.TorusGeometry(c.r, c.tube, 8, 16);
    ring.rotateX(Math.PI * 0.5);
    ring.translate(0, c.y, 0);
    parts.push(ring);
  }
  return mergeNonIndexedGeometries(parts);
}

function createSegmentedArcGeometry() {
  const parts = [];
  const arc = Math.PI * 0.68;
  const radii = [0.56, 0.63, 0.68];

  for (let rIdx = 0; rIdx < radii.length; rIdx++) {
    const r = radii[rIdx];
    const pts = Array.from({ length: 15 }, (_, i) => {
      const a = -arc * 0.5 + (i / 14) * arc;
      return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, rIdx === 1 ? 0.024 : 0);
    });
    const curve = new THREE.CatmullRomCurve3(pts);
    parts.push(new THREE.TubeGeometry(curve, 22, rIdx === 1 ? 0.018 : 0.013, 8, false));
  }

  const ties = 9;
  for (let i = 0; i < ties; i++) {
    const a = -arc * 0.48 + (i / (ties - 1)) * arc * 0.96;
    const tie = new THREE.BoxGeometry(0.14, 0.018, 0.032);
    tie.rotateZ(a);
    tie.translate(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.008);
    parts.push(tie);
  }

  return mergeNonIndexedGeometries(parts);
}

export class GeometryLibrary {
  constructor() {
    this.cache = new Map();
    this.radii = new Map();
    this._buildAll();
  }

  _register(name, geo) {
    geo.computeBoundingSphere();
    this.cache.set(name, geo);
    this.radii.set(name, geo.boundingSphere ? geo.boundingSphere.radius : 0.5);
  }

  _buildAll() {
    this._register('sphere', new THREE.SphereGeometry(0.5, 38, 26));
    this._register('capsule', new THREE.CapsuleGeometry(0.24, 0.68, 12, 24));
    this._register('torus', new THREE.TorusGeometry(0.54, 0.12, 22, 68));
    this._register('thinRing', new THREE.TorusGeometry(0.72, 0.028, 14, 80));
    this._register('lensDisc', createOpticalLensGeometry());
    this._register('beveledCylinder', createBeveledCylinderGeometry());
    this._register('crystalPrism', createCrystalPrismGeometry());

    const octa = new THREE.OctahedronGeometry(0.54, 0);
    octa.computeVertexNormals();
    this._register('octahedron', octa);

    const ico = new THREE.IcosahedronGeometry(0.52, 0);
    ico.computeVertexNormals();
    this._register('icosahedron', ico);

    this._register('roundedCube', createSuperellipsoidGeometry(0.46, 0.46, 0.46, 0.36, 0.36, 28, 20));
    this._register('teardrop', createTeardropGeometry());
    this._register('spindle', createSpindleGeometry());
    this._register('torusKnot', new THREE.TorusKnotGeometry(0.42, 0.09, 108, 16, 2, 3));
    this._register('torusKnotComplex', new THREE.TorusKnotGeometry(0.44, 0.056, 128, 16, 3, 5));
    this._register('arcSegment', createArcSegmentGeometry());

    // Intricate architectural & transparent-friendly primitives
    this._register('filigreeCage', createFiligreeCageGeometry());
    this._register('ribbedGlassShell', createRibbedGlassShellGeometry());
    this._register('opticalAperture', createOpticalApertureGeometry());
    this._register('hollowPrismRing', createHollowPrismRingGeometry());
    this._register('helicalCoil', createHelicalCoilGeometry());
    this._register('starPolyhedron', createStarPolyhedronGeometry());
    this._register('nestedTorus', createNestedTorusGeometry());

    // Standardized-module meshing horological gears (exact tooth-to-tooth compatibility!)
    this._register('gear8', createModularGearGeometry(8, 0, 0.09));
    this._register('gear10', createModularGearGeometry(10, 3, 0.088));
    this._register('gear12', createModularGearGeometry(12, 4, 0.085));
    this._register('gear16', createModularGearGeometry(16, 5, 0.082));
    this._register('gear20', createModularGearGeometry(20, 6, 0.08));
    this._register('gear24', createModularGearGeometry(24, 6, 0.078));
    this._register('ringGear32', createInternalRingGearGeometry(32, 0.105));
    this._register('ringGear36', createInternalRingGearGeometry(36, 0.105));
    this._register('ringGear40', createInternalRingGearGeometry(40, 0.105));
    this._register('axlePin', createAxlePinGeometry());
    this._register('gearBridge', createGearBridgeGeometry());

    // Alien horology rings & containment frames
    this._register('vernierDial', createVernierDialGeometry());
    this._register('irisBlades', createIrisBladesGeometry());
    this._register('tuningForkRing', createTuningForkRingGeometry());
    this._register('gyroArmillary', createGyroArmillaryGeometry());
    this._register('doubleCage', createDoubleCageGeometry());
    this._register('articulatedSpire', createArticulatedSpireGeometry());
    this._register('segmentedArc', createSegmentedArcGeometry());
  }

  get(name) {
    return this.cache.get(name) || this.cache.get('sphere');
  }

  getRadius(name) {
    return this.radii.get(name) || 0.5;
  }

  getNames() {
    return Array.from(this.cache.keys());
  }
}
