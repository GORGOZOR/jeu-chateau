/* =====================================================================
   Château Fort — point d'entrée applicatif (T1.1)
   ---------------------------------------------------------------------
   Périmètre strict de la tâche T1.1 :
     - détecter le support WebGL,
     - initialiser Three.js (scène, caméra, renderer),
     - afficher un sol vide avec un éclairage minimal,
     - gérer le redimensionnement de la fenêtre,
     - lancer une boucle de rendu.

   Ce qui NE fait PAS partie de T1.1 (viendra plus tard) :
     - l'état de jeu (T1.2), le bus d'événements (T1.3),
     - la boucle à pas de temps fixe (T1.4),
     - tours, ennemis, gameplay, HUD.
   ===================================================================== */

import * as THREE from 'three';
import * as GameState from './core/state.js';
import * as Events from './core/events.js';
import { createLoop } from './core/loop.js';
import { createPool } from './core/pool.js';
import { setupCameraZoom } from './core/controls.js';
import { setupSky } from './render/sky.js';
import { createLoadingScreen } from './ui/loading-screen.js';
import { setupLighting } from './render/lighting.js';
import { createPostProcess } from './render/postprocess.js';
import { loadMap } from './data/map-loader.js';
import { plaine } from './data/maps/plaine.js';
import { createTower } from './entities/tower.js';
import { TOWER_TYPES } from './data/towers.js';
import { openSpecializationUI } from './ui/specialization-ui.js';
import { createTestDummy } from './entities/test-dummy.js';
import { getSpecializations } from './data/towers.js';
import { createEnemy } from './entities/enemy.js';
import { ENEMY_IDS, ENEMY_TYPES, makeEnemyConfig } from './data/enemies.js';
import { enemyResistanceInfo } from './data/damage.js';
import { createWaveManager } from './core/wave-manager.js';
import { createEconomy } from './systems/economy.js';
import { createSpellSystem, SPELLS } from './systems/spells.js';
import { createSpellBar } from './ui/spell-bar.js';
import { buildTowerTooltipData, createTooltip } from './ui/tooltips.js';
import { TARGET_MODES, TARGET_MODE_IDS } from './systems/targeting.js';
import { createSettingsMenu } from './ui/settings-menu.js';
import { createBuildMenu } from './ui/build-menu.js';
import { createHud } from './ui/hud.js';
import { createAudio } from './systems/audio.js';
import { createDebugOverlay } from './ui/debug-overlay.js';
import { preloadModel, updateMixers, createModelInstance, hasModel } from './assets/modelLoader.js';
import { sellValue } from './data/towers.js';
import { createParticleSystem, ParticlePresets } from './render/particles.js';
import { createProjectileSystem } from './entities/projectile.js';

/* --------------------------------------------------------------------
   1. Détection WebGL
   Si le contexte n'est pas disponible, on affiche le message d'erreur
   prévu dans index.html et on arrête là.
   -------------------------------------------------------------------- */
function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch (e) {
    return false;
  }
}

if (!isWebGLAvailable()) {
  document.getElementById('webgl-error').classList.remove('hidden');
  document.getElementById('scene').classList.add('hidden');
  throw new Error('WebGL indisponible — initialisation interrompue.');
}

/* --------------------------------------------------------------------
   2. Renderer
   Rattaché au <canvas id="scene"> déjà présent dans le DOM.
   On tient compte du devicePixelRatio (plafonné à 2 pour la perf).
   -------------------------------------------------------------------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Encodage de sortie moderne pour des couleurs correctes.
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Tone mapping cinématographique : indispensable avec une source HDRI,
// sinon les hautes lumières du ciel sont surexposées (tout blanc).
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

/* --------------------------------------------------------------------
   3. Scène
   Le fond (ciel HDRI) et le brouillard sont posés par les modules
   render/sky.js et render/lighting.js (T2.1), plus bas.
   -------------------------------------------------------------------- */
const scene = new THREE.Scene();

/* --------------------------------------------------------------------
   4. Caméra
   Vue de trois-quarts plongeante, typique d'un tower defense.
   -------------------------------------------------------------------- */
const camera = new THREE.PerspectiveCamera(
  50,                                   // champ de vision
  window.innerWidth / window.innerHeight,
  0.1,                                  // near
  300                                   // far
);
camera.position.set(0, 31, 46);
camera.lookAt(0, 0, 0);

/* --------------------------------------------------------------------
   4bis. Contrôle caméra : zoom molette sur arc court (T1.8)
   La molette avance/recule la vue le long d'une courte trajectoire courbe,
   avec amortissement et bornes (jamais sous le terrain).
   -------------------------------------------------------------------- */
const cameraZoom = setupCameraZoom(camera, canvas, {
  target: new THREE.Vector3(0, 0, 0), // centre de la scène (le château est juste derrière)
});

/* --------------------------------------------------------------------
   5. Éclairage et ciel crépusculaires (T2.1)
   L'éclairage (soleil rasant, ambiance ciel/sol, ombres, brouillard) et
   le ciel HDRI sont maintenant gérés par des modules dédiés.
   -------------------------------------------------------------------- */
const lighting = setupLighting(scene);

// Écran de chargement (T5.2) : affiché pendant le préchargement des assets
// (ciel + modèles glTF). trackAsset() enregistre chaque tâche et fait
// avancer la barre ; la boucle ne démarre qu'une fois tout résolu (bas du
// fichier). preloadModel/setupSky ne rejettent jamais → Promise.all résout
// toujours (échec = fallback).
const loadingScreen = createLoadingScreen();
const assetTasks = [];
let assetTotal = 0, assetDone = 0;
function trackAsset(promise, name) {
  assetTotal++;
  const p = Promise.resolve(promise).then((r) => {
    assetDone++;
    loadingScreen.setProgress(assetDone, assetTotal, name);
    return r;
  });
  assetTasks.push(p);
  return p;
}

// Le ciel se charge de façon asynchrone (HDRI). En cas d'échec, un dégradé
// procédural prend le relais.
trackAsset(setupSky(scene, renderer).then((result) => {
  console.log('[Château Fort] T2.1 — ciel prêt (mode ' + result.mode + ').');
  return result;
}), 'Ciel');

/* --------------------------------------------------------------------
   6. Chargement de la carte (T3.1)
   Toute la scène de jeu (terrain, château, eau, socles de tours) est
   construite à partir du SCHÉMA de carte 'plaine' par le chargeur. Changer
   une valeur dans data/maps/plaine.js modifie la carte sans toucher ici.
   -------------------------------------------------------------------- */
const map = loadMap(scene, plaine, { quality: 'high' });
const environment = map.environment;
const castle = map.castle;
const water = map.water;
console.log('[Château Fort] T3.1 — carte « ' + plaine.name + ' » chargée : '
  + environment.stats.pines + ' arbres, '
  + water.waters.length + ' surfaces d\'eau, '
  + map.towerSlots.slots.length + ' socles de tours.');

