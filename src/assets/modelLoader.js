/* =====================================================================
   Château Fort — Chargeur de modèles glTF/GLB  (T5.1)
   ---------------------------------------------------------------------
   - Charge et met en CACHE les modèles glTF (un seul chargement réseau
     par modèle, même s'il est utilisé par 100 ennemis).
   - Fournit des INSTANCES clonées, chacune avec son propre AnimationMixer
     et ses actions nommées (marche, mort…).
   - FALLBACK : si un modèle est absent ou n'a pas pu être chargé, on
     renvoie null et l'appelant retombe sur son rendu procédural.

   Le clonage d'un mesh « skinné » (rigidé) nécessite SkeletonUtils.clone
   (le .clone() standard casse le lien os↔peau). Chaque instance a donc
   son squelette indépendant et peut jouer une animation différente.

   Les mixers sont mis à jour de façon centralisée via updateMixers(dt),
   appelé une fois par frame — ainsi une animation de MORT peut continuer
   à jouer même après que l'ennemi est retiré de la logique de jeu.
   ===================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const _loader = new GLTFLoader();
const _cache = new Map();     // key -> { scene, animations }  (gabarit chargé)
const _mixers = new Set();    // mixers actifs (mis à jour chaque frame)

/**
 * Précharge un modèle et le met en cache. Idempotent : un même key n'est
 * chargé qu'une fois (les appels suivants renvoient la même promesse).
 * @param {string} key  identifiant logique (ex. 'dragon')
 * @param {string} url  chemin du .gltf/.glb
 * @returns {Promise<boolean>} true si chargé, false si échec (→ fallback)
 */
export function preloadModel(key, url) {
  if (_cache.has(key)) {
    const entry = _cache.get(key);
    // déjà chargé, ou chargement en cours (on renvoie sa promesse)
    return entry.ready ? Promise.resolve(true) : entry.promise;
  }
  const entry = { ready: false, scene: null, animations: null };
  entry.promise = new Promise((resolve) => {
    _loader.load(
      url,
      (gltf) => {
        entry.scene = gltf.scene;
        entry.animations = gltf.animations || [];
        entry.ready = true;
        // ombres portées sur tout le modèle.
        entry.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        resolve(true);
      },
      undefined,
      (err) => {
        console.warn('[modelLoader] échec du chargement de « ' + key +' » (' + url + ') → fallback procédural.', err);
        _cache.delete(key);
        resolve(false);
      }
    );
  });
  _cache.set(key, entry);
  return entry.promise;
}

/** Un modèle est-il chargé et prêt à être instancié ? */
export function hasModel(key) {
  const e = _cache.get(key);
  return !!(e && e.ready);
}

/**
 * Crée une INSTANCE jouable d'un modèle mis en cache.
 * @param {string} key
 * @returns {null | {
 *   scene: THREE.Object3D,
 *   mixer: THREE.AnimationMixer,
 *   play: (name, opts?) => (THREE.AnimationAction|null),
 *   stop: () => void,
 *   dispose: () => void,
 *   animationNames: string[],
 * }}  null si le modèle n'est pas disponible (→ fallback procédural).
 */
export function createModelInstance(key) {
  const entry = _cache.get(key);
  if (!entry || !entry.ready) return null;

  // clone qui préserve le rig (skinning) → squelette indépendant.
  const scene = skeletonClone(entry.scene);
  const mixer = new THREE.AnimationMixer(scene);
  _mixers.add(mixer);

  // index des clips par nom pour un accès rapide.
  const clips = {};
  for (const clip of entry.animations) clips[clip.name] = clip;

  let currentAction = null;

  /** Joue une animation par nom, avec fondu ; loop true par défaut. */
  function play(name, opts = {}) {
    const clip = clips[name];
    if (!clip) return null;
    const { loop = true, fade = 0.25, clampWhenFinished = false } = opts;
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = clampWhenFinished;
    if (currentAction && currentAction !== action) {
      currentAction.crossFadeTo(action, fade, false);
      action.play();
    } else {
      action.fadeIn(fade).play();
    }
    currentAction = action;
    return action;
  }

  function stop() { mixer.stopAllAction(); currentAction = null; }

  function dispose() {
    mixer.stopAllAction();
    _mixers.delete(mixer);
    // libère les géométries/matériaux clonés.
    scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
        else o.material?.dispose?.();
      }
    });
  }

  return { scene, mixer, play, stop, dispose, animationNames: Object.keys(clips) };
}

/** Met à jour tous les mixers actifs. À appeler une fois par frame. */
export function updateMixers(dt) {
  for (const m of _mixers) m.update(dt);
}

/** Durée (s) d'un clip d'un modèle chargé (0 si absent). Utile pour la mort. */
export function clipDuration(key, name) {
  const e = _cache.get(key);
  if (!e || !e.ready) return 0;
  const clip = e.animations.find(c => c.name === name);
  return clip ? clip.duration : 0;
}
