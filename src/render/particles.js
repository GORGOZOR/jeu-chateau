/* =====================================================================
   Château Fort — Système de particules  (T2.6)
   ---------------------------------------------------------------------
   Rôle : afficher des centaines de particules (feu, fumée, étincelles,
   givre, explosions…) à moindre coût. C'est l'infrastructure des effets
   visuels du jeu : torches et bûcher, impacts de projectiles, morts
   d'ennemis, effets de tours (T2.7).

   Principes de performance :
     - Un émetteur = UN objet THREE.Points = UN draw call, quel que soit
       le nombre de particules (des centaines rendues d'un coup).
     - Les buffers (position, couleur, taille, vie) sont PRÉ-ALLOUÉS à la
       taille max. On ne crée jamais d'objet pendant le jeu : les
       particules mortes sont recyclées sur place (pooling implicite).
     - Un ShaderMaterial custom permet couleur + taille PAR particule,
       avec atténuation avec la distance et fondu en fin de vie.

   Un émetteur est paramétrable : taux d'émission, durée de vie, vitesse
   initiale (+ dispersion), gravité, couleurs de début/fin, taille de
   début/fin. Des presets (feu, fumée, étincelles…) sont fournis.

   API :
     const ps = createParticleSystem(scene);
     const fire = ps.createEmitter({ ...preset, position });
     fire.burst(30);        // émission ponctuelle (explosion, impact)
     fire.setActive(true);  // émission continue (torche, feu)
     ps.update(dt);         // dans la boucle
   ===================================================================== */

import * as THREE from 'three';

/* Shader : rend chaque particule comme un point coloré qui grossit/rétrécit
   et s'estompe selon sa vie. `size` est en pixels, atténué par la distance. */
const particleVertex = /* glsl */`
  attribute float aSize;
  attribute vec4 aColor;   // rgb + alpha
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Atténuation avec la distance (particules lointaines plus petites).
    gl_PointSize = aSize * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFragment = /* glsl */`
  varying vec4 vColor;
  void main() {
    // Point circulaire doux (dégradé radial), pas un carré.
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.1, d);
    gl_FragColor = vec4(vColor.rgb, vColor.a * soft);
  }