/* --------------------------------------------------------------------
   6ter. Système de particules (T2.6)
   Feu au sommet des torches de la façade du château. Le système est
   générique : il servira aux impacts, explosions, effets de tours (T2.7).
   -------------------------------------------------------------------- */
const particles = createParticleSystem(scene);
// Torches du château : positions monde ≈ façade (z de la porte), hauteur ~4.7.
for (const tx of [-2.4, 2.4]) {
  particles.createEmitter({
    ...ParticlePresets.fire,
    position: new THREE.Vector3(tx, 4.7, -2.1),
    active: true,
  });
}
console.log('[Château Fort] T2.6 — particules : ' + particles.emitterCount
  + ' émetteurs de feu (torches).');

// Émetteur "bouffée" réutilisable (T1.7) pour la mort d'un ennemi et la pose
// d'une tour. Un seul émetteur (pas d'allocation par événement) : on le
// repositionne puis on émet. Couleur fixe (poussière claire), fondu normal.
const puffEmitter = particles.createEmitter({
  max: 80, rate: 0, active: false,
  life: 0.5, lifeVar: 0.15,
  velocity: new THREE.Vector3(0, 1.8, 0), spread: 2.4,
  gravity: new THREE.Vector3(0, -3.5, 0),
  colorStart: new THREE.Color(0xe8dcc8), colorEnd: new THREE.Color(0x9a8a72),
  sizeStart: 11, sizeEnd: 2,
  blending: THREE.NormalBlending,
});
function puff(x, y, z, n = 14) {
  puffEmitter.setPosition(x, y, z);
  puffEmitter.burst(n);
}

/* --------------------------------------------------------------------
   Effets de tir (T2.7) : projectiles qui volent de la tour vers la cible
   (flèche, carreau, boule de feu, éclat de glace) + impacts en particules.
   -------------------------------------------------------------------- */
const projectiles = createProjectileSystem(scene, particles);

// Helper : crée une tour reliée au système de projectiles. Le tir part du
// sommet de la tour vers la cible, avec le bon type de projectile.
// Hauteur de départ du projectile selon la tour :
//  - archers / mage tirent depuis le haut (archer sur la plateforme, mains du mage)
//  - baliste / igloo tirent depuis le centre de la tour (plus bas)
const MUZZLE_HEIGHT = { archers: 3.2, bucher: 3.4, baliste: 1.0, glace: 1.0 };

function spawnTower(typeId, pos) {
  const tower = createTower(scene, typeId, pos, {
    animateIn: true,   // croissance à la pose (T1.7)
    onFire: ({ target, type }) => {
      audio.playShoot(typeId);   // son de tir (T5.3), timbre selon le type
      const muzzleY = MUZZLE_HEIGHT[typeId] ?? 2.0;
      const from = { x: pos.x, y: pos.y + muzzleY, z: pos.z };
      const projType = type || 'arrow';
      projectiles.fire(projType, from, target);
    },
  });
  // Feu du bûcher (tour de mage) : flamme continue au sommet. Rattachée à la
  // tour pour être retirée à la vente. Version un peu plus contenue que les
  // torches du château.
  if (typeId === 'bucher') {
    tower._fireEmitter = particles.createEmitter({
      max: 50, rate: 28, life: 0.7, lifeVar: 0.25,
      position: new THREE.Vector3(pos.x, pos.y + 3.0, pos.z),
      velocity: new THREE.Vector3(0, 1.4, 0), spread: 0.7,
      gravity: new THREE.Vector3(0, 0.7, 0),
      colorStart: new THREE.Color(0xffd27a), colorEnd: new THREE.Color(0xcc3300),
      sizeStart: 4, sizeEnd: 1, blending: THREE.AdditiveBlending,
      active: true,
    });
  }
  return tower;
}

/* --------------------------------------------------------------------
   6quater. Tours — construites par le joueur
   Plus de tours de démonstration : on construit au CLIC sur un socle
   libre (menu de construction), et on gère au clic sur une tour
   (améliorer / spécialiser / ciblage / vendre). L'or de départ (160)
   permet de poser les premières défenses.
   -------------------------------------------------------------------- */
const towers = [];

/* --------------------------------------------------------------------
   7ter. Ennemis (T3.7)
   Les ennemis apparaissent au départ du chemin, le suivent jusqu'au
   château. Les tours leur tirent dessus. Un ennemi tué rapporte de l'or ;
   un ennemi atteignant le château retire des PV au château.
   -------------------------------------------------------------------- */
const enemies = [];

function spawnEnemy(typeId, elite = false, mods = {}) {
  const cfg = makeEnemyConfig(typeId, elite, mods);
  const enemy = createEnemy(scene, cfg, map.path, {
    onDeath: (e, gold) => {
      GameState.registerKill(gold);           // ajoute l'or + compte le kill
      audio.playDeath();                       // son de mort (T5.3)
      puff(e.position.x, e.flying ? 3.5 : 0.7, e.position.z, 14); // bouffée (T1.7)
      const idx = enemies.indexOf(e);
      if (idx >= 0) enemies.splice(idx, 1);
    },
    onReachCastle: (e, dmg) => {
      GameState.damageCastle(dmg);             // retire des PV au château
      const ratio = GameState.get.hp() / GameState.get.maxHp();
      castle.setDamage(1 - ratio);             // feedback visuel
      const idx = enemies.indexOf(e);
      if (idx >= 0) enemies.splice(idx, 1);
    },
    // Invocation (T4.3) : le nécromancien fait apparaître des renforts qui
    // rejoignent le chemin à sa hauteur de progression.
    onSummon: (summoner, type, count, atDist) => {
      for (let i = 0; i < count; i++) {
        const minion = spawnEnemy(type, false, mods);
        // place le sbire à la progression de l'invocateur (un poil derrière).
        if (minion.setProgress) minion.setProgress(Math.max(0, atDist - 0.5 - i * 0.3));
      }
    },
  });
  enemies.push(enemy);
  return enemy;
}

// Met à jour tous les ennemis + fait tirer les tours dessus (appelé en boucle).
function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.update(dt, enemies, camera);
  }
  // Aura de désactivation (T4.3+) : chaque élite portant l'aura 'disable'
  // neutralise la tour la plus proche tant qu'elle est à portée.
  const toDisable = new Set();
  for (const e of enemies) {
    if (!e.alive || e.aura !== 'disable') continue;
    let nearest = null, nd = e.auraRadius * e.auraRadius;
    for (const t of towers) {
      const dx = t.position.x - e.position.x, dz = t.position.z - e.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= nd) { nd = d2; nearest = t; }
    }
    if (nearest) toDisable.add(nearest);
  }
  for (const t of towers) t.setDisabled(toDisable.has(t));

  // Toujours mettre à jour les tours, même sans ennemi : sinon l'animation
  // de pose/amélioration ne joue pas pendant l'entracte. Sans cible, elles
  // ne font que patienter (coût négligeable).
  for (const t of towers) t.update(dt, enemies);
}

