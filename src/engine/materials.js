import * as THREE from 'three';
import { randRange } from './math.js';

let _brushedRoughnessMap = null;
let _microNormalMap = null;

function createMicroTextures() {
  if (_brushedRoughnessMap) return;

  const rCanvas = document.createElement('canvas');
  rCanvas.width = 256;
  rCanvas.height = 256;
  const rCtx = rCanvas.getContext('2d');
  rCtx.fillStyle = '#c8c8c8';
  rCtx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y++) {
    const shade = Math.floor(185 + Math.random() * 55);
    rCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    rCtx.fillRect(0, y, 256, 1);
  }
  for (let i = 0; i < 420; i++) {
    const y = Math.random() * 256;
    const x = Math.random() * 256;
    const len = 30 + Math.random() * 140;
    const v = Math.floor(150 + Math.random() * 90);
    rCtx.fillStyle = `rgba(${v},${v},${v},0.35)`;
    rCtx.fillRect(x, y, len, 1);
  }

  _brushedRoughnessMap = new THREE.CanvasTexture(rCanvas);
  _brushedRoughnessMap.wrapS = THREE.RepeatWrapping;
  _brushedRoughnessMap.wrapT = THREE.RepeatWrapping;
  _brushedRoughnessMap.repeat.set(3, 3);

  const nCanvas = document.createElement('canvas');
  nCanvas.width = 256;
  nCanvas.height = 256;
  const nCtx = nCanvas.getContext('2d');
  const img = nCtx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const idx = (y * 256 + x) * 4;
      const u = (x / 256) * Math.PI * 2;
      const v = (y / 256) * Math.PI * 2;
      const dx = Math.cos(u * 4 + Math.sin(v * 3)) * 6;
      const dy = Math.sin(v * 6 + Math.cos(u * 2)) * 6;
      img.data[idx] = Math.floor(128 + dx);
      img.data[idx + 1] = Math.floor(128 + dy);
      img.data[idx + 2] = 255;
      img.data[idx + 3] = 255;
    }
  }
  nCtx.putImageData(img, 0, 0);
  _microNormalMap = new THREE.CanvasTexture(nCanvas);
  _microNormalMap.wrapS = THREE.RepeatWrapping;
  _microNormalMap.wrapT = THREE.RepeatWrapping;
  _microNormalMap.repeat.set(2, 2);
}

const REFRACTIVE_TYPES = new Set(['opticalGlass', 'smokedGlass', 'iridescentOpal', 'frostedPearl']);
const TRANSLUCENT_TYPES = new Set(['crystalVeil', 'dichroicGlass', 'frostedSheer', 'tintedCrystal']);

/**
 * Returns one of THREE unified GPU shader classes:
 * - 'translucent': True alpha semi-transparent physical glass (see opaque, refractive, AND other translucent objects through it!)
 * - 'refractive':  Real IOR transmission glass with chromatic dispersion (bends & magnifies opaque mechanisms behind it)
 * - 'opaque':      Brushed liquid metal, mirror chrome, obsidian lacquer, and HDR luminous cores
 */
export function getShaderClass(archetype) {
  if (TRANSLUCENT_TYPES.has(archetype)) return 'translucent';
  if (REFRACTIVE_TYPES.has(archetype)) return 'refractive';
  return 'opaque';
}

