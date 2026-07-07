/* =====================================================================
   Château Fort — Bus d'événements interne  (T1.3)
   ---------------------------------------------------------------------
   Rôle : découpler les producteurs (état, systèmes) des consommateurs
   (UI, effets, audio). Un système émet « ennemi tué » sans savoir qui
   écoute ; l'UI, les particules et le son s'y abonnent chacun de leur côté.

   Périmètre strict T1.3 :
     - émetteur/écouteur générique : on / once / off / emit,
     - catalogue des événements standard (constantes nommées),
     - branchement sur le crochet d'état (setChangeHook) posé en T1.2,
       de sorte que chaque mutation d'état rediffuse un événement propre.

   Hors périmètre : la boucle (T1.4), les entités, l'UI réelle.
   ===================================================================== */

import * as GameState from './state.js';

/* --------------------------------------------------------------------
   Catalogue des événements.
   Utiliser ces constantes plutôt que des chaînes en dur évite les fautes
   de frappe silencieuses (un abonnement à 'enemykilled' ne recevrait rien).
   -------------------------------------------------------------------- */
export const Events = Object.freeze({
  // Cycle de ressources / château
  GOLD_CHANGED:  'goldChanged',
  HP_CHANGED:    'hpChanged',

  // Combat
  ENEMY_KILLED:  'enemyKilled',
  ENEMY_LEAKED:  'enemyLeaked',   // ennemi ayant atteint le château

  // Progression
  WAVE_STARTED:  'waveStarted',
  WAVE_CLEARED:  'waveCleared',
  PHASE_CHANGED: 'phaseChanged',

  // Contrôle du temps
  SPEED_CHANGED: 'speedChanged',
  PAUSE_CHANGED: 'pauseChanged',

  // Partie
  GAME_RESET:    'gameReset',
  VICTORY:       'victory',
  DEFEAT:        'defeat',
});

/* --------------------------------------------------------------------
   Le bus : une table nom_d'événement -> ensemble d'abonnés.
   On utilise un Set pour éviter les doublons et permettre un retrait O(1).
   -------------------------------------------------------------------- */
const listeners = new Map();

/**
 * S'abonner à un événement.
 * @param {string} type  nom de l'événement (idéalement une valeur de Events)
 * @param {function} handler  fonction (payload) => void
 * @returns {function} une fonction à appeler pour se désabonner
 */
export function on(type, handler) {
  if (typeof handler !== 'function') {
    throw new Error(`on: handler doit être une fonction (événement "${type}")`);
  }
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(handler);
  // Renvoie un désabonneur pratique : const off = on(...); off();
  return () => off(type, handler);
}

/**
 * S'abonner pour un seul déclenchement, puis se désabonner automatiquement.
 */
export function once(type, handler) {
  if (typeof handler !== 'function') {
    throw new Error(`once: handler doit être une fonction (événement "${type}")`);
  }
  const wrapper = (payload) => {
    off(type, wrapper);
    handler(payload);
  };
  return on(type, wrapper);
}

/**
 * Se désabonner. Silencieux si l'abonnement n'existe pas.
 */
export function off(type, handler) {
  const set = listeners.get(type);
  if (!set) return;
  set.delete(handler);
  if (set.size === 0) listeners.delete(type);
}

/**
 * Émettre un événement vers tous les abonnés.
 * Les erreurs d'un abonné sont isolées (journalisées) pour ne pas empêcher
 * les autres abonnés de recevoir l'événement — robustesse en production.
 */
export function emit(type, payload) {
  const set = listeners.get(type);
  if (!set || set.size === 0) return;
  // Copie défensive : un handler peut se désabonner pendant l'itération.
  for (const handler of [...set]) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[events] erreur dans un abonné de "${type}" :`, err);
    }
  }
}

/**
 * Retire tous les abonnés (tous événements). Utile pour les tests
 * ou une réinitialisation complète de l'application.
 */
export function clearAll() {
  listeners.clear();
}

/**
 * Nombre d'abonnés pour un type donné (diagnostic / tests).
 */
export function listenerCount(type) {
  const set = listeners.get(type);
  return set ? set.size : 0;
}

/* --------------------------------------------------------------------
   Pont État -> Bus.
   L'état (T1.2) appelle son `notify(kind, payload)` à chaque mutation.
   On traduit ces notifications brutes en événements nommés du catalogue.
   C'est ici que le crochet préparé en T1.2 prend tout son sens.
   -------------------------------------------------------------------- */
function bridgeStateToBus(kind, payload) {
  switch (kind) {
    case 'gold':
      emit(Events.GOLD_CHANGED, payload);
      break;
    case 'hp':
      emit(Events.HP_CHANGED, payload);
      break;
    case 'speed':
      emit(Events.SPEED_CHANGED, payload);
      break;
    case 'paused':
      emit(Events.PAUSE_CHANGED, payload);
      break;
    case 'wave':
      // payload = index de la vague qui démarre
      emit(Events.WAVE_STARTED, payload);
      break;
    case 'waveCleared':
      emit(Events.WAVE_CLEARED, payload);
      break;
    case 'kill':
      // Note : registerKill met à jour aussi l'or ; l'event kill porte le total.
      emit(Events.ENEMY_KILLED, payload);
      break;
    case 'phase':
      // payload = { phase, previous }
      emit(Events.PHASE_CHANGED, payload);
      // Événements de commodité pour la fin de partie.
      if (payload && payload.phase === GameState.Phase.VICTORY) emit(Events.VICTORY, payload);
      if (payload && payload.phase === GameState.Phase.DEFEAT)  emit(Events.DEFEAT, payload);
      break;
    case 'reset':
      emit(Events.GAME_RESET, null);
      break;
    // 'totalWaves' n'a pas d'événement dédié pour l'instant : ignoré volontairement.
  }
}

/**
 * Active le pont entre l'état et le bus.
 * À appeler une fois au démarrage (depuis main.js).
 */
export function connectStateBridge() {
  GameState.setChangeHook(bridgeStateToBus);
}

/* --------------------------------------------------------------------
   Note sur ENEMY_LEAKED :
   la « fuite » d'un ennemi est un événement de gameplay émis par le
   système de combat (Lot 3), pas une mutation d'état brute. On expose
   donc juste la constante ; l'émission se fera là où l'info est connue
   (quel ennemi, combien de dégâts). En attendant, damageCastle côté état
   émet déjà HP_CHANGED, ce qui suffit à l'UI pour réagir.
   -------------------------------------------------------------------- */

/* --------------------------------------------------------------------
   Exposition debug (console navigateur).
   -------------------------------------------------------------------- */
if (typeof window !== 'undefined') {
  window.__CF__ = window.__CF__ || {};
  window.__CF__.events = { on, once, off, emit, Events, listenerCount };
}