/* --------------------------------------------------------------------
   7quater. Économie (T4.4) + Gestionnaire de vagues (T3.9)
   L'économie gère la récompense de fin de vague (prime + intérêts sur l'or
   épargné, 15% plafonné à 100). Le gestionnaire de vagues la lui délègue.
   -------------------------------------------------------------------- */
const economy = createEconomy(); // intérêts activés par défaut

const waveManager = createWaveManager({
  difficulty: 'normal',
  spawnEnemy,
  liveEnemyCount: () => enemies.length,
  economy,
  onWaveStart: (num, count) => {
    audio.playWaveStart();   // cor de début de vague (T5.3)
    console.log('[Vague ' + num + '/15] démarrée — ' + count + ' ennemis.');
  },
  onWaveEnd: (num, reward) => {
    const r = reward
      ? ' (+' + reward.bonus + ' prime, +' + reward.interest + ' intérêts)'
      : '';
    console.log('[Vague ' + num + '] repoussée ! Or : ' + GameState.get.gold()
      + r + '. Entracte 8s (ou __CF__.nextWave()).');
    if (num < 15) waveManager.scheduleNext(8);
  },
  onVictory: () => { console.log('[VICTOIRE] Les 15 vagues sont repoussées !'); hud.showEnd(true); audio.playEnd(true); },
  onDefeat: () => { console.log('[DÉFAITE] Le château est tombé.'); hud.showEnd(false); audio.playEnd(false); },
});

/* --------------------------------------------------------------------
   7quinquies. Sorts du seigneur (T4.1)
   Ressource de faveur + 3 sorts (pluie de flèches, gel, renfort), ciblés
   à la souris. Le feedback visuel utilise le système de particules.
   -------------------------------------------------------------------- */
// Flèches de sort qui tombent du ciel (animées), pour la pluie de flèches.
const _fallingArrows = [];
function spawnArrowRainVisual(pos, def) {
  const arrowGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 5);
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.7 });
  const n = 24;
  for (let i = 0; i < n; i++) {
    const a = new THREE.Mesh(arrowGeo, arrowMat);
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * def.radius;
    a.position.set(pos.x + Math.cos(ang) * rad, 12 + Math.random() * 4, pos.z + Math.sin(ang) * rad);
    a.rotation.x = Math.PI; // pointe vers le bas
    scene.add(a);
    _fallingArrows.push({ mesh: a, vy: -18 - Math.random() * 6, groundY: 0.1 });
  }
}
function updateFallingArrows(dt) {
  for (let i = _fallingArrows.length - 1; i >= 0; i--) {
    const fa = _fallingArrows[i];
    fa.mesh.position.y += fa.vy * dt;
    if (fa.mesh.position.y <= fa.groundY) {
      scene.remove(fa.mesh);
      _fallingArrows.splice(i, 1);
    }
  }
}

const spells = createSpellSystem({
  onEffect: (id, pos, def) => {
    if (id === 'arrowRain') {
      // Vraies flèches qui tombent du ciel dans la zone.
      spawnArrowRainVisual(pos, def);
      return;
    }
    // Gel : nappe de particules de givre qui monte doucement.
    const color = new THREE.Color(def.color);
    const e = particles.createEmitter({
      max: 90, rate: 0, life: 1.0, lifeVar: 0.4,
      position: new THREE.Vector3(pos.x, 0.3, pos.z),
      velocity: new THREE.Vector3(0, 1.5, 0),
      spread: def.radius * 2,
      gravity: new THREE.Vector3(0, -0.5, 0),
      colorStart: color, colorEnd: color.clone().multiplyScalar(0.4),
      sizeStart: 9, sizeEnd: 1,
      blending: THREE.AdditiveBlending,
    });
    e.burst(70);
    setTimeout(() => e.dispose(), 1600);
  },
  // Barricade visible : une palissade de pieux en cercle sur la zone.
  onRampartCreate: (pos, def) => {
    const group = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.85 });
    const n = 10;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const r = def.radius * 0.8;
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.4, 6), woodMat);
      stake.position.set(pos.x + Math.cos(ang) * r, 0.6, pos.z + Math.sin(ang) * r);
      stake.rotation.z = (Math.random() - 0.5) * 0.2;
      // pointe (cône) au sommet
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 6), woodMat);
      tip.position.y = 0.85;
      stake.add(tip);
      stake.castShadow = true;
      group.add(stake);
    }
    scene.add(group);
    return group; // stocké dans la barricade, retiré à l'expiration
  },
  onRampartExpire: (visual) => {
    if (visual) scene.remove(visual);
  },
});

// Ciblage souris : convertit un clic écran en position sur le terrain (y=0).
const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let _pendingSpell = null; // sort en attente de ciblage (clic suivant)

function screenToGround(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  _mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_mouse, camera);
  const hit = new THREE.Vector3();
  if (_raycaster.ray.intersectPlane(_groundPlane, hit)) return { x: hit.x, z: hit.z };
  return null;
}

renderer.domElement.addEventListener('click', (ev) => {
  // 1. Sort en cours de ciblage : prioritaire sur tout le reste.
  if (_pendingSpell) {
    if (GameState.get.paused()) {
      console.log('[Sort] Impossible pendant la pause tactique.');
      _pendingSpell = null;
      renderer.domElement.style.cursor = 'default';
      return;
    }
    const pos = screenToGround(ev.clientX, ev.clientY);
    if (pos) {
      const ok = spells.cast(_pendingSpell, pos, enemies);
      if (ok) audio.playSpell();   // son de sort (T5.3)
      console.log(ok ? '[Sort] ' + SPELLS[_pendingSpell].name + ' lancé.'
        : '[Sort] échec (faveur/cooldown).');
    }
    _pendingSpell = null;
    renderer.domElement.style.cursor = 'default';
    return;
  }

  // 2. Construction / gestion (fonctionne aussi en pause tactique).
  const pos = screenToGround(ev.clientX, ev.clientY);
  if (!pos) { buildMenu.hide(); hideRange(); return; }
  _lastClickX = ev.clientX; _lastClickY = ev.clientY;

  // 2a. Clic sur une tour existante → menu de gestion + cercle de portée.
  let bestT = null, bd = 2.5 * 2.5;
  for (const t of towers) {
    const dx = t.position.x - pos.x, dz = t.position.z - pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= bd) { bd = d2; bestT = t; }
  }
  if (bestT) {
    buildMenu.showManage(bestT, ev.clientX, ev.clientY);
    showRange(bestT);
    return;
  }

  // 2b. Clic sur un socle LIBRE → menu de construction.
  const slot = map.towerSlots.nearest(pos.x, pos.z, 2);
  if (slot && !slot.occupied) {
    buildMenu.showBuild(slot, ev.clientX, ev.clientY);
    hideRange();
    return;
  }

  // 2c. Clic dans le vide → tout refermer.
  buildMenu.hide();
  hideRange();
});

