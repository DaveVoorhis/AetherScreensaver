import * as THREE from 'three';

/**
 * Generates a high-contrast procedural HDR studio reflection environment
 * using Three.js PMREMGenerator. Crisp specular light strips & softboxes
 * surrounded by velvety dark studio space produce luxury-macro photorealism
 * on glass, chrome, obsidian, and iridescent physical materials.
 */
export function createStudioEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x010204);

  const makePanel = (w, h, color, intensity, pos, lookTarget = [0, 0, 0]) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.lookAt(lookTarget[0], lookTarget[1], lookTarget[2]);
    envScene.add(mesh);
    return mesh;
  };

  // Sculpted studio softboxes & thin specular rim strips (calibrated HDR range)
  makePanel(16, 4.5, 0xffffff, 2.8, [0, 14, 2]);
  makePanel(24, 1.1, 0xdbeafe, 4.6, [-12, 7, -8]);
  makePanel(18, 1.8, 0xffedd5, 3.6, [14, 4, 9]);
  makePanel(20, 3.0, 0x38bdf8, 1.5, [-10, -10, 10]);
  makePanel(14, 1.5, 0xf0abfc, 2.1, [11, -6, -12]);
  makePanel(24, 24, 0x0b1120, 0.45, [0, -16, 0]);

  // Crisp luminous rings inside the lightbox for wrap-around specular contours
  const ringGeo = new THREE.TorusGeometry(13, 0.16, 16, 96);
  const ringA = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.6) })
  );
  ringA.rotation.set(Math.PI * 0.35, 0.4, 0);
  envScene.add(ringA);

  const ringB = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x93c5fd).multiplyScalar(1.9) })
  );
  ringB.rotation.set(-Math.PI * 0.28, -0.7, 0.5);
  ringB.scale.setScalar(1.15);
  envScene.add(ringB);

  // Pinpoint studio catchlights for jewel-like crystal facets
  const glintGeo = new THREE.SphereGeometry(0.28, 12, 12);
  const glintCoords = [
    [10, 9, -6, 0xffffff, 6.2],
    [-11, 8, 7, 0xbae6fd, 5.2],
    [8, -7, 11, 0xfde68a, 4.8],
    [-9, -8, -9, 0xe9d5ff, 4.5],
    [0, 12, -11, 0xffffff, 5.8],
    [13, 1, -2, 0xffedd5, 4.8],
  ];
  for (const [x, y, z, col, intensity] of glintCoords) {
    const m = new THREE.Mesh(
      glintGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(intensity) })
    );
    m.position.set(x, y, z);
    envScene.add(m);
  }

  const renderTarget = pmrem.fromScene(envScene, 0.032);
  pmrem.dispose();

  envScene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });

  return renderTarget.texture;
}

