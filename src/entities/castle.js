/* =====================================================================
   Château Fort — Château (T2.3, version stylisée épurée)
   ---------------------------------------------------------------------
   Rôle : construire la base à défendre. Volontairement stylisé : lisible
   depuis la caméra plongeante, peu de polygones, silhouette forte.

   Composition :
     - un donjon central carré crénelé,
     - quatre tours d'angle cylindriques à toit conique,
     - une porte/herse en bois fortifié texturé sur la face avant,
     - deux bannières animées par shader (ondulation au vent),
     - des torches à flamme émissive et lumière vacillante,
     - un état visuel dégradé selon les PV (assombrissement + fumée).

   Le module expose :
     - build(scene, opts) -> objet château,
     - l'objet a une méthode update(dt) (torches, bannières, fumée) et
       setDamage(ratio in [0..1]) où 1 = intact, 0 = détruit.

   Textures utilisées : stone (murs), wood (porte). Chargées via materials.js.
   ===================================================================== */

import * as THREE from 'three';
import { makePBRMaterial, ensureAOUV } from '../render/materials.js';

/* Palette d'appoint (éléments non texturés : toits, flammes, bannières). */
const COL = {
  roof:   0x6e2f2f,   // tuile rouge sombre
  roofDk: 0x4f2020,
  banner: 0xc9a24b,   // or
  flame:  0xff7a2a,
  flameCore: 0xffd27a,
  smoke:  0x2a2a2a,
};

/* --------------------------------------------------------------------
   Shader de bannière : ondulation sinusoïdale au vent, appliquée au
   déplacement horizontal des sommets selon leur hauteur et le temps.
   -------------------------------------------------------------------- */
