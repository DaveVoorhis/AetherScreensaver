import * as THREE from 'three';
import { createStudioEnvironment, createCycloramaBackdrop, StudioLightRig } from './engine/environment.js';
import { GeometryLibrary } from './engine/geometries.js';
import { prewarmShaders } from './engine/materials.js';
import { LensFlareController } from './engine/lensFlare.js';
import { PostProcessPipeline } from './engine/postprocess.js';
import { ScreensaverDirector } from './engine/director.js';

// ---------- RENDERER & SCENE SETUP ----------
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false, // 4x MSAA handled on HDR EffectComposer render target
  powerPreference: 'high-performance',
  alpha: false,
});
const dpr = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NoToneMapping; // Handled by FilmicGradePass in HDR
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010204);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, 2, 11.2);

// Procedural HDR studio reflection map for physical glass, chrome, obsidian & iridescence
scene.environment = createStudioEnvironment(renderer);
scene.environmentIntensity = 0.92;

// Smooth infinite dark studio cyclorama backdrop
const backdrop = createCycloramaBackdrop();
scene.add(backdrop.mesh);

const lightRig = new StudioLightRig(scene);
const geoLib = new GeometryLibrary();
const flareController = new LensFlareController();
const postProcess = new PostProcessPipeline(renderer, scene, camera);

// Pre-compile both unified GPU shader programs (transmissive + opaque) once at boot
// so runtime transitions never stall for shader compilation
prewarmShaders(renderer, scene, camera, geoLib);

const director = new ScreensaverDirector(
  scene,
  camera,
  geoLib,
  lightRig,
  backdrop.uniforms,
  flareController
);

// ---------- HUD & INTERACTION WIRING ----------
const hud = document.getElementById('hud');
const opticsPanel = document.getElementById('optics-panel');
const elSystemName = document.getElementById('system-name');
const elSystemMeta = document.getElementById('system-meta');
const elStatusDot = document.getElementById('status-dot');

const btnMorph = document.getElementById('btn-morph');
const btnPause = document.getElementById('btn-pause');
const iconPause = document.getElementById('icon-pause');
const iconPlay = document.getElementById('icon-play');
const btnOptics = document.getElementById('btn-optics');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnResetOptics = document.getElementById('btn-reset-optics');

const ctrlSpeed = document.getElementById('ctrl-speed');
const ctrlBloom = document.getElementById('ctrl-bloom');
const ctrlGlare = document.getElementById('ctrl-glare');
const ctrlFlare = document.getElementById('ctrl-flare');
const ctrlContrast = document.getElementById('ctrl-contrast');
const ctrlExposure = document.getElementById('ctrl-exposure');

const valSpeed = document.getElementById('val-speed');
const valBloom = document.getElementById('val-bloom');
const valGlare = document.getElementById('val-glare');
const valFlare = document.getElementById('val-flare');
const valContrast = document.getElementById('val-contrast');
const valExposure = document.getElementById('val-exposure');

let isPaused = false;
let hudPinnedOpen = false;
let hudHideTimer = null;

function revealHud() {
  hud.classList.remove('hidden');
  document.body.classList.remove('cursor-hidden');
  clearTimeout(hudHideTimer);
  if (!hudPinnedOpen) {
    hudHideTimer = setTimeout(() => {
      hud.classList.add('hidden');
      document.body.classList.add('cursor-hidden');
    }, 3400);
  }
}

function togglePause() {
  isPaused = !isPaused;
  iconPause.classList.toggle('hidden', isPaused);
  iconPlay.classList.toggle('hidden', !isPaused);
  btnPause.classList.toggle('active', isPaused);
}