// Sélectionne un sort à lancer : le prochain clic sur le terrain le déclenche.
function selectSpell(id) {
  if (!SPELLS[id]) return;
  if (GameState.get.paused()) {
    console.log('[Sort] Impossible pendant la pause tactique (Espace pour reprendre).');
    return;
  }
  if (!spells.canCast(id)) {
    console.log('[Sort] ' + SPELLS[id].name + ' pas prêt (faveur/cooldown).');
    return;
  }
  _pendingSpell = id;
  renderer.domElement.style.cursor = 'crosshair';
  console.log('[Sort] ' + SPELLS[id].name + ' sélectionné — clique sur le terrain pour cibler.');
}

// Barre de sorts (UI) : cliquer un bouton sélectionne le sort.
const spellBar = createSpellBar({ spellSystem: spells, onSelect: selectSpell });

/* --------------------------------------------------------------------
   7sexies. Info-bulles comparatives + pause tactique (T4.5)
   - Survoler une tour affiche ses stats actuelles → niveau suivant.
   - Espace : pause tactique. Le temps est figé, mais on peut toujours
     zoomer, consulter les info-bulles, améliorer/spécialiser les tours
     et changer les modes de ciblage. Les sorts, eux, sont bloqués.
   -------------------------------------------------------------------- */
const towerTooltip = createTooltip();

renderer.domElement.addEventListener('mousemove', (ev) => {
  // pas d'info-bulle pendant le ciblage d'un sort (curseur occupé).
  if (_pendingSpell) { towerTooltip.hide(); return; }
  const pos = screenToGround(ev.clientX, ev.clientY);
  if (!pos) { towerTooltip.hide(); return; }
  // tour la plus proche du point survolé (rayon de prise 2.5).
  let best = null, bd = 2.5 * 2.5;
  for (const t of towers) {
    const dx = t.position.x - pos.x, dz = t.position.z - pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= bd) { bd = d2; best = t; }
  }
  if (best) towerTooltip.show(buildTowerTooltipData(best), ev.clientX, ev.clientY);
  else towerTooltip.hide();

  // surbrillance du socle LIBRE le plus proche (invitation à construire).
  const hoverSlot = map.towerSlots.nearest(pos.x, pos.z, 2);
  const idx = (hoverSlot && !hoverSlot.occupied) ? hoverSlot.index : -1;
  if (idx !== _hoverSlotIdx) {
    if (_hoverSlotIdx >= 0) map.towerSlots.setHighlight(_hoverSlotIdx, false);
    if (idx >= 0) map.towerSlots.setHighlight(idx, true);
    _hoverSlotIdx = idx;
  }
});
let _hoverSlotIdx = -1;

// La souris quitte le canvas (passe sur un menu) : on masque l'info-bulle.
renderer.domElement.addEventListener('mouseleave', () => towerTooltip.hide());

// Indicateur de pause tactique.
const pauseBadge = document.createElement('div');
pauseBadge.style.cssText = [
  'position:fixed', 'top:14px', 'left:50%', 'transform:translateX(-50%)',
  'z-index:900', 'display:none', 'padding:7px 16px',
  'background:rgba(12,20,28,.92)', 'color:#ffd700',
  'border:1px solid #ffd700', 'border-radius:8px',
  'font-family:system-ui,sans-serif', 'font-size:13px', 'font-weight:600',
].join(';');
pauseBadge.textContent = '⏸ PAUSE TACTIQUE — améliorations et ciblage possibles (Espace pour reprendre)';
document.body.appendChild(pauseBadge);

window.addEventListener('keydown', (ev) => {
  if (ev.code !== 'Space') return;
  ev.preventDefault(); // évite le défilement de la page
  const paused = GameState.togglePaused();
  pauseBadge.style.display = paused ? 'block' : 'none';
  console.log(paused ? '[Pause] Pause tactique — Espace pour reprendre.'
    : '[Pause] Reprise.');
});

// Menu de réglages (⚙ en haut à droite) : luminosité + orientation caméra.
// Audio (T5.3) : sons synthétisés (aucun fichier). Le contexte audio ne peut
// démarrer qu'après une interaction : on le déverrouille au 1er clic/touche,
// puis on lance la musique d'ambiance. Déclaré ici (avant le menu de réglages
// qui lit audio.volumes).
const audio = createAudio();
function unlockAudioOnce() {
  audio.unlock();
  audio.startMusic();
  window.removeEventListener('pointerdown', unlockAudioOnce);
  window.removeEventListener('keydown', unlockAudioOnce);
}
window.addEventListener('pointerdown', unlockAudioOnce);
window.addEventListener('keydown', unlockAudioOnce);

createSettingsMenu({
  onBrightness: (v) => setBrightness(v),
  getAngle: () => cameraZoom.getAngle(),
  setAngle: (deg) => cameraZoom.setAngle(deg),
  onMasterVolume: (v) => audio.setMasterVolume(v),
  onMusicVolume: (v) => audio.setMusicVolume(v),
  onSfxVolume: (v) => audio.setSfxVolume(v),
  initialVolumes: audio.volumes,
  onQualityMode: (mode) => setQualityMode(mode),
  initialQualityMode: 'auto',
});

/* --------------------------------------------------------------------
   7septies. Construction à la souris
   Clic sur un socle libre → construire ; clic sur une tour → gérer.
   Un cercle bleu montre la portée de la tour sélectionnée.
   -------------------------------------------------------------------- */
