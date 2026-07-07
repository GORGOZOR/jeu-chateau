/* =====================================================================
   Château Fort — Boucle de jeu à pas de temps fixe  (T1.4)
   ---------------------------------------------------------------------
   Rôle : cadencer le jeu proprement. La LOGIQUE avance par pas de temps
   fixes et identiques (déterminisme), tandis que le RENDU se fait à la
   fréquence de l'écran, avec interpolation pour rester fluide même quand
   l'écran ne tourne pas exactement à 60 Hz.

   Principe (pattern « fixed timestep with interpolation ») :
     - on accumule le temps réel écoulé,
     - tant qu'on a accumulé au moins un pas fixe, on avance la logique
       d'un pas et on retire ce pas de l'accumulateur,
     - le reste (< 1 pas) donne un facteur d'interpolation `alpha` dans
       [0,1) passé au rendu pour lisser l'affichage.

   Accélération du temps (×1/×2/×3) : on MULTIPLIE le temps injecté dans
   l'accumulateur, donc le nombre de pas logiques exécutés. On n'accélère
   jamais le rendu seul — c'est ce qui préserve le déterminisme (exigence
   du cahier des charges §4.3).

   Périmètre strict T1.4 :
     - la mécanique de boucle (accumulateur, pas fixe, interpolation),
     - contrôle vitesse (via l'état) et pause,
     - start/stop.
   Hors périmètre : ce que fait update() et render() (entités, scène) —
   ce sont des callbacks fournis par l'appelant.
   ===================================================================== */

import * as GameState from './state.js';

/* --------------------------------------------------------------------
   Constantes de cadence.
   -------------------------------------------------------------------- */
export const STEP_HZ = 60;                 // fréquence logique cible
export const FIXED_DT = 1 / STEP_HZ;       // durée d'un pas logique (s)

// Cible de performance du projet (décision assumée) :
//   - 60 FPS visés en régime normal,
//   - 30 FPS considérés comme un plancher acceptable lors des pics
//     (grosses vagues, nombreux effets). La boucle à pas fixe garantit
//     que la LOGIQUE reste juste même à 30 FPS : seuls les pas logiques
//     par frame doublent, le gameplay ne ralentit pas.
export const FPS_TARGET = 60;
export const FPS_FLOOR = 30;

// Garde-fou anti « spirale de la mort » : si l'onglet est resté en
// arrière-plan et que beaucoup de temps s'est accumulé, on plafonne le
// nombre de pas logiques par frame pour ne pas figer la page.
const MAX_STEPS_PER_FRAME = 240;           // ~4 s de retard rattrapable max

// Tolérance flottante : les soustractions successives de l'accumulateur
// dérivent (ex. 1.0 s donne 59 pas au lieu de 60 car le résidu tombe juste
// sous FIXED_DT). Comparer avec cet epsilon rend le décompte exact.
const EPSILON = FIXED_DT * 1e-3;

/* --------------------------------------------------------------------
   Fabrique de boucle.
   On passe par une fabrique (plutôt qu'un singleton) pour que la boucle
   soit instanciable et TESTABLE avec une horloge simulée.

   @param {object} opts
   @param {(dt:number)=>void}    opts.update  logique, appelée par pas fixe
   @param {(alpha:number)=>void} opts.render  rendu, alpha ∈ [0,1)
   @param {()=>number}           [opts.now]   horloge en ms (défaut performance.now)
   @param {(cb:Function)=>number}[opts.raf]   ordonnanceur (défaut requestAnimationFrame)
   @param {(id:number)=>void}    [opts.cancel]annulation (défaut cancelAnimationFrame)
   -------------------------------------------------------------------- */