function toggleOptics() {
  hudPinnedOpen = !hudPinnedOpen;
  opticsPanel.classList.toggle('hidden', !hudPinnedOpen);
  btnOptics.classList.toggle('active', hudPinnedOpen);
  revealHud();
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

function applyOpticsDefaults() {
  ctrlSpeed.value = '1.0';
  ctrlBloom.value = '0.34';
  ctrlGlare.value = '0.45';
  ctrlFlare.value = '0.85';
  ctrlContrast.value = '1.14';
  ctrlExposure.value = '1.0';
  syncOpticsFromSliders();
}

function syncOpticsFromSliders() {
  const speed = parseFloat(ctrlSpeed.value);
  const bloom = parseFloat(ctrlBloom.value);
  const glare = parseFloat(ctrlGlare.value);
  const flare = parseFloat(ctrlFlare.value);
  const contrast = parseFloat(ctrlContrast.value);
  const exposure = parseFloat(ctrlExposure.value);

  director.speedMultiplier = speed;
  postProcess.setBloomStrength(bloom);
  postProcess.setGlareStrength(glare);
  flareController.globalStrength = flare;
  postProcess.setContrast(contrast);
  postProcess.setExposure(exposure);

  valSpeed.textContent = `${speed.toFixed(2).replace(/\.00$/, '.0')}×`;
  valBloom.textContent = bloom.toFixed(2);
  valGlare.textContent = glare.toFixed(2);
  valFlare.textContent = flare.toFixed(2);
  valContrast.textContent = contrast.toFixed(2);
  valExposure.textContent = exposure.toFixed(2);
}

btnMorph.addEventListener('click', () => {
  director.triggerTransition();
  revealHud();
});
btnPause.addEventListener('click', () => {
  togglePause();
  revealHud();
});
btnOptics.addEventListener('click', toggleOptics);
btnFullscreen.addEventListener('click', toggleFullscreen);
btnResetOptics.addEventListener('click', applyOpticsDefaults);

[ctrlSpeed, ctrlBloom, ctrlGlare, ctrlFlare, ctrlContrast, ctrlExposure].forEach((input) => {
  input.addEventListener('input', syncOpticsFromSliders);
});

// Pointer drag orbit & wheel zoom
let dragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  revealHud();
});

canvas.addEventListener('pointermove', (e) => {
  revealHud();
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  director.nudgeCamera(-dx * 0.0055, dy * 0.0045);
});

canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  canvas.releasePointerCapture?.(e.pointerId);
  director.endUserOrbit();
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    director.nudgeZoom(e.deltaY * 0.006);
    revealHud();
  },
  { passive: false }
);

hud.addEventListener('pointerenter', () => clearTimeout(hudHideTimer));
hud.addEventListener('pointerleave', () => revealHud());
opticsPanel.addEventListener('pointerenter', () => clearTimeout(hudHideTimer));

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePause();
    revealHud();
  } else if (e.key === 'n' || e.key === 'N') {
    director.triggerTransition();
    revealHud();
  } else if (e.key === 's' || e.key === 'S') {
    director.triggerTransition('singularity');
    revealHud();
  } else if (e.key === 'f' || e.key === 'F') {
    toggleFullscreen();
  } else if (e.key === 'o' || e.key === 'O') {
    toggleOptics();
  } else if (e.key === 'h' || e.key === 'H') {
    hudPinnedOpen = false;
    opticsPanel.classList.add('hidden');
    btnOptics.classList.remove('active');
    hud.classList.toggle('hidden');
  }
});

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h);
  postProcess.resize(w, h, pixelRatio);
});

document.body.classList.add('cursor-hidden');
syncOpticsFromSliders();

// ---------- MAIN ANIMATION LOOP ----------
let prevTime = performance.now();
let smoothDt = 1 / 60;
let hudSyncAcc = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const rawDt = Math.min(Math.max((now - prevTime) * 0.001, 0.001), 0.05);
  prevTime = now;
  // Gentle exponential frame-delta smoothing prevents micro-jitter perception
  smoothDt += (rawDt - smoothDt) * 0.25;

  if (!isPaused) {
    const viewportHeightPx = window.innerHeight * renderer.getPixelRatio();
    director.update(smoothDt, viewportHeightPx);
    postProcess.syncFlares(flareController, director.time);
  }

  postProcess.render();

  hudSyncAcc += rawDt;
  if (hudSyncAcc > 0.25) {
    hudSyncAcc = 0;
    const status = director.getStatus();
    if (elSystemName.textContent !== status.name) elSystemName.textContent = status.name;
    if (elSystemMeta.textContent !== status.meta) elSystemMeta.textContent = status.meta;
    elStatusDot.style.background = status.accentHex;
    elStatusDot.style.boxShadow = `0 0 10px ${status.accentHex}`;
  }
}

requestAnimationFrame(animate);