export function createPhysicalMaterial(archetype, palette) {
  createMicroTextures();

  switch (archetype) {
    // ===== CLASS 1: TRUE SEMI-TRANSPARENT SEE-THROUGH LAYERED GLASS =====
    case 'crystalVeil': {
      return new THREE.MeshPhysicalMaterial({
        color: palette.glass.clone().multiplyScalar(0.82),
        metalness: 0.06,
        roughness: randRange(0.02, 0.07),
        transparent: true,
        opacity: randRange(0.15, 0.24),
        depthWrite: false,
        side: THREE.DoubleSide,
        iridescence: 0.92,
        iridescenceIOR: randRange(1.35, 1.7),
        iridescenceThicknessMinimum: 180,
        iridescenceThicknessMaximum: 680,
        sheen: 0.35,
        sheenRoughness: 0.25,
        sheenColor: palette.accent.clone(),
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        envMapIntensity: 2.0,
        specularIntensity: 1.0,
      });
    }

    case 'dichroicGlass': {
      return new THREE.MeshPhysicalMaterial({
        color: palette.primary.clone().lerp(palette.glass, 0.35).multiplyScalar(0.85),
        metalness: 0.16,
        roughness: randRange(0.03, 0.09),
        transparent: true,
        opacity: randRange(0.18, 0.28),
        depthWrite: false,
        side: THREE.DoubleSide,
        iridescence: 1.0,
        iridescenceIOR: randRange(1.45, 1.85),
        iridescenceThicknessMinimum: 220,
        iridescenceThicknessMaximum: 720,
        sheen: 0.45,
        sheenRoughness: 0.22,
        sheenColor: palette.rimB.clone(),
        clearcoat: 1.0,
        clearcoatRoughness: 0.025,
        envMapIntensity: 2.15,
        specularIntensity: 1.0,
      });
    }

    case 'frostedSheer': {
      return new THREE.MeshPhysicalMaterial({
        color: palette.glass.clone().lerp(palette.secondary, 0.25),
        metalness: 0.05,
        roughness: randRange(0.12, 0.22),
        transparent: true,
        opacity: randRange(0.16, 0.25),
        depthWrite: false,
        side: THREE.DoubleSide,
        iridescence: 0.4,
        iridescenceIOR: 1.4,
        iridescenceThicknessMinimum: 180,
        iridescenceThicknessMaximum: 600,
        sheen: 0.85,
        sheenRoughness: 0.35,
        sheenColor: palette.primary.clone(),
        clearcoat: 0.8,
        clearcoatRoughness: 0.12,
        envMapIntensity: 1.75,
        specularIntensity: 0.95,
      });
    }

    case 'tintedCrystal': {
      return new THREE.MeshPhysicalMaterial({
        color: palette.primary.clone().lerp(palette.rimA, 0.35).multiplyScalar(0.88),
        metalness: 0.1,
        roughness: randRange(0.04, 0.11),
        transparent: true,
        opacity: randRange(0.22, 0.33),
        depthWrite: false,
        side: THREE.DoubleSide,
        iridescence: 0.65,
        iridescenceIOR: 1.52,
        iridescenceThicknessMinimum: 200,
        iridescenceThicknessMaximum: 620,
        sheen: 0.25,
        sheenRoughness: 0.3,
        sheenColor: palette.accent.clone(),
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        envMapIntensity: 1.95,
        specularIntensity: 1.0,
      });
    }

    // ===== CLASS 2: REAL IOR REFRACTIVE TRANSMISSION OPTICS =====
    case 'opticalGlass': {
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xffffff),
        metalness: 0.0,
        roughness: randRange(0.015, 0.06),
        transmission: randRange(0.92, 0.98),
        ior: randRange(1.48, 2.05),
        thickness: randRange(1.2, 2.5),
        dispersion: randRange(2.4, 5.8),
        attenuationColor: palette.glass.clone(),
        attenuationDistance: randRange(1.3, 3.2),
        iridescence: 0.12,
        iridescenceIOR: 1.45,
        iridescenceThicknessMinimum: 180,
        iridescenceThicknessMaximum: 640,
        sheen: 0.001,
        sheenRoughness: 0.4,
        sheenColor: palette.primary.clone(),
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        envMapIntensity: 1.55,
        specularIntensity: 1.0,
        transparent: false,
      });
    }

    case 'smokedGlass': {
      const tint = palette.secondary.clone().lerp(palette.glass, 0.42);
      return new THREE.MeshPhysicalMaterial({
        color: tint,
        metalness: 0.06,
        roughness: randRange(0.08, 0.2),
        transmission: randRange(0.66, 0.84),
        ior: 1.56,
        thickness: randRange(0.9, 1.8),
        dispersion: randRange(1.2, 2.6),
        attenuationColor: palette.primary.clone(),
        attenuationDistance: 1.6,
        iridescence: 0.16,
        iridescenceIOR: 1.45,
        iridescenceThicknessMinimum: 180,
        iridescenceThicknessMaximum: 640,
        sheen: 0.001,
        sheenRoughness: 0.4,
        sheenColor: palette.primary.clone(),
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        envMapIntensity: 1.45,
        transparent: false,
      });
    }

    case 'iridescentOpal': {
      return new THREE.MeshPhysicalMaterial({
        color: palette.glass.clone().lerp(palette.primary, 0.35),
        metalness: randRange(0.18, 0.4),
        roughness: randRange(0.05, 0.14),
        transmission: randRange(0.45, 0.7),
        ior: 1.52,
        thickness: 1.0,
        dispersion: 2.0,
        attenuationColor: palette.glass.clone(),
        attenuationDistance: 1.9,
        iridescence: 1.0,
        iridescenceIOR: randRange(1.3, 1.75),
        iridescenceThicknessMinimum: 180,
        iridescenceThicknessMaximum: 680,
        sheen: 0.15,
        sheenRoughness: 0.35,
        sheenColor: palette.accent.clone(),
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        envMapIntensity: 1.55,
        transparent: false,
      });
    }

    case 'frostedPearl': {
      return new THREE.MeshPhysicalMaterial({
        color: palette.accent.clone().lerp(palette.primary, 0.25),
        metalness: 0.08,
        roughness: randRange(0.22, 0.35),
        transmission: randRange(0.35, 0.55),
        ior: 1.44,
        thickness: 0.8,
        dispersion: 0.8,
        attenuationColor: palette.primary.clone(),
        attenuationDistance: 2.0,
        iridescence: 0.25,
        iridescenceIOR: 1.4,
        iridescenceThicknessMinimum: 180,
        iridescenceThicknessMaximum: 640,
        sheen: 0.85,
        sheenRoughness: 0.35,
        sheenColor: palette.primary.clone(),
        clearcoat: 0.55,
        clearcoatRoughness: 0.15,
        envMapIntensity: 1.35,
        transparent: false,
      });
    }

    // ===== CLASS 3: OPAQUE METALLIC / OBSIDIAN / LUMINOUS MECHANISMS =====
    case 'liquidMetal': {
      return new THREE.MeshPhysicalMaterial({
        color: palette.primary.clone(),
        metalness: 1.0,
        roughness: randRange(0.08, 0.2),
        roughnessMap: _brushedRoughnessMap,
        normalMap: _microNormalMap,
        normalScale: new THREE.Vector2(0.08, 0.08),
        iridescence: 0.02,
        iridescenceIOR: 1.4,
        iridescenceThicknessMinimum: 200,
        iridescenceThicknessMaximum: 520,
        clearcoat: 0.85,
        clearcoatRoughness: 0.05,
        envMapIntensity: 1.6,
      });
    }

    case 'chromeMirror': {
      const tint = palette.accent.clone().lerp(new THREE.Color(0xdbeafe), 0.45);
      return new THREE.MeshPhysicalMaterial({
        color: tint,
        metalness: 1.0,
        roughness: randRange(0.04, 0.11),
        roughnessMap: _brushedRoughnessMap,
        normalMap: _microNormalMap,
        normalScale: new THREE.Vector2(0.02, 0.02),
        iridescence: 0.08,
        iridescenceIOR: 1.4,
        iridescenceThicknessMinimum: 200,
        iridescenceThicknessMaximum: 520,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        envMapIntensity: 1.65,
      });
    }

    case 'obsidianLacquer': {
      return new THREE.MeshPhysicalMaterial({
        color: palette.secondary.clone().multiplyScalar(0.5),
        metalness: 0.22,
        roughness: 0.08,
        roughnessMap: _brushedRoughnessMap,
        normalMap: _microNormalMap,
        normalScale: new THREE.Vector2(0.015, 0.015),
        iridescence: 0.35,
        iridescenceIOR: 1.42,
        iridescenceThicknessMinimum: 220,
        iridescenceThicknessMaximum: 480,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        envMapIntensity: 1.75,
      });
    }

    case 'emissiveCore': {
      const col = palette.emissive.clone();
      return new THREE.MeshPhysicalMaterial({
        color: col.clone().lerp(new THREE.Color(0xffffff), 0.5),
        emissive: col,
        emissiveIntensity: randRange(2.1, 3.1),
        metalness: 0.1,
        roughness: 0.09,
        roughnessMap: _brushedRoughnessMap,
        normalMap: _microNormalMap,
        normalScale: new THREE.Vector2(0.0, 0.0),
        iridescence: 0.01,
        iridescenceIOR: 1.4,
        iridescenceThicknessMinimum: 200,
        iridescenceThicknessMaximum: 520,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        envMapIntensity: 1.1,
      });
    }

    default:
      return createPhysicalMaterial('liquidMetal', palette);
  }
}

