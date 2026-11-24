import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const PHI = (1 + Math.sqrt(5)) / 2;
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function smootherstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function easeOutCubic(t) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

export function easeInCubic(t) {
  const x = clamp(t, 0, 1);
  return x * x * x;
}

export function easeInOutQuart(t) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2;
}

/**
 * Organic growth curve: lingers briefly near 0 (1-pixel seed spark),
 * blooms smoothly with botanical acceleration, and settles softly.
 */
export function easeOrganicGrow(t) {
  const x = clamp(t, 0, 1);
  if (x <= 0.1) {
    // Brief coherent pinpoint seed phase before blossoming
    return 0.015 * smoothstep(x / 0.1);
  }
  const u = (x - 0.1) / 0.9;
  // Smooth S-curve with gentle organic spring settle
  const base = smootherstep(u);
  const breath = Math.sin(u * Math.PI) * 0.06 * u;
  return clamp(0.015 + (base + breath) * 0.985, 0, 1.03);
}

/**
 * Organic dissolution curve: starts at 1, collapses smoothly down
 * to a single pinpoint pixel and holds 1px briefly before extinguishing.
 */
export function easeOrganicShrink(t) {
  const x = clamp(t, 0, 1);
  if (x >= 0.9) {
    // Hold briefly at 1px pinpoint before vanishing
    return 0.0;
  }
  const u = x / 0.9;
  return Math.pow(1 - smootherstep(u), 1.35);
}

export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(randRange(min, max + 1));
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function weightedPick(items) {
  let total = 0;
  for (const item of items) total += item.weight;
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

export function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const _camPos = new THREE.Vector3();
const _worldPos = new THREE.Vector3();

/**
 * Computes the exact uniform scale factor at which an object of local bounding
 * radius `localRadius` subtends approximately `pixelSize` pixels on screen.
 * Enforces the sacred invariant: every object begins and ends at 1 pixel.
 */
export function computePixelScale(position, localRadius, camera, viewportHeightPx, pixelSize = 1.0) {
  camera.getWorldPosition(_camPos);
  _worldPos.copy(position);
  const dist = Math.max(0.25, _camPos.distanceTo(_worldPos));
  const vFovRad = THREE.MathUtils.degToRad(camera.fov);
  const worldHeightAtDist = 2 * dist * Math.tan(vFovRad * 0.5);
  const worldPerPixel = worldHeightAtDist / Math.max(1, viewportHeightPx);
  const desiredDiameter = worldPerPixel * pixelSize;
  const diameter = Math.max(0.001, localRadius * 2);
  return clamp(desiredDiameter / diameter, 0.0004, 0.15);
}

/**
 * Curated photorealistic studio & optical color harmonies.
 * Each instantiation applies subtle randomized hue/saturation drift so
 * no two generated systems ever repeat identically.
 */
const PALETTE_ARCHETYPES = [
  {
    name: 'Obsidian & Molten Gold',
    primary: '#d4a353',
    secondary: '#181b22',
    accent: '#ffcf7d',
    glass: '#f5e1be',
    emissive: '#ffb84d',
    rimA: '#ff9d3b',
    rimB: '#4a7aff',
    bg: '#030407',
  },
  {
    name: 'Cryo Sapphire & Diamond',
    primary: '#7dd3fc',
    secondary: '#0f1c2e',
    accent: '#e0f7ff',
    glass: '#b8e8ff',
    emissive: '#5ce1ff',
    rimA: '#38bdf8',
    rimB: '#818cf8',
    bg: '#02050b',
  },
  {
    name: 'Dichroic Amber & Rose Quartz',
    primary: '#f48fb1',
    secondary: '#261320',
    accent: '#ffbe76',
    glass: '#ffd3e2',
    emissive: '#ff7096',
    rimA: '#ff9f43',
    rimB: '#d946ef',
    bg: '#060308',
  },
  {
    name: 'Mercury & Bioluminescent Emerald',
    primary: '#5eead4',
    secondary: '#0e1f1e',
    accent: '#d1fae5',
    glass: '#a7f3d0',
    emissive: '#2dd4bf',
    rimA: '#10b981',
    rimB: '#38bdf8',
    bg: '#020707',
  },
  {
    name: 'Ultraviolet Opal & Silver',
    primary: '#c4b5fd',
    secondary: '#171326',
    accent: '#f5d0fe',
    glass: '#ddd6fe',
    emissive: '#a855f7',
    rimA: '#c084fc',
    rimB: '#38bdf8',
    bg: '#040309',
  },
  {
    name: 'Solar Copper & Aegean Crystal',
    primary: '#e07a5f',
    secondary: '#122026',
    accent: '#ffd6a5',
    glass: '#81d4fa',
    emissive: '#ff8a5b',
    rimA: '#f97316',
    rimB: '#06b6d4',
    bg: '#030608',
  },
  {
    name: 'Champagne Pearl & Smoked Titanium',
    primary: '#e8dcc8',
    secondary: '#202228',
    accent: '#ffffff',
    glass: '#f3ede2',
    emissive: '#ffe7c2',
    rimA: '#f6d5a4',
    rimB: '#8fa8d6',
    bg: '#040406',
  },
  {
    name: 'Crimson Ruby & Noir Chrome',
    primary: '#fb7185',
    secondary: '#191318',
    accent: '#ffe4e6',
    glass: '#fda4af',
    emissive: '#f43f5e',
    rimA: '#ff4d6d',
    rimB: '#6366f1',
    bg: '#060204',
  },
  {
    name: 'Aurora Citrine & Cobalt Glass',
    primary: '#fde047',
    secondary: '#101829',
    accent: '#fef9c3',
    glass: '#93c5fd',
    emissive: '#facc15',
    rimA: '#eab308',
    rimB: '#3b82f6',
    bg: '#02040a',
  },
  {
    name: 'Iridescent Platinum & Prism',
    primary: '#e2e8f0',
    secondary: '#181c24',
    accent: '#ffffff',
    glass: '#e0f2fe',
    emissive: '#bae6fd',
    rimA: '#7dd3fc',
    rimB: '#f0abfc',
    bg: '#030407',
  },
];

function jitterColor(hex, hueShift, satShift = 0, lightShift = 0) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  hsl.h = (hsl.h + hueShift + 1) % 1;
  hsl.s = clamp(hsl.s + satShift, 0.05, 1.0);
  hsl.l = clamp(hsl.l + lightShift, 0.04, 0.96);
  c.setHSL(hsl.h, hsl.s, hsl.l);
  return c;
}

export function generatePalette(previousName = '') {
  const candidates = PALETTE_ARCHETYPES.filter((p) => p.name !== previousName);
  const base = pick(candidates.length ? candidates : PALETTE_ARCHETYPES);
  const hueDrift = randRange(-0.045, 0.045);
  const satDrift = randRange(-0.06, 0.08);

  return {
    name: base.name,
    primary: jitterColor(base.primary, hueDrift, satDrift, 0),
    secondary: jitterColor(base.secondary, hueDrift, 0, randRange(-0.02, 0.03)),
    accent: jitterColor(base.accent, hueDrift * 0.5, 0, 0),
    glass: jitterColor(base.glass, hueDrift, satDrift, 0),
    emissive: jitterColor(base.emissive, hueDrift, 0.05, 0),
    rimA: jitterColor(base.rimA, hueDrift, satDrift, 0),
    rimB: jitterColor(base.rimB, hueDrift, satDrift, 0),
    bg: new THREE.Color(base.bg),
  };
}