let _rangeRing = null;
let _lastClickX = 0, _lastClickY = 0; // dernier clic (pour repositionner le menu)
function showRange(tower) {
  hideRange();
  const r = tower.stats.range;
  _rangeRing = new THREE.Mesh(
    new THREE.RingGeometry(r - 0.12, r, 56),
    new THREE.MeshBasicMaterial({
      color: 0x7fd8ff, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  _rangeRing.rotation.x = -Math.PI / 2;
  _rangeRing.position.set(tower.position.x, 0.1, tower.position.z);
  scene.add(_rangeRing);
}
function hideRange() {
  if (_rangeRing) {
    scene.remove(_rangeRing);
    _rangeRing.geometry.dispose();
    _rangeRing = null;
  }
}

const buildMenu = createBuildMenu({
  onBuild: (typeId, slot) => {
    const cost = TOWER_TYPES[typeId].levels[0].cost;
    if (!GameState.spendGold(cost)) return;
    const tower = spawnTower(typeId, { x: slot.x, y: slot.y, z: slot.z });
    slot.occupied = true; slot.tower = tower;
    towers.push(tower);
    puff(slot.x, slot.y + 0.3, slot.z, 20);   // poussière de pose (T1.7)
    audio.playPlace();                          // son de pose (T5.3)
    console.log('[Construction] ' + TOWER_TYPES[typeId].name + ' posée (−' + cost + ' or).');
    // bascule le panneau en mode gestion de la tour fraîchement posée.
    buildMenu.showManage(tower, _lastClickX, _lastClickY);
    showRange(tower);
  },
  onUpgrade: (tower) => {
    const cost = TOWER_TYPES[tower.typeId].levels[tower.level].cost;
    if (!GameState.spendGold(cost)) return;
    tower.upgrade();
    console.log('[Construction] ' + tower.typeId + ' → niv. ' + tower.level + ' (−' + cost + ' or).');
    showRange(tower);       // la portée a pu changer
    buildMenu.refresh();
  },
  onSpecialize: (tower) => {
    buildMenu.hide();
    openSpecializationUI(tower);
  },
  onSell: (tower) => {
    const refund = sellValue(tower.typeId, tower.level);
    GameState.addGold(refund, { earned: false });
    if (tower._fireEmitter) { tower._fireEmitter.dispose(); tower._fireEmitter = null; } // feu du bûcher
    const i = towers.indexOf(tower);
    if (i >= 0) towers.splice(i, 1);
    tower.dispose();
    const slot = map.towerSlots.slots.find(sl => sl.tower === tower);
    if (slot) { slot.occupied = false; slot.tower = null; }
    console.log('[Construction] Tour vendue (+' + refund + ' or).');
    hideRange();
    buildMenu.hide();
  },
  onCycleTarget: (tower) => {
    const i = TARGET_MODE_IDS.indexOf(tower.targetMode);
    tower.setTargetMode(TARGET_MODE_IDS[(i + 1) % TARGET_MODE_IDS.length]);
    buildMenu.refresh();
  },
});

/* --------------------------------------------------------------------
   7octies. HUD en jeu (T6.5 adapté)
   Or (+ intérêts attendus), PV du château, vague courante, et le bouton
   « Lancer la vague » pendant l'entracte. Écrans victoire/défaite.
   -------------------------------------------------------------------- */
const hud = createHud({
  waveManager,
  economy,
  onStartWave: () => waveManager.startNextWave(),
});

// Overlay de debug d'équilibrage (T7.1) : F2 ou __CF__.toggleDebug().
const debugOverlay = createDebugOverlay();
let _elapsed = 0;   // temps de jeu écoulé (pour l'or/min)
let _fps = 60;      // FPS lissé
window.addEventListener('keydown', (e) => {
  if (e.key === 'F2') { e.preventDefault(); debugOverlay.toggle(); }
});
function buildDebugText() {
  // Ennemis sur le terrain.
  let enemyHp = 0;
  for (const e of enemies) enemyHp += e.hp;
  // Tours : DPS estimé = dégâts × cadence (approx., hors multishot/AoE).
  const byType = {};
  let totalDps = 0;
  for (const t of towers) {
    const dps = (t.stats.damage || 0) * (t.stats.fireRate || 0);
    totalDps += dps;
    if (!byType[t.typeId]) byType[t.typeId] = { n: 0, dps: 0 };
    byType[t.typeId].n++; byType[t.typeId].dps += dps;
  }
  const st = GameState.get.stats();
  const goldPerMin = _elapsed > 1 ? (st.goldEarned / _elapsed * 60) : 0;
  let towerLines = '';
  for (const [type, v] of Object.entries(byType)) {
    towerLines += '\n    ' + type.padEnd(9) + ' ×' + v.n + '  ' + v.dps.toFixed(0) + ' dps';
  }
  return [
    '— DEBUG ÉQUILIBRAGE (F2) —',
    'FPS         ' + _fps.toFixed(0),
    'Ennemis     ' + enemies.length + '  (PV terrain ' + enemyHp.toFixed(0) + ')',
    'Tours       ' + towers.length + '  (DPS total ' + totalDps.toFixed(0) + ')' + towerLines,
    'Or          ' + Math.floor(GameState.get.gold())
      + '  gagné ' + Math.floor(st.goldEarned)
      + '  (' + goldPerMin.toFixed(0) + '/min)',
    'PV château  ' + GameState.get.hp() + '/' + GameState.get.maxHp(),
    'Vague       ' + GameState.get.waveNumber() + '/' + GameState.get.totalWaves()
      + '  kills ' + st.kills,
  ].join('\n');
}

// Préchargement des modèles glTF (T5.1), suivi par l'écran de chargement.
// En cas d'échec d'un modèle → fallback procédural pour l'ennemi concerné.
const MODELS = [
  ['dragon', 'Dragon.gltf'],
  ['chicken', 'Chicken.gltf'],
  ['orc', 'Orc.gltf'],
  ['ninja', 'Ninja.gltf'],
  ['wizard', 'Wizard.gltf'],
  ['bluedemon', 'BlueDemon.gltf'],
  ['demon', 'Demon.gltf'],
  ['fish', 'Fish.gltf'],
  ['yeti', 'Yeti.gltf'],
  ['mushroomking', 'MushroomKing.gltf'],
];
for (const [key, file] of MODELS) {
  trackAsset(preloadModel(key, './assets/models/' + file), 'Modèle : ' + key);
}



/* --------------------------------------------------------------------
   7bis. Post-processing (T2.2)
   Réglage de qualité : 'high' active le pipeline (bloom, vignette, grade),
   'low' rend en direct sans post-process. On expose un interrupteur pour
   basculer à chaud (utile pour comparer et pour le futur menu d'options T6.2).

   Important : quand le composer est actif, le tone mapping ACES est fait
   par l'OutputPass du composer. On le retire donc du renderer pour ne pas
   l'appliquer deux fois.
   -------------------------------------------------------------------- */
let quality = 'high';               // 'high' | 'low'
let post = null;
let brightnessValue = 1.0;          // luminosité globale (réglage joueur)

// Applique la luminosité par le BON levier selon le mode, sans double
// application : en high c'est le shader de grade (le composer fait le tone
// mapping), en low c'est l'exposure du renderer (qui fait l'ACES lui-même).
function applyBrightness() {
  if (quality === 'high' && post) {
    post.setBrightness(brightnessValue);
    renderer.toneMappingExposure = 1.0;
  } else {
    renderer.toneMappingExposure = brightnessValue;
    if (post) post.setBrightness(1.0);
  }
}
/** Règle la luminosité globale (0.4 sombre … 1 neutre … 1.8 clair). */
function setBrightness(v) {
  brightnessValue = Math.min(1.8, Math.max(0.4, v));
  applyBrightness();
}

// Règle la qualité des ombres (T7.3) : carte plus petite en basse qualité.
// Redimensionner impose de jeter l'ancienne map pour qu'elle se recrée.
function applyShadowQuality(high) {
  const sh = lighting.sun.shadow;
  const size = high ? 2048 : 1024;
  if (sh.mapSize.width !== size) {
    sh.mapSize.set(size, size);
    if (sh.map) { sh.map.dispose(); sh.map = null; }
  }
}

function enablePost() {
  if (!post) post = createPostProcess(renderer, scene, camera);
  // Le composer gère le tone mapping : on l'enlève du renderer.
  renderer.toneMapping = THREE.NoToneMapping;
  quality = 'high';
  applyShadowQuality(true);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  applyBrightness();
}
function disablePost() {
  // Rendu direct : le renderer reprend le tone mapping ACES.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  quality = 'low';
  applyShadowQuality(false);            // ombres allégées (T7.3)
  renderer.setPixelRatio(1);            // moins de pixels à dessiner (T7.3)
  applyBrightness();
}
function setQuality(q) { (q === 'low' ? disablePost : enablePost)(); }

// Mode de qualité (T7.3) : 'auto' (repli si FPS bas), 'high', 'low'.
let _qualityMode = 'auto';
let _lowFpsT = 0;   // temps passé sous le seuil de FPS (mode auto)
function setQualityMode(mode) {
  _qualityMode = mode;
  _lowFpsT = 0;
  if (mode === 'low') disablePost();
  else enablePost();   // 'high' et 'auto' démarrent en haute qualité
}

enablePost(); // qualité haute par défaut

/* --------------------------------------------------------------------
   7. Redimensionnement
   -------------------------------------------------------------------- */
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  if (post) post.setSize(w, h);
}
window.addEventListener('resize', onResize);

/* --------------------------------------------------------------------
   8. Boucle de jeu à pas de temps fixe (T1.4)
   - update(dt) : logique, appelée par pas fixes identiques (déterminisme).
   - render(alpha) : rendu interpolé, alpha ∈ [0,1) entre deux pas.
   -------------------------------------------------------------------- */
function update(dt) {
  // Logique de jeu (entités de gameplay aux lots suivants).
  // Le château s'anime au rendu (torches, bannières) via le temps écoulé.
}

let lastRenderTime = performance.now();
let elapsed = 0;
function render(alpha) {
  const now = performance.now();
  // dt clampé (T7.4) : si l'onglet a été en arrière-plan (rAF suspendu),
  // (now - lastRenderTime) peut valoir plusieurs secondes → sans plafond,
  // les ennemis se téléporteraient et les projectiles sauteraient. On borne
  // à 0.1 s : au retour, le jeu reprend proprement (il « attend » hors focus).
  // La vitesse (×2/×3 via GameState.setSpeed) s'applique ici — sinon elle
  // n'aurait aucun effet, la simulation vivant dans render() et non dans
  // update(). Second clamp après la vitesse : garde-fou anti-tunneling.
  let dt = Math.min((now - lastRenderTime) / 1000, 0.1);
  dt = Math.min(dt * GameState.get.speed(), 0.1);
  lastRenderTime = now;

  // Pause tactique (T4.5) : le temps de jeu est FIGÉ (simulation, ambiance,
  // faveur, vagues, sorts), mais la caméra, l'UI et le rendu restent actifs
  // pour consulter, améliorer et régler les tours à tête reposée.
  const paused = GameState.get.paused();
  if (!paused) {
    elapsed += dt;

    // Animation du château : torches vacillantes, bannières au vent, fumée.
    castle.update(dt, elapsed);

    // Animation de l'eau : vagues Gerstner + réflexion suivant la caméra.
    water.update(elapsed, camera);

    // Mise à jour des particules (feu des torches, effets).
    particles.update(dt);

    // Animations des modèles glTF (T5.1) — gelées en pause avec le reste.
    updateMixers(dt);

    // Mise à jour des projectiles en vol (flèches, boules de feu, etc.).
    projectiles.update(dt);

    // Ennemis réels (T3.7) : déplacement, soin, et tir des tours dessus.
    updateEnemies(dt);

    // Gestionnaire de vagues (T3.9) : apparition, fin de vague, victoire/défaite.
    waveManager.update(dt);

    // Économie (T4.4) : mode debug (flux d'or/seconde) si activé.
    economy.update(dt);

    // Sorts (T4.1) : régénération de la faveur + cooldowns + barricades.
    GameState.regenFavor(dt);
    spells.update(dt, enemies);
    updateFallingArrows(dt);

    // Test de combat (debug T3.5/T3.6) : la cible fictive avance et toutes
    // les tours lui tirent dessus pour de vrai.
    if (_combatTest) {
      _combatTest.update(dt, camera);
      const dummyList = [_combatTest];
      for (const t of towers) t.update(dt, dummyList);
    }
  }

  // Toujours actifs, même en pause : zoom caméra, inspection, barre de sorts.
  cameraZoom.update(dt);
  if (_inspectTower) _inspectTower.mesh.rotation.y += dt * 0.6;
  if (_inspectModel) _inspectModel.scene.rotation.y += dt * 0.5;
  spellBar.update();
  hud.update();
  // Debug d'équilibrage (T7.1) : FPS lissé + temps de jeu (or/min), overlay.
  _fps = _fps * 0.9 + (dt > 0 ? 1 / dt : 60) * 0.1;
  if (!GameState.get.paused()) _elapsed += dt;
  // Repli auto (T7.3) : en mode auto + haute qualité, si les FPS restent bas
  // (~3 s sous 40), on bascule en basse qualité une fois (pas d'oscillation).
  if (_qualityMode === 'auto' && quality === 'high') {
    _lowFpsT = _fps < 40 ? _lowFpsT + dt : Math.max(0, _lowFpsT - dt * 0.5);
    if (_lowFpsT > 3) {
      disablePost();
      console.log('[Perf] FPS bas prolongé → qualité réduite automatiquement (réglable dans ⚙).');
    }
  }
  debugOverlay.update(dt, buildDebugText);

  // Rendu : via le composer si post-process actif, sinon direct.
  if (quality === 'high' && post) {
    post.render(dt);
  } else {
    renderer.render(scene, camera);
  }
}

const loop = createLoop({ update, render });

/* --------------------------------------------------------------------
   9. Exposition pour le débogage
   Pratique pour inspecter la scène depuis la console du navigateur.
   -------------------------------------------------------------------- */
/* --------------------------------------------------------------------
   Outil de debug : inspecter une tour en GRAND, isolée et en rotation.
   Usage console :
     __CF__.inspectTower('baliste', 2)   → affiche la baliste niv.2 en grand
     __CF__.inspectTower('archers', 3)
     __CF__.clearInspect()               → retire la tour d'inspection
   -------------------------------------------------------------------- */
let _inspectTower = null;
function inspectTower(typeId = 'archers', level = 1) {
  clearInspect();
  // Place la tour bien en vue, au centre, surélevée pour être dégagée du décor.
  const t = createTower(scene, typeId, { x: 0, y: 14, z: 30 });
  for (let u = 1; u < level; u++) t.upgrade();
  // Agrandir fortement pour voir les détails.
  t.mesh.scale.multiplyScalar(4);
  _inspectTower = t;
  console.log('[Inspect] ' + typeId + ' niveau ' + level
    + ' affiché en grand. __CF__.clearInspect() pour retirer.');
  return t;
}
function clearInspect() {
  if (_inspectTower) { _inspectTower.dispose(); _inspectTower = null; }
}

/* --------------------------------------------------------------------
   Inspecteur de MODÈLES glTF (réglage d'échelle et vérif des animations).
   Usage console :
     __CF__.inspectModel('cyclope')        → affiche le modèle du cyclope,
                                              à l'échelle configurée, en rotation
     __CF__.inspectModel('yeti')           → accepte aussi une clé de modèle
     __CF__.inspectModel('cyclope','Death')→ joue une animation précise
     __CF__.inspectAnim('Walk')            → change l'animation en cours
     __CF__.inspectScale(3.0)              → règle l'échelle EN DIRECT (pour
                                              trouver la bonne valeur à me donner)
     __CF__.clearInspectModel()            → retire le modèle
   -------------------------------------------------------------------- */
let _inspectModel = null;
function inspectModel(idOrKey = 'dragon', animName = null) {
  clearInspectModel();
  // Résout : soit un id d'ennemi (on lit son modèle/échelle/anims), soit
  // directement une clé de modèle.
  const cfg = ENEMY_TYPES[idOrKey];
  const key = cfg?.model || idOrKey;
  const scale = cfg?.modelScale || 1;
  const defaultAnim = animName || cfg?.anims?.move;

  if (!hasModel(key)) {
    console.log('[Inspect] Modèle « ' + key + ' » pas (encore) chargé. '
      + 'Attends le message "[Modèles] … chargé" ou vérifie le nom.');
    return null;
  }
  const inst = createModelInstance(key);
  if (!inst) { console.log('[Inspect] Impossible d\'instancier « ' + key + ' ».'); return null; }

  // Place le modèle bien en vue, devant la caméra, surélevé et dégagé du décor.
  inst.scene.position.set(0, 6, 28);
  inst.scene.scale.setScalar(scale);
  scene.add(inst.scene);
  _inspectModel = inst;
  _inspectModel._scale = scale;

  if (defaultAnim) inst.play(defaultAnim, { loop: true });
  console.log('[Inspect] Modèle « ' + key + ' »'
    + (cfg ? ' (ennemi ' + idOrKey + ')' : '')
    + ' — échelle ' + scale
    + ' | animations : ' + inst.animationNames.join(', '));
  console.log('  → __CF__.inspectScale(x) pour régler la taille, '
    + '__CF__.inspectAnim(\'nom\') pour changer d\'animation.');
  return inst;
}
function inspectAnim(name) {
  if (!_inspectModel) { console.log('[Inspect] Aucun modèle inspecté.'); return; }
  const a = _inspectModel.play(name, { loop: true });
  console.log(a ? '[Inspect] Animation « ' + name + ' ».'
    : '[Inspect] Animation inconnue. Dispo : ' + _inspectModel.animationNames.join(', '));
}
function inspectScale(factor) {
  if (!_inspectModel) { console.log('[Inspect] Aucun modèle inspecté.'); return; }
  _inspectModel.scene.scale.setScalar(factor);
  _inspectModel._scale = factor;
  console.log('[Inspect] Échelle = ' + factor + '  (dis-moi cette valeur pour que je la fixe dans la config).');
}
function clearInspectModel() {
  if (_inspectModel) { scene.remove(_inspectModel.scene); _inspectModel.dispose(); _inspectModel = null; }
}

/* --------------------------------------------------------------------
   Outils de test du combat (debug T3.5 / T3.6).
   Usage console :
     __CF__.startCombatTest()      → une cible fictive avance sur le chemin,
                                      toutes les tours lui tirent dessus.
     __CF__.stopCombatTest()
     __CF__.maxAllTowers()         → monte toutes les tours au niveau 3.
     __CF__.specializeAll(0|1)     → applique la 1re ou 2e spécialisation
                                      à toutes les tours de niveau 3.
   -------------------------------------------------------------------- */
let _combatTest = null;
function startCombatTest(hp = 5000, speed = 4) {
  if (_combatTest) return _combatTest;
  _combatTest = createTestDummy(scene, { maxHp: hp, speed });
  console.log('[Test] Cible fictive lancée (PV=' + hp + '). Les tours tirent '
    + 'dessus ; elle atteint le château puis reboucle. stopCombatTest() pour arrêter.');
  return _combatTest;
}
function stopCombatTest() {
  if (_combatTest) { _combatTest.dispose(); _combatTest = null; }
}
function maxAllTowers() {
  for (const t of towers) { while (t.upgrade()) {} }
  console.log('[Test] Toutes les tours au niveau 3.');
}
function specializeAll(branchIndex = 0) {
  let n = 0;
  for (const t of towers) {
    const opts = t.specializationOptions;
    if (opts.length > branchIndex) { t.specialize(opts[branchIndex].id); n++; }
  }
  console.log('[Test] ' + n + ' tours spécialisées (branche ' + branchIndex + ').');
}

/* --------------------------------------------------------------------
   Outils de test des ennemis (debug T3.7).
   Usage console :
     __CF__.spawnEnemy('gobelin')        → fait apparaître un gobelin
     __CF__.spawnEnemy('chevalier', true)→ un chevalier d'élite (doré)
     __CF__.spawnWave()                  → une vague de test des 6 types
     __CF__.spawnWave(true)              → une vague d'élites
     __CF__.clearEnemies()               → retire tous les ennemis
   Types : gobelin, orc, chevalier, eclaireur, belier, chaman
   -------------------------------------------------------------------- */
function spawnWave(elite = false, gap = 700) {
  // fait apparaître les 6 types espacés dans le temps.
  ENEMY_IDS.forEach((id, i) => {
    setTimeout(() => spawnEnemy(id, elite), i * gap);
  });
  console.log('[Test] Vague ' + (elite ? 'd\'élite ' : '') + 'lancée ('
    + ENEMY_IDS.length + ' ennemis).');
}
function clearEnemies() {
  for (const e of enemies.slice()) e.dispose();
  enemies.length = 0;
  console.log('[Test] Ennemis retirés.');
}

/* --------------------------------------------------------------------
   Spawn aléatoire en boucle (debug).
     __CF__.spawnRandomLoop()      → un ennemi aléatoire toutes les 1.2s
     __CF__.spawnRandomLoop(0.6, 0.3) → interval 0.6s, 30% de chance d'élite
     __CF__.stopRandomLoop()
   -------------------------------------------------------------------- */
let _randomLoop = null;
function spawnRandomLoop(intervalSec = 1.2, eliteChance = 0.15) {
  if (_randomLoop) return;
  _randomLoop = setInterval(() => {
    const type = ENEMY_IDS[Math.floor(Math.random() * ENEMY_IDS.length)];
    const elite = Math.random() < eliteChance;
    spawnEnemy(type, elite);
  }, intervalSec * 1000);
  console.log('[Test] Spawn aléatoire en boucle démarré (interval ' + intervalSec
    + 's, élites ' + Math.round(eliteChance * 100) + '%). stopRandomLoop() pour arrêter.');
}
function stopRandomLoop() {
  if (_randomLoop) { clearInterval(_randomLoop); _randomLoop = null; console.log('[Test] Spawn aléatoire arrêté.'); }
}

/* --------------------------------------------------------------------
   Contrôle de l'économie (T4.4).
     __CF__.setInterest(true|false)   active/désactive les intérêts
     __CF__.interestInfo()            affiche taux, plafond, intérêts attendus
     __CF__.economyDebug(orPerSec)    flux d'or/seconde (0 pour couper)
   -------------------------------------------------------------------- */
function setInterest(on) {
  economy.setInterest(on);
  console.log('[Économie] Intérêts ' + (on ? 'ACTIVÉS' : 'désactivés') + '.');
}
function interestInfo() {
  const gold = GameState.get.gold();
  console.log('[Économie] Intérêts : ' + (economy.interestEnabled ? 'ON' : 'OFF')
    + ' | taux ' + Math.round(economy.config.interestRate * 100) + '%'
    + ' | plafond ' + economy.config.interestCap + ' or'
    + ' | sur ' + gold + ' or → +' + economy.previewInterest(gold) + ' à la prochaine vague.');
}
function economyDebug(orPerSec = 20) {
  economy.setDebugFlow(orPerSec);
  console.log('[Économie] Mode debug : +' + orPerSec + ' or/s (economyDebug(0) pour couper).');
}

/* --------------------------------------------------------------------
   Contrôle du ciblage (T4.5).
     __CF__.targetModes()             liste les modes + celui de chaque tour
     __CF__.setTargetMode(0, 'flying')  change le mode de la tour n°0
     __CF__.setAllTargetModes('strongest')  toutes les tours
   -------------------------------------------------------------------- */
function targetModes() {
  console.log('[Ciblage] Modes : ' + TARGET_MODE_IDS.map(id =>
    id + ' (' + TARGET_MODES[id].label + ')').join(', '));
  towers.forEach((t, i) => console.log('  tour ' + i + ' [' + t.typeId
    + ' niv.' + t.level + '] → ' + t.targetMode));
}
function setTargetMode(index, modeId) {
  const t = towers[index];
  if (!t) { console.log('[Ciblage] Pas de tour n°' + index + '.'); return false; }
  if (!t.setTargetMode(modeId)) {
    console.log('[Ciblage] Mode inconnu : ' + modeId + '. Modes : ' + TARGET_MODE_IDS.join(', '));
    return false;
  }
  console.log('[Ciblage] Tour ' + index + ' (' + t.typeId + ') → ' + TARGET_MODES[modeId].label + '.');
  return true;
}
function setAllTargetModes(modeId) {
  if (!TARGET_MODES[modeId]) {
    console.log('[Ciblage] Mode inconnu : ' + modeId + '. Modes : ' + TARGET_MODE_IDS.join(', '));
    return false;
  }
  for (const t of towers) t.setTargetMode(modeId);
  console.log('[Ciblage] Toutes les tours → ' + TARGET_MODES[modeId].label + '.');
  return true;
}



// Consulte les résistances/faiblesses d'un ennemi (debug T3.8).
function enemyInfo(typeId) {
  const info = enemyResistanceInfo(typeId);
  console.log('[' + typeId + '] résiste à : ' + (info.resist.join(', ') || 'rien')
    + ' | faible à : ' + (info.weak.join(', ') || 'rien'));
  return info;
}

/* --------------------------------------------------------------------
   Contrôle des vagues (T3.9). Le bouton du HUD est l'usage normal ;
   __CF__.nextWave() reste l'équivalent console.
   -------------------------------------------------------------------- */
function nextWave() { return waveManager.startNextWave(); }

window.__CF__ = { THREE, scene, camera, renderer, GameState, Events, loop, createPool, lighting, setQuality, castle, environment, water, particles, ParticlePresets, cameraZoom, map, towers, createTower, TOWER_TYPES, inspectTower, clearInspect, inspectModel, inspectAnim, inspectScale, clearInspectModel, openSpecializationUI, startCombatTest, stopCombatTest, maxAllTowers, specializeAll, projectiles, spawnEnemy, spawnWave, clearEnemies, enemies, ENEMY_IDS, enemyInfo, waveManager, nextWave, spells, selectSpell, SPELLS, spawnRandomLoop, stopRandomLoop, economy, setInterest, interestInfo, economyDebug, targetModes, setTargetMode, setAllTargetModes, TARGET_MODES, setBrightness, toggleDebug: () => debugOverlay.toggle() };

// Active le pont état -> bus : toute mutation d'état émet désormais un événement.
Events.connectStateBridge();

// Trace de démarrage : sert de critère de « fini » visible en console.
console.log('[Château Fort] T1.1 — scène initialisée, rendu actif.');
console.log('[Château Fort] T1.2 — état chargé :', GameState.get.snapshot());
console.log('[Château Fort] T1.3 — bus d\'événements branché sur l\'état.');
console.log('[Château Fort] T1.4 — boucle à pas fixe démarrée (essaie __CF__.loop, __CF__.GameState.setSpeed(2)).');
console.log('[Château Fort] T1.5 — object pooling disponible (__CF__.createPool). Cible 60 FPS, plancher 30.');
console.log('[Château Fort] T2.2 — post-processing actif (bloom + vignette + grade). Bascule : __CF__.setQuality("low"/"high").');
console.log('[Château Fort] T2.3 — château stylisé construit. Test dégâts : __CF__.castle.setDamage(0.3).');

// Le château réagit aux PV réels : quand le château perd des PV, son état
// visuel se dégrade automatiquement (démonstration du découplage via le bus).
Events.on(Events.Events.HP_CHANGED, (hp) => {
  const ratio = hp / GameState.get.maxHp();
  castle.setDamage(ratio);
});

// Démonstration vérifiable en console : un abonné réagit à un changement d'or.
// (À retirer plus tard ; sert de preuve du critère « un émetteur déclenche un écouteur ».)
Events.on(Events.Events.GOLD_CHANGED, (total) =>
  console.log('[demo] or changé →', total));

// Démarre la boucle une fois TOUS les assets chargés (ciel + modèles).
// L'écran de chargement s'efface juste avant. preloadModel/setupSky ne
// rejettent jamais, donc Promise.all résout toujours (échec = fallback).
Promise.all(assetTasks).then(() => {
  console.log('[Château Fort] Assets prêts (' + assetDone + '/' + assetTotal + ') — démarrage.');
  loadingScreen.finish();
  loop.start();
});