`;

/**
 * Crée le système de particules (conteneur de tous les émetteurs).
 * @param {THREE.Scene} scene
 */
export function createParticleSystem(scene) {
  const emitters = [];

  /**
   * Crée un émetteur.
   * @param {object} opts
   * @param {number}  [opts.max=300]        capacité max de particules
   * @param {number}  [opts.rate=60]        particules/seconde (émission continue)
   * @param {THREE.Vector3} [opts.position]
   * @param {number}  [opts.life=1.2]       durée de vie (s)
   * @param {number}  [opts.lifeVar=0.4]    variation de durée de vie
   * @param {THREE.Vector3} [opts.velocity] vitesse initiale moyenne
   * @param {number}  [opts.spread=1]       dispersion de la vitesse
   * @param {THREE.Vector3} [opts.gravity]  accélération (ex. -9.8 en y)
   * @param {THREE.Color} [opts.colorStart]
   * @param {THREE.Color} [opts.colorEnd]
   * @param {number}  [opts.sizeStart=8]
   * @param {number}  [opts.sizeEnd=2]
   * @param {number}  [opts.blending]       THREE.AdditiveBlending (feu) ou Normal (fumée)
   * @param {boolean} [opts.active=false]   émission continue dès la création
   */
  function createEmitter(opts = {}) {
    const max = opts.max ?? 300;
    const cfg = {
      rate: opts.rate ?? 60,
      life: opts.life ?? 1.2,
      lifeVar: opts.lifeVar ?? 0.4,
      position: opts.position ? opts.position.clone() : new THREE.Vector3(),
      velocity: opts.velocity ? opts.velocity.clone() : new THREE.Vector3(0, 2, 0),
      spread: opts.spread ?? 1,
      gravity: opts.gravity ? opts.gravity.clone() : new THREE.Vector3(0, 0, 0),
      colorStart: (opts.colorStart ?? new THREE.Color(0xffaa33)).clone(),
      colorEnd: (opts.colorEnd ?? new THREE.Color(0x662200)).clone(),
      sizeStart: opts.sizeStart ?? 8,
      sizeEnd: opts.sizeEnd ?? 2,
    };

    // Buffers pré-alloués (jamais réalloués → pas de GC en jeu).
    const positions = new Float32Array(max * 3);
    const colors = new Float32Array(max * 4);
    const sizes = new Float32Array(max);
    // État CPU de chaque particule (pooling : `age < 0` = morte/libre).
    const vel = new Float32Array(max * 3);
    const age = new Float32Array(max).fill(-1); // -1 = libre
    const lifespan = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 4));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setDrawRange(0, max);

    const material = new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false, // les particules ne masquent pas ce qui est derrière
      blending: opts.blending ?? THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, material);
    points.frustumCulled = false; // les particules bougent hors de la bbox initiale
    scene.add(points);

    let active = opts.active ?? false;
    let emitAccumulator = 0;

    // Trouve une particule libre (pooling). Renvoie -1 si le pool est plein.
    function findFree() {
      for (let i = 0; i < max; i++) if (age[i] < 0) return i;
      return -1;
    }

    // Fait naître une particule à l'index i.
    function spawn(i) {
      age[i] = 0;
      lifespan[i] = Math.max(0.05, cfg.life + (Math.random() - 0.5) * 2 * cfg.lifeVar);
      // position initiale = position de l'émetteur (petite dispersion)
      positions[i * 3 + 0] = cfg.position.x + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 1] = cfg.position.y + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 2] = cfg.position.z + (Math.random() - 0.5) * 0.3;
      // vitesse = moyenne + dispersion aléatoire
      vel[i * 3 + 0] = cfg.velocity.x + (Math.random() - 0.5) * cfg.spread;
      vel[i * 3 + 1] = cfg.velocity.y + (Math.random() - 0.5) * cfg.spread;
      vel[i * 3 + 2] = cfg.velocity.z + (Math.random() - 0.5) * cfg.spread;
    }

    const emitter = {
      points,
      get active() { return active; },
      setActive(v) { active = v; },
      setPosition(x, y, z) { cfg.position.set(x, y, z); },

      /** Émission ponctuelle de `n` particules (impact, explosion). */
      burst(n) {
        for (let k = 0; k < n; k++) {
          const i = findFree();
          if (i < 0) break;
          spawn(i);
        }
      },

      /** Avance toutes les particules de `dt` secondes. */
      update(dt) {
        // Émission continue si actif.
        if (active) {
          emitAccumulator += cfg.rate * dt;
          while (emitAccumulator >= 1) {
            const i = findFree();
            if (i >= 0) spawn(i);
            emitAccumulator -= 1;
          }
        }
        // Mise à jour physique + apparence.
        for (let i = 0; i < max; i++) {
          if (age[i] < 0) { sizes[i] = 0; continue; } // libre → invisible
          age[i] += dt;
          const t = age[i] / lifespan[i];
          if (t >= 1) { age[i] = -1; sizes[i] = 0; continue; } // morte → recyclable

          // Intégration vitesse + gravité.
          vel[i * 3 + 0] += cfg.gravity.x * dt;
          vel[i * 3 + 1] += cfg.gravity.y * dt;
          vel[i * 3 + 2] += cfg.gravity.z * dt;
          positions[i * 3 + 0] += vel[i * 3 + 0] * dt;
          positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
          positions[i * 3 + 2] += vel[i * 3 + 2] * dt;

          // Couleur interpolée début→fin, alpha qui s'estompe en fin de vie.
          const r = cfg.colorStart.r + (cfg.colorEnd.r - cfg.colorStart.r) * t;
          const g = cfg.colorStart.g + (cfg.colorEnd.g - cfg.colorStart.g) * t;
          const b = cfg.colorStart.b + (cfg.colorEnd.b - cfg.colorStart.b) * t;
          const a = 1 - t * t; // fondu quadratique en fin de vie
          colors[i * 4 + 0] = r;
          colors[i * 4 + 1] = g;
          colors[i * 4 + 2] = b;
          colors[i * 4 + 3] = a;
          // Taille interpolée.
          sizes[i] = cfg.sizeStart + (cfg.sizeEnd - cfg.sizeStart) * t;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aColor.needsUpdate = true;
        geo.attributes.aSize.needsUpdate = true;
      },

      dispose() {
        scene.remove(points);
        geo.dispose();
        material.dispose();
        const idx = emitters.indexOf(emitter);
        if (idx >= 0) emitters.splice(idx, 1);
      },
    };

    emitters.push(emitter);
    return emitter;
  }

  return {
    createEmitter,
    /** Met à jour tous les émetteurs. À appeler dans la boucle de rendu. */
    update(dt) {
      for (const e of emitters) e.update(dt);
    },
    get emitterCount() { return emitters.length; },
    dispose() {
      for (const e of [...emitters]) e.dispose();
    },
  };
}

/* --------------------------------------------------------------------
   Presets d'émetteurs (paramètres prêts à l'emploi).
   -------------------------------------------------------------------- */
export const ParticlePresets = {
  // Feu : monte, orange vif → rouge sombre, additif (lumineux).
  fire: {
    max: 120, rate: 70, life: 0.9, lifeVar: 0.3,
    velocity: new THREE.Vector3(0, 2.4, 0), spread: 1.1,
    gravity: new THREE.Vector3(0, 1.2, 0), // léger tirage vers le haut (chaleur)
    colorStart: new THREE.Color(0xffd27a), colorEnd: new THREE.Color(0xcc3300),
    sizeStart: 10, sizeEnd: 2, blending: THREE.AdditiveBlending,
  },
  // Fumée : monte lentement, grise, grandit, fondu normal (pas additif).
  smoke: {
    max: 80, rate: 24, life: 2.4, lifeVar: 0.6,
    velocity: new THREE.Vector3(0, 1.0, 0), spread: 0.5,
    gravity: new THREE.Vector3(0, 0.3, 0),
    colorStart: new THREE.Color(0x555555), colorEnd: new THREE.Color(0x222222),
    sizeStart: 6, sizeEnd: 22, blending: THREE.NormalBlending,
  },
  // Étincelles : explose dans toutes les directions, jaune, retombe (gravité).
  sparks: {
    max: 60, rate: 0, life: 0.6, lifeVar: 0.2,
    velocity: new THREE.Vector3(0, 3, 0), spread: 6,
    gravity: new THREE.Vector3(0, -12, 0),
    colorStart: new THREE.Color(0xfff0a0), colorEnd: new THREE.Color(0xff6600),
    sizeStart: 5, sizeEnd: 1, blending: THREE.AdditiveBlending,
  },
  // Givre : particules bleutées qui tombent doucement.
  frost: {
    max: 100, rate: 50, life: 1.4, lifeVar: 0.4,
    velocity: new THREE.Vector3(0, -1, 0), spread: 2,
    gravity: new THREE.Vector3(0, -1.5, 0),
    colorStart: new THREE.Color(0xcceeff), colorEnd: new THREE.Color(0x66aacc),
    sizeStart: 6, sizeEnd: 2, blending: THREE.AdditiveBlending,
  },
};