/**
 * Returns a shader-compatible target snapshot locked to `stayShaderClass`
 * ('translucent' | 'refractive' | 'opaque') so morphs NEVER trigger GLSL recompiles.
 */
export function getMaterialTargetSnapshot(archetype, palette, stayShaderClass = null) {
  let effectiveType = archetype;
  const targetClass = getShaderClass(archetype);

  if (stayShaderClass && targetClass !== stayShaderClass) {
    if (stayShaderClass === 'translucent') {
      effectiveType = archetype === 'frostedPearl' ? 'frostedSheer' : archetype === 'opticalGlass' ? 'crystalVeil' : 'dichroicGlass';
    } else if (stayShaderClass === 'refractive') {
      effectiveType = archetype === 'crystalVeil' ? 'opticalGlass' : archetype === 'frostedSheer' ? 'frostedPearl' : 'iridescentOpal';
    } else {
      effectiveType = archetype === 'opticalGlass' || archetype === 'crystalVeil' ? 'chromeMirror' : 'liquidMetal';
    }
  }

  switch (effectiveType) {
    case 'crystalVeil':
      return {
        color: palette.glass.clone().lerp(new THREE.Color(0xffffff), 0.35),
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.0,
        metalness: 0.04,
        roughness: 0.05,
        transmission: 0.0,
        opacity: 0.19,
        iridescence: 0.92,
        attenuationColor: palette.glass.clone(),
      };
    case 'dichroicGlass':
      return {
        color: palette.primary.clone().lerp(palette.glass, 0.55),
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.0,
        metalness: 0.14,
        roughness: 0.07,
        transmission: 0.0,
        opacity: 0.23,
        iridescence: 1.0,
        attenuationColor: palette.primary.clone(),
      };
    case 'frostedSheer':
      return {
        color: palette.accent.clone().lerp(palette.glass, 0.4),
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.0,
        metalness: 0.02,
        roughness: 0.28,
        transmission: 0.0,
        opacity: 0.2,
        iridescence: 0.4,
        attenuationColor: palette.accent.clone(),
      };
    case 'tintedCrystal':
      return {
        color: palette.primary.clone().lerp(palette.rimA, 0.3),
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.0,
        metalness: 0.08,
        roughness: 0.09,
        transmission: 0.0,
        opacity: 0.27,
        iridescence: 0.65,
        attenuationColor: palette.primary.clone(),
      };
    case 'opticalGlass':
      return {
        color: new THREE.Color(0xffffff),
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.0,
        metalness: 0.0,
        roughness: 0.04,
        transmission: 0.95,
        opacity: 1.0,
        iridescence: 0.12,
        attenuationColor: palette.glass.clone(),
      };
    case 'smokedGlass':
      return {
        color: palette.secondary.clone().lerp(palette.glass, 0.42),
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.0,
        metalness: 0.06,
        roughness: 0.14,
        transmission: 0.74,
        opacity: 1.0,
        iridescence: 0.16,
        attenuationColor: palette.primary.clone(),
      };
    case 'iridescentOpal':
      return {
        color: palette.glass.clone().lerp(palette.primary, 0.35),
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.0,
        metalness: 0.26,
        roughness: 0.09,
        transmission: 0.56,
        opacity: 1.0,
        iridescence: 1.0,
        attenuationColor: palette.glass.clone(),
      };
    case 'frostedPearl':
      return {
        color: palette.accent.clone().lerp(palette.primary, 0.25),
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.0,
        metalness: 0.08,
        roughness: 0.26,
        transmission: 0.45,
        opacity: 1.0,
        iridescence: 0.25,
        attenuationColor: palette.primary.clone(),
      };
    case 'liquidMetal':
      return {
        color: palette.primary.clone(),
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.0,
        metalness: 1.0,
        roughness: 0.13,
        transmission: 0.0,
        opacity: 1.0,
        iridescence: 0.02,
        attenuationColor: palette.primary.clone(),
      };
    case 'chromeMirror':
      return {
        color: palette.accent.clone().lerp(new THREE.Color(0xdbeafe), 0.45),
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.0,
        metalness: 1.0,
        roughness: 0.06,
        transmission: 0.0,
        opacity: 1.0,
        iridescence: 0.08,
        attenuationColor: palette.accent.clone(),
      };
    case 'obsidianLacquer':
      return {
        color: palette.secondary.clone().multiplyScalar(0.5),
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.0,
        metalness: 0.22,
        roughness: 0.08,
        transmission: 0.0,
        opacity: 1.0,
        iridescence: 0.35,
        attenuationColor: palette.secondary.clone(),
      };
    case 'emissiveCore':
    default:
      return {
        color: palette.emissive.clone().lerp(new THREE.Color(0xffffff), 0.5),
        emissive: palette.emissive.clone(),
        emissiveIntensity: 2.6,
        metalness: 0.1,
        roughness: 0.09,
        transmission: 0.0,
        opacity: 1.0,
        iridescence: 0.01,
        attenuationColor: palette.emissive.clone(),
      };
  }
}