export function createCycloramaBackdrop() {
  const geo = new THREE.SphereGeometry(95, 40, 28);
  const uniforms = {
    uColorCenter: { value: new THREE.Color(0x0a101d) },
    uColorEdge: { value: new THREE.Color(0x010103) },
    uAccentA: { value: new THREE.Color(0x1d4ed8) },
    uAccentB: { value: new THREE.Color(0x7c3aed) },
    uTime: { value: 0 },
  };

  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorCenter;
      uniform vec3 uColorEdge;
      uniform vec3 uAccentA;
      uniform vec3 uAccentB;
      uniform float uTime;
      varying vec3 vWorldDir;

      void main() {
        vec3 d = normalize(vWorldDir);
        float elev = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 base = mix(uColorEdge, uColorCenter, pow(1.0 - abs(d.y), 2.4) * 0.55);

        vec3 lobeA = normalize(vec3(sin(uTime * 0.06), 0.28, cos(uTime * 0.06)));
        vec3 lobeB = normalize(vec3(-cos(uTime * 0.045), -0.22, sin(uTime * 0.045)));
        float washA = pow(max(0.0, dot(d, lobeA)), 5.0) * 0.11;
        float washB = pow(max(0.0, dot(d, lobeB)), 6.0) * 0.09;

        vec3 col = base + uAccentA * washA + uAccentB * washB;
        col *= mix(0.7, 1.0, elev);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -100;
  return { mesh, uniforms };
}

/**
 * Dynamic studio lighting rig with a FIXED persistent pool of core point lights.
 * Keeping the light count constant forever guarantees ZERO Three.js shader
 * recompilations during transitions!
 */
export class StudioLightRig {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.65);
    this.keyLight.position.set(10, 14, 12);
    this.group.add(this.keyLight);

    this.rimLightA = new THREE.PointLight(0x38bdf8, 28, 45, 1.7);
    this.rimLightA.position.set(-10, 6, -8);
    this.group.add(this.rimLightA);

    this.rimLightB = new THREE.PointLight(0xff9f43, 24, 45, 1.7);
    this.rimLightB.position.set(11, -5, 7);
    this.group.add(this.rimLightB);

    this.fillLight = new THREE.HemisphereLight(0xcbd5e1, 0x050810, 0.22);
    this.group.add(this.fillLight);

    // Persistent pool of 3 core point lights that smoothly track active luminous cores
    this.coreLights = [
      new THREE.PointLight(0xffffff, 0, 24, 1.75),
      new THREE.PointLight(0xffffff, 0, 20, 1.8),
      new THREE.PointLight(0xffffff, 0, 20, 1.8),
    ];
    for (const light of this.coreLights) {
      this.group.add(light);
    }

    this._targetRimA = new THREE.Color(0x38bdf8);
    this._targetRimB = new THREE.Color(0xff9f43);
    this._targetKey = new THREE.Color(0xffffff);
  }

  setPalette(palette) {
    this._targetRimA.copy(palette.rimA);
    this._targetRimB.copy(palette.rimB);
    this._targetKey.copy(palette.accent).lerp(new THREE.Color(0xffffff), 0.72);
  }

  /**
   * Smoothly binds persistent core point lights to the brightest active luminous
   * emitter nodes without ever adding or removing lights from the scene.
   */
  syncCoreLights(emitters, dt) {
    const smoothPos = 1 - Math.exp(-8.0 * dt);
    const smoothInt = 1 - Math.exp(-5.0 * dt);

    for (let i = 0; i < this.coreLights.length; i++) {
      const light = this.coreLights[i];
      if (i < emitters.length) {
        const e = emitters[i];
        const targetIntensity = (i === 0 ? 22 : 14) * e.strength * e.life * e.life;
        if (light.intensity < 0.05) {
          light.position.copy(e.position);
          light.color.copy(e.color);
        } else {
          light.position.lerp(e.position, smoothPos);
          light.color.lerp(e.color, smoothInt);
        }
        light.intensity += (targetIntensity - light.intensity) * smoothInt;
      } else {
        light.intensity += (0 - light.intensity) * smoothInt;
      }
    }
  }

  update(time, dt, globalActivity = 1.0) {
    const k = 1 - Math.exp(-1.5 * dt);
    this.rimLightA.color.lerp(this._targetRimA, k);
    this.rimLightB.color.lerp(this._targetRimB, k);
    this.keyLight.color.lerp(this._targetKey, k);

    const a1 = time * 0.22;
    const a2 = -time * 0.17 + 1.8;
    this.rimLightA.position.set(Math.cos(a1) * 12, Math.sin(a1 * 0.7) * 6 + 2, Math.sin(a1) * 12);
    this.rimLightB.position.set(Math.cos(a2) * 11, Math.sin(a2 * 0.9) * 5 - 2, Math.sin(a2) * 11);

    const energy = 0.25 + 0.75 * globalActivity;
    this.keyLight.intensity = 1.65 * energy;
    this.rimLightA.intensity = 28 * energy;
    this.rimLightB.intensity = 24 * energy;
  }
}