function makeBannerMaterial(color) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime:  { value: 0 },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec2 vUv;
      varying float vShade;
      void main() {
        vUv = uv;
        vec3 p = position;
        // Ondulation : amplitude croissante vers le bas libre de la bannière.
        float wave = sin(p.y * 3.0 + uTime * 4.0) * 0.12 * (0.5 - uv.y);
        p.x += wave;
        p.z += wave * 0.4;
        vShade = 0.75 + wave * 1.2; // léger ombrage suivant l'ondulation
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vShade;
      void main() {
        // Chevron décoratif sombre au centre de la bannière.
        float chevron = step(abs(vUv.x - 0.5), 0.18) * step(vUv.y, 0.7);
        vec3 col = mix(uColor, uColor * 0.55, chevron);
        gl_FragColor = vec4(col * vShade, 1.0);
      }`,
  });
}

/* --------------------------------------------------------------------
   Fabrique une tour d'angle cylindrique crénelée à toit conique.
   -------------------------------------------------------------------- */
function makeTower(stoneMat, radius, height) {
  const g = new THREE.Group();

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.12, height, 12),
    stoneMat
  );
  ensureAOUV(shaft.geometry);
  shaft.position.y = height / 2;
  shaft.castShadow = shaft.receiveShadow = true;
  g.add(shaft);

  // Anneau de créneaux (petits blocs répartis en cercle au sommet).
  const merlonCount = 8;
  for (let i = 0; i < merlonCount; i++) {
    const a = (i / merlonCount) * Math.PI * 2;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.7, 0.5),
      stoneMat
    );
    ensureAOUV(m.geometry);
    m.position.set(Math.cos(a) * radius, height + 0.35, Math.sin(a) * radius);
    m.castShadow = true;
    g.add(m);
  }

  // Toit conique.
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 1.25, height * 0.55, 12),
    new THREE.MeshStandardMaterial({ color: COL.roof, roughness: 0.8 })
  );
  roof.position.y = height + 0.7 + height * 0.275;
  roof.castShadow = true;
  g.add(roof);

  return g;
}

/* --------------------------------------------------------------------
   Fabrique une torche : poteau, coupe, flamme émissive, lumière.
   Renvoie { group, flame, light } pour animation.
   -------------------------------------------------------------------- */
function makeTorch() {
  const group = new THREE.Group();

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 })
  );
  pole.position.y = 0.55;
  group.add(pole);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.5, 8),
    new THREE.MeshStandardMaterial({
      color: COL.flame, emissive: COL.flame, emissiveIntensity: 2.5,
    })
  );
  flame.position.y = 1.25;
  group.add(flame);

  const light = new THREE.PointLight(COL.flame, 2.2, 6, 2);
  light.position.y = 1.3;
  group.add(light);

  return { group, flame, light };
}

/* --------------------------------------------------------------------
   Construction du château complet.
   @param {THREE.Scene} scene
   @param {object} [opts]
   @param {THREE.Vector3|{x,y,z}} [opts.position]
   @param {number} [opts.facing=0]  rotation Y (orienter la porte vers le chemin)
   @returns objet château avec update()/setDamage()
   -------------------------------------------------------------------- */
export function buildCastle(scene, { position = { x: 0, y: 0, z: 0 }, facing = 0 } = {}) {
  const root = new THREE.Group();
  root.position.set(position.x, position.y, position.z);
  root.rotation.y = facing;
  scene.add(root);

  // Matériaux texturés.
  const stoneMat = makePBRMaterial('stone', { repeat: 2, ext: 'png' });
  const woodMat  = makePBRMaterial('wood',  { repeat: 1, ext: 'jpg', hasMetallic: true });

  const torches = [];
  const banners = [];
  const damageBits = []; // matériaux à assombrir quand ça prend des dégâts
  let smoke = null;

  /* ---- Donjon central ---- */
  const keepSize = 7, keepHeight = 7;
  const keep = new THREE.Mesh(
    new THREE.BoxGeometry(keepSize, keepHeight, keepSize),
    stoneMat
  );
  ensureAOUV(keep.geometry);
  keep.position.y = keepHeight / 2;
  keep.castShadow = keep.receiveShadow = true;
  root.add(keep);

  // Créneaux du donjon (rangée sur le pourtour supérieur).
  const step = 1.2;
  const half = keepSize / 2;
  for (let x = -half; x <= half; x += step) {
    for (const z of [-half, half]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.5), stoneMat);
      ensureAOUV(m.geometry);
      m.position.set(x, keepHeight + 0.4, z);
      m.castShadow = true;
      root.add(m);
    }
  }
  for (let z = -half; z <= half; z += step) {
    for (const x of [-half, half]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.7), stoneMat);
      ensureAOUV(m.geometry);
      m.position.set(x, keepHeight + 0.4, z);
      m.castShadow = true;
      root.add(m);
    }
  }

  /* ---- Tours d'angle ---- */
  const towerH = 9, towerR = 1.5;
  const corners = [[-half, -half], [half, -half], [-half, half], [half, half]];
  for (const [cx, cz] of corners) {
    const t = makeTower(stoneMat, towerR, towerH);
    t.position.set(cx, 0, cz);
    root.add(t);
  }

  /* ---- Porte / herse en bois (face avant = +z après rotation) ---- */
  const gate = new THREE.Mesh(
    new THREE.BoxGeometry(3, 4, 0.4),
    woodMat
  );
  ensureAOUV(gate.geometry);
  gate.position.set(0, 2, half + 0.05);
  gate.castShadow = true;
  root.add(gate);
  // Encadrement de pierre autour de la porte (arche simplifiée).
  const archTop = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.6, 0.6), stoneMat);
  ensureAOUV(archTop.geometry);
  archTop.position.set(0, 4.2, half + 0.05);
  root.add(archTop);

  /* ---- Bannières animées de part et d'autre de la porte ---- */
  for (const bx of [-2.4, 2.4]) {
    const bannerMat = makeBannerMaterial(COL.banner);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2, 6, 10), bannerMat);
    banner.position.set(bx, 3.2, half + 0.15);
    root.add(banner);
    banners.push(bannerMat);
  }

  /* ---- Torches sur la façade ---- */
  for (const tx of [-2.4, 2.4]) {
    const torch = makeTorch();
    torch.group.position.set(tx, 3.4, half + 0.4);
    root.add(torch.group);
    torches.push(torch);
  }

  /* ---- Fumée de dégâts (cachée quand intact) ---- */
  // Un petit système de sprites simples au sommet du donjon, révélé quand
  // les PV sont bas. Léger : quelques plans semi-transparents.
  const smokeGroup = new THREE.Group();
  smokeGroup.position.set(0, keepHeight + 1, 0);
  smokeGroup.visible = false;
  const smokePuffs = [];
  for (let i = 0; i < 5; i++) {
    const puff = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        color: COL.smoke, transparent: true, opacity: 0.0, depthWrite: false,
      })
    );
    puff.position.set((Math.random() - 0.5) * 2, i * 0.8, (Math.random() - 0.5) * 2);
    smokeGroup.add(puff);
    smokePuffs.push({ mesh: puff, phase: Math.random() * Math.PI * 2, baseY: i * 0.8 });
  }
  root.add(smokeGroup);
  smoke = { group: smokeGroup, puffs: smokePuffs, intensity: 0 };

  /* ---- État interne de dégâts ---- */
  let damageRatio = 1; // 1 = intact

  /* ---- API publique ---- */
  const api = {
    root,

    /** Anime torches (vacillement), bannières (vent), fumée. */
    update(dt, elapsed) {
      // Torches : intensité et échelle de flamme légèrement aléatoires.
      for (const t of torches) {
        const flicker = 2.0 + Math.sin(elapsed * 12 + t.group.position.x) * 0.4
                            + (Math.random() - 0.5) * 0.3;
        t.light.intensity = flicker;
        t.flame.scale.y = 1 + Math.sin(elapsed * 18 + t.group.position.x) * 0.15;
      }
      // Bannières : avancer le temps du shader.
      for (const b of banners) b.uniforms.uTime.value = elapsed;

      // Fumée : monte et s'estompe si des dégâts sont présents.
      if (smoke.intensity > 0) {
        smoke.group.visible = true;
        for (const p of smoke.puffs) {
          p.phase += dt * 0.6;
          const t = (p.phase % (Math.PI * 2)) / (Math.PI * 2);
          p.mesh.position.y = p.baseY + t * 3;
          p.mesh.material.opacity = smoke.intensity * 0.4 * (1 - t);
          p.mesh.scale.setScalar(1 + t * 1.5);
          p.mesh.lookAt(p.mesh.position.x + 0, 100, p.mesh.position.z + 0.01);
        }
      } else {
        smoke.group.visible = false;
      }
    },

    /**
     * Applique un état de dégâts. ratio 1 = intact, 0 = ruine.
     * Assombrit la pierre et fait apparaître la fumée quand ça baisse.
     */
    setDamage(ratio) {
      damageRatio = THREE.MathUtils.clamp(ratio, 0, 1);
      // Assombrissement progressif de la pierre (suie).
      const dark = 0.5 + 0.5 * damageRatio; // 1 = clair, 0.5 = sombre
      stoneMat.color.setScalar(dark);
      // Fumée d'autant plus intense que les dégâts sont élevés.
      smoke.intensity = 1 - damageRatio;
    },

    /** Nettoyage. */
    dispose() {
      scene.remove(root);
    },
  };

  return api;
}
