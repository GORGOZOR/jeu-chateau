/* =====================================================================
   Château Fort — Chargeur de carte  (T3.1)
   ---------------------------------------------------------------------
   Rôle : construire toute la scène de jeu À PARTIR D'UN SCHÉMA de carte
   (data/maps/*.js), sans code spécifique à une carte donnée. Changer une
   valeur dans le schéma modifie la carte sans toucher à ce chargeur — c'est
   le critère de « fini » de T3.1.

   Le chargeur assemble les briques déjà écrites (terrain, château, eau,
   socles) en leur passant la configuration de la carte.
   ===================================================================== */

import { buildEnvironment } from '../render/environment.js';
import { buildCastle } from '../entities/castle.js';
import { buildWaterFeatures } from '../render/water.js';
import { buildTowerSlots } from '../entities/tower-slots.js';

/**
 * Charge une carte dans la scène.
 * @param {THREE.Scene} scene
 * @param {object} mapConfig   schéma de carte (ex. import { plaine })
 * @param {object} [opts]
 * @param {string} [opts.quality='high']
 * @returns objet regroupant les éléments construits + métadonnées de carte
 */
export function loadMap(scene, mapConfig, { quality = 'high' } = {}) {
  // 1. Terrain + décor (utilise le chemin et les zones d'eau, déjà câblés
  //    via les modules de données que la carte référence).
  const environment = buildEnvironment(scene, { quality });

  // 2. Château (position/orientation depuis la carte).
  const castle = buildCastle(scene, {
    position: mapConfig.castle.position,
    facing: mapConfig.castle.facing,
  });

  // 3. Eau (douve + étangs, depuis la config de la carte).
  const water = buildWaterFeatures(scene);

  // 4. Socles de tours, posés à la hauteur du terrain.
  const towerSlots = buildTowerSlots(scene, mapConfig.towerSlots, environment.heightAt);

  return {
    config: mapConfig,
    environment,
    castle,
    water,
    towerSlots,
    // Raccourcis pratiques vers les données de la carte.
    path: mapConfig.path,
    entries: mapConfig.entries,
    // Animation groupée (ce qui doit bouger chaque frame).
    update(dt, elapsed, camera) {
      castle.update(dt, elapsed);
      water.update(elapsed, camera);
    },
    dispose() {
      environment.dispose?.();
      castle.dispose?.();
      water.dispose();
      towerSlots.dispose();
    },
  };
}