export function createLoop({ update, render, now, raf, cancel } = {}) {
  if (typeof update !== 'function') throw new Error('createLoop: update requis');
  if (typeof render !== 'function') throw new Error('createLoop: render requis');

  // Horloge et ordonnanceur injectables (permettent les tests hors navigateur).
  const clock = now || (() => performance.now());
  const schedule = raf || ((cb) => requestAnimationFrame(cb));
  const unschedule = cancel || ((id) => cancelAnimationFrame(id));

  let running = false;
  let rafId = null;
  let lastTime = 0;
  let accumulator = 0;

  // Diagnostic (utile pour un compteur FPS plus tard).
  const stats = { fps: 0, stepsLastFrame: 0, frameCount: 0, dips: 0, minFps: Infinity };
  let fpsAccum = 0, fpsFrames = 0;

  /**
   * Une itération de boucle. Séparée de la planification pour être
   * appelable directement dans les tests avec un temps contrôlé.
   * @param {number} time  horodatage courant en ms
   */
  function tick(time) {
    // Delta réel depuis la dernière frame, en secondes.
    let frameTime = (time - lastTime) / 1000;
    lastTime = time;

    // Sécurité : un delta négatif ou absurde (onglet réveillé) est ignoré/clampé.
    if (!Number.isFinite(frameTime) || frameTime < 0) frameTime = 0;
    // Clamp haut : au-delà, on laissera le MAX_STEPS_PER_FRAME faire son office.
    if (frameTime > 0.25) frameTime = 0.25;

    const paused = GameState.get.paused();
    const speed = GameState.get.speed();   // 1, 2 ou 3

    // La pause gèle la LOGIQUE mais pas le rendu (on continue d'afficher).
    if (!paused) {
      // Accélération = plus de temps injecté = plus de pas logiques.
      accumulator += frameTime * speed;
    }

    // Consomme l'accumulateur par pas fixes identiques.
    // Le +EPSILON absorbe la dérive flottante des soustractions répétées.
    let steps = 0;
    while (accumulator >= FIXED_DT - EPSILON && steps < MAX_STEPS_PER_FRAME) {
      update(FIXED_DT);        // TOUJOURS le même dt : déterminisme.
      accumulator -= FIXED_DT;
      steps++;
    }
    // Après consommation, l'accumulateur peut être légèrement négatif à
    // cause de l'epsilon ; on le ramène à 0 pour un alpha propre.
    if (accumulator < 0) accumulator = 0;
    // Si on a atteint le plafond, on jette le retard résiduel pour ne pas
    // accumuler indéfiniment (évite la spirale de la mort).
    if (steps >= MAX_STEPS_PER_FRAME) accumulator = 0;

    // Facteur d'interpolation : où en est-on entre le dernier pas logique
    // et le prochain. Le rendu s'en sert pour lisser les positions.
    const alpha = accumulator / FIXED_DT;
    render(alpha);

    // Stats FPS (moyenne glissante sur ~0.5 s).
    stats.stepsLastFrame = steps;
    stats.frameCount++;
    fpsFrames++;
    fpsAccum += frameTime;
    if (fpsAccum >= 0.5) {
      stats.fps = Math.round(fpsFrames / fpsAccum);
      // Suivi des creux : on note si on passe sous le plancher acceptable.
      if (stats.fps < FPS_FLOOR) stats.dips++;
      if (stats.fps < stats.minFps) stats.minFps = stats.fps;
      fpsAccum = 0; fpsFrames = 0;
    }
  }

  function frame(time) {
    if (!running) return;
    tick(time);
    rafId = schedule(frame);
  }

  return {
    /** Démarre la boucle. Sans effet si déjà en cours. */
    start() {
      if (running) return;
      running = true;
      lastTime = clock();
      accumulator = 0;
      rafId = schedule(frame);
    },
    /** Arrête la boucle. */
    stop() {
      running = false;
      if (rafId != null) unschedule(rafId);
      rafId = null;
    },
    /** Expose l'itération unitaire pour les tests (horloge contrôlée). */
    tick,
    /** true si la boucle tourne. */
    get running() { return running; },
    /** Stats de diagnostic (fps, pas exécutés à la dernière frame). */
    stats,
    /** Constantes utiles. */
    FIXED_DT,
    STEP_HZ,
  };
}

/* --------------------------------------------------------------------
   Note interpolation :
   Les entités mobiles (ennemis, projectiles) stockeront `prevPos` et
   `pos`. Au rendu, la position affichée = lerp(prevPos, pos, alpha).
   Ce module fournit `alpha` ; l'application du lerp se fera dans le
   rendu des entités (Lots 2-3). On documente le contrat ici.
   -------------------------------------------------------------------- */

/* --------------------------------------------------------------------
   Exposition debug.
   -------------------------------------------------------------------- */
if (typeof window !== 'undefined') {
  window.__CF__ = window.__CF__ || {};
  window.__CF__.loopInfo = { STEP_HZ, FIXED_DT };
}
