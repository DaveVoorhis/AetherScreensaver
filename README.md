# AetherScreensaver

A photorealistic, real-time 3D browser-based screensaver built with Three.js and Vite that procedurally composes an infinite variety of alien clockwork machinery, optical glass structures, and luminous conduits.

## Features

- **1-Pixel Organic Lifecycle**: Nothing ever appears or disappears by magic—every gear, ring gear, axle, bridge, shell, and optical ribbon blooms organically from a 1-pixel pinpoint spark, continuously cross-blends/reassembles into new formations, or shrinks cleanly back down to a single pixel.
- **Mathematically Meshed Geartrains**: Standardized-module external gears (`gear8`–`gear24`) and internal-toothed annular ring gears (`ringGear32`–`ringGear40`) connected via machined `axlePin` shafts and twin-rail `gearBridge` bars—forming exact epicyclic planetary gearboxes and multi-deck compound branching gear trains with zero slip.
- **Layered Photorealistic Optics**: Prewarmed physical shader pipeline combining whisper-clear translucent crystal shells, refractive dichroic/optical glass, liquid metal, mirror chrome, and obsidian lacquer under a procedural HDR studio softbox environment.
- **Custom HDR Post-Processing**: 4× MSAA half-float `EffectComposer` with thresholded `UnrealBloomPass`, custom optical lens flare shader (6-blade starburst, horizontal anamorphic streak, chromatic bokeh ghosts), and ACES filmic tone grading.
- **Locked 60 FPS Continuous Transitions**: Fixed persistent light rig, 3 unified prewarmed GPU shader classes, and live-trajectory cross-blending prevent runtime shader stalls or pauses.

## Getting Started

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Controls

| Input | Action |
| --- | --- |
| Drag | Orbit camera around the sculpture |
| Scroll wheel | Zoom in / out |
| `N` or **Morph** button | Smoothly blend into a new procedural system |
| `S` | Trigger a 1-pixel singularity collapse & rebirth |
| `Space` | Pause / resume animation |
| `O` | Toggle live Optics tuning panel (speed, bloom, glare, flare, contrast, exposure) |
| `F` | Toggle fullscreen |
| `H` | Toggle HUD visibility |