/**
 * Compiles all THREE unified GPU shader classes (translucent + refractive + opaque)
 * ONCE at startup so runtime transitions run with zero shader hitches.
 */
export function prewarmShaders(renderer, scene, camera, geoLib) {
  const dummyPalette = {
    primary: new THREE.Color(0xd4a353),
    secondary: new THREE.Color(0x181b22),
    accent: new THREE.Color(0xffffff),
    glass: new THREE.Color(0xb8e8ff),
    emissive: new THREE.Color(0x7dd3fc),
    rimA: new THREE.Color(0x38bdf8),
    rimB: new THREE.Color(0xc084fc),
  };

  const geo = geoLib.get('sphere');
  const matTranslucent = createPhysicalMaterial('crystalVeil', dummyPalette);
  const matRefractive = createPhysicalMaterial('opticalGlass', dummyPalette);
  const matOpaque = createPhysicalMaterial('liquidMetal', dummyPalette);

  const m1 = new THREE.Mesh(geo, matTranslucent);
  const m2 = new THREE.Mesh(geo, matRefractive);
  const m3 = new THREE.Mesh(geo, matOpaque);
  m1.position.set(0, 0, -50);
  m2.position.set(0, 0, -50);
  m3.position.set(0, 0, -50);
  m1.scale.setScalar(0.0001);
  m2.scale.setScalar(0.0001);
  m3.scale.setScalar(0.0001);

  scene.add(m1, m2, m3);
  renderer.compile(scene, camera);
  scene.remove(m1, m2, m3);
  matTranslucent.dispose();
  matRefractive.dispose();
  matOpaque.dispose();
}
