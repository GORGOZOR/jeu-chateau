/* =====================================================================
   Château Fort — Contrôle caméra : zoom molette sur arc court  (T1.8)
   ---------------------------------------------------------------------
   Rôle : la molette avance/recule la vue le long d'une COURTE TRAJECTOIRE
   COURBE (un arc), pas d'un travelling rectiligne vers le centre.

   Pourquoi un arc et pas une ligne droite : un zoom linéaire vers le point
   visé finit par raser le sol ou passer dessous, et l'angle de vue devient
   désagréable. En suivant un arc, la caméra se rapproche du château tout
   en conservant une hauteur et un angle plongeant cohérents.

   Implémentation :
     - un scalaire `zoom` ∈ [0,1] paramètre la position sur l'arc
       (0 = vue large et éloignée, 1 = vue rapprochée),
     - la molette modifie une cible `zoomTarget` bornée,
     - `zoom` rejoint `zoomTarget` par amortissement (lissage) chaque frame,
     - la position caméra est calculée sur l'arc : la distance horizontale
       et la hauteur suivent des courbes différentes, ce qui incurve la
       trajectoire (rapprochement plus marqué que la descente).

   L'amplitude est volontairement FAIBLE et COURTE (léger recadrage), pas
   un zoom qui traverse toute la scène.
   ===================================================================== */

import * as THREE from 'three';

/**
 * Installe le contrôle de zoom molette sur la caméra.
 *
 * @param {THREE.Camera} camera
 * @param {HTMLElement} domElement  élément qui capte la molette (canvas)
 * @param {object} [opts]
 * @param {THREE.Vector3} [opts.target]   point regardé (défaut origine)
 * @param {number} [opts.sensitivity=0.0012]  vitesse de zoom par cran molette
 * @param {number} [opts.damping=8]       vitesse de rattrapage (plus grand = plus vif)
 * @returns {{ update:Function, dispose:Function, setZoom:Function, getZoom:Function }}
 */
export function setupCameraZoom(camera, domElement, {
  target = new THREE.Vector3(0, 0, 0),
  sensitivity = 0.0012,
  damping = 8,
} = {}) {
  // Les deux extrémités de l'arc, calées sur la vue initiale (0,40,46).
  //   - "far"  : vue large et éloignée = état initial (zoom = 0)
  //   - "near" : vue rapprochée, un peu plus basse (état zoom = 1)
  // Distances HORIZONTALES (plan XZ). La vue initiale (0,40,46) a une
  // distance horizontale de 46 et une hauteur de 40.
  const far  = { dist: 46, height: 31 };  // vue d'ensemble, un peu plus basse
  const near = { dist: 28, height: 19 };  // rapproché

  // Direction horizontale initiale caméra → cible, convertie en ANGLE
  // AZIMUTAL. L'orbite gauche/droite fait varier cet angle autour du
  // centre ; le zoom avance/recule le long de la direction courante.
  const initialOffset = new THREE.Vector3().copy(camera.position).sub(target);
  const theta0 = Math.atan2(initialOffset.x, initialOffset.z); // azimut initial
  const MAX_SWING = Math.PI / 3; // ±60° autour de l'azimut initial

  let zoom = 0;         // état courant sur l'arc [0,1]
  let zoomTarget = 0;   // cible visée (modifiée par la molette)
  let theta = theta0;         // azimut courant
  let thetaTarget = theta0;   // azimut visé (flèches ←/→ ou slider)
  const keys = { left: false, right: false };
  const ORBIT_SPEED = 1.1;    // rad/s quand une flèche est maintenue

  // Courbe d'arc : la hauteur suit une courbe plus douce que la distance,
  // ce qui incurve la trajectoire. easeInOut pour un mouvement naturel.
  function easeInOut(t) { return t * t * (3 - 2 * t); }

  function applyView() {
    const t = easeInOut(zoom);
    // distance horizontale et hauteur interpolées SÉPARÉMENT → arc.
    const dist = far.dist + (near.dist - far.dist) * t;
    // la hauteur suit une courbe légèrement différente (racine) pour que
    // la caméra descende MOINS vite qu'elle ne se rapproche : trajectoire
    // incurvée plutôt que droite.
    const th = Math.pow(t, 0.7);
    const height = far.height + (near.height - far.height) * th;

    camera.position.set(
      target.x + Math.sin(theta) * dist,
      target.y + height,
      target.z + Math.cos(theta) * dist
    );
    camera.lookAt(target);
  }

  applyView(); // pose la position initiale (zoom = 0, azimut initial)

  // Clavier : flèches ← / → pour orbiter (maintenues = rotation continue).
  function onKeyDown(e) {
    if (e.code === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
    else if (e.code === 'ArrowRight') { keys.right = true; e.preventDefault(); }
  }
  function onKeyUp(e) {
    if (e.code === 'ArrowLeft') keys.left = false;
    else if (e.code === 'ArrowRight') keys.right = false;
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  function onWheel(e) {
    e.preventDefault();
    // deltaY > 0 = molette vers le bas = on dézoome (recule) ; < 0 = zoome.
    zoomTarget = THREE.MathUtils.clamp(
      zoomTarget - Math.sign(e.deltaY) * (Math.abs(e.deltaY) * sensitivity),
      0, 1
    );
  }
  domElement.addEventListener('wheel', onWheel, { passive: false });

  return {
    /** À appeler chaque frame : touches d'orbite + amortissement zoom/angle. */
    update(dt) {
      // Rotation continue tant qu'une flèche est maintenue (bornée ±60°).
      if (keys.left) thetaTarget += ORBIT_SPEED * dt;
      if (keys.right) thetaTarget -= ORBIT_SPEED * dt;
      thetaTarget = THREE.MathUtils.clamp(thetaTarget, theta0 - MAX_SWING, theta0 + MAX_SWING);

      const needZoom = Math.abs(zoom - zoomTarget) > 1e-4;
      const needTheta = Math.abs(theta - thetaTarget) > 1e-4;
      if (needZoom || needTheta) {
        // interpolation exponentielle (amortissement indépendant du framerate)
        const k = 1 - Math.exp(-damping * dt);
        if (needZoom) zoom += (zoomTarget - zoom) * k;
        if (needTheta) theta += (thetaTarget - theta) * k;
        applyView();
      }
    },
    /** Force une valeur de zoom (0..1). */
    setZoom(v) { zoomTarget = THREE.MathUtils.clamp(v, 0, 1); },
    getZoom() { return zoom; },
    /** Oriente la caméra : angle en DEGRÉS relatif à la vue initiale (−60..60). */
    setAngle(deg) {
      const rad = THREE.MathUtils.degToRad(deg);
      thetaTarget = THREE.MathUtils.clamp(theta0 + rad, theta0 - MAX_SWING, theta0 + MAX_SWING);
    },
    getAngle() { return THREE.MathUtils.radToDeg(thetaTarget - theta0); },
    dispose() {
      domElement.removeEventListener('wheel', onWheel);
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      }
    },
  };
}
