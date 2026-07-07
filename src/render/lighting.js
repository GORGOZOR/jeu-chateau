/* =====================================================================
   Château Fort — Éclairage directionnel et atmosphère  (T2.1)
   ---------------------------------------------------------------------
   Rôle : le soleil rasant du crépuscule, la lumière d'ambiance ciel/sol,
   les ombres douces bien cadrées sur la zone de jeu, et le brouillard de
   profondeur. Combiné au ciel HDRI (sky.js), ça donne l'ambiance visée.

   Choix d'ambiance « crépuscule » :
     - soleil bas sur l'horizon, teinte chaude ambrée/orangée,
     - lumière hémisphérique : ciel bleu froid au-dessus, rebond chaud du sol,
     - ombres longues et douces (PCFSoft),
     - brouillard dont la couleur s'accorde au ciel pour fondre l'horizon.

   Périmètre strict T2.1 : cet éclairage. Le post-processing (bloom,
   vignettage) est la tâche T2.2, distincte.
   ===================================================================== */

import * as THREE from 'three';

/**
 * Installe l'éclairage complet dans la scène.
 *
 * @param {THREE.Scene} scene
 * @param {object} [opts]
 * @param {number} [opts.shadowArea=48]  demi-largeur de la zone d'ombres
 * @returns {{ sun:THREE.DirectionalLight, hemi:THREE.HemisphereLight, update:Function }}
 */
export function setupLighting(scene, { shadowArea = 48 } = {}) {
  /* ---- Lumière hémisphérique (ambiance ciel/sol) ------------------
     Simule la lumière diffuse du ciel (haut) et le rebond du sol (bas).
     Ciel bleu crépusculaire, sol dans un ocre chaud. */
  const hemi = new THREE.HemisphereLight(
    0x6a82b0, // couleur du ciel (bleu doux)
    0x3a2c22, // couleur du sol (brun chaud)
    0.55      // intensité modérée : l'environment map HDRI fait le gros du travail
  );
  hemi.position.set(0, 50, 0);
  scene.add(hemi);

  /* ---- Soleil directionnel (lumière principale) ------------------
     Bas sur l'horizon, teinte ambrée chaude typique du couchant. */
  const sun = new THREE.DirectionalLight(0xffc27a, 2.1);
  sun.position.set(-38, 26, 22);   // bas et de côté = ombres longues
  sun.target.position.set(0, 0, 0);
  scene.add(sun.target);

  // Ombres douces, cadrées sur la zone de jeu pour préserver la résolution.
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -shadowArea;
  sun.shadow.camera.right = shadowArea;
  sun.shadow.camera.top = shadowArea;
  sun.shadow.camera.bottom = -shadowArea;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;   // réduit l'acné d'ombre sur surfaces obliques
  sun.shadow.radius = 3;          // adoucit le bord des ombres (PCFSoft)
  scene.add(sun);

  /* ---- Petite lumière de contre-jour froide ----------------------
     Vient de l'opposé du soleil pour décoller les silhouettes du fond
     (rim light discret). Renforce la lisibilité, exigence de la tâche. */
  const rim = new THREE.DirectionalLight(0x5a6fa0, 0.4);
  rim.position.set(30, 18, -24);
  scene.add(rim);

  /* ---- Brouillard de profondeur ----------------------------------
     Couleur accordée au bas du ciel crépusculaire : fond l'horizon,
     donne de la profondeur, et masque la limite du terrain. */
  scene.fog = new THREE.Fog(0x3b4a63, 55, 105);

  /**
   * Point d'entrée pour un futur cycle jour/nuit (hors périmètre T2.1) :
   * permet de faire varier l'angle et la teinte du soleil dans le temps.
   * Laissé inerte pour l'instant, documenté pour la suite.
   */
  function update(/* elapsed */) {
    // no-op en T2.1 ; le cycle dynamique est une option du Lot 2.
  }

  return { sun, hemi, rim, update };
}
