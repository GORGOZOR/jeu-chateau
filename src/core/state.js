/* =====================================================================
   Château Fort — État central du jeu  (T1.2)
   ---------------------------------------------------------------------
   Rôle : source de vérité unique de la partie en cours. Tout le reste
   du jeu (systèmes, rendu, UI) lit et modifie l'état UNIQUEMENT via ce
   module — jamais en touchant les champs directement.

   Périmètre strict T1.2 :
     - structure d'état complète (or, PV, vague, entités, vitesse, pause, stats),
     - accesseurs (lecture) et mutateurs (écriture) contrôlés,
     - garantie des invariants (or ≥ 0, PV borné, vitesse valide…),
     - réinitialisation propre pour relancer une partie.

   Hors périmètre (tâches suivantes) :
     - le bus d'événements dédié (T1.3) : ici on expose un simple point
       d'accroche `onChange` que T1.3 viendra brancher, sans dépendance dure.
     - la boucle (T1.4), les entités réelles (Lots 2-3), l'UI (Lot 6).
   ===================================================================== */

/* --------------------------------------------------------------------
   Constantes de configuration de départ.
   Valeurs alignées sur le cahier des charges — à équilibrer plus tard (T7).
   Regroupées ici pour être ajustables en un seul endroit.
   -------------------------------------------------------------------- */
export const CONFIG = Object.freeze({
  START_GOLD: 160,
  CASTLE_HP: 20,
  SPEEDS: Object.freeze([1, 2, 3]), // vitesses autorisées
  FAVOR_MAX: 100,          // faveur max (ressource de sorts, T4.1)
  FAVOR_START: 40,         // faveur au départ
  FAVOR_REGEN: 4,          // faveur régénérée par seconde
});

/* --------------------------------------------------------------------
   Phases de jeu : décrit où en est la partie.
   Utilisé par les systèmes et l'UI pour savoir quoi afficher/autoriser.
   -------------------------------------------------------------------- */
export const Phase = Object.freeze({
  MENU:      'menu',       // hors partie
  PREPARE:   'prepare',    // entracte : on peut bâtir, aucune vague en cours
  WAVE:      'wave',       // une vague est active
  VICTORY:   'victory',    // toutes les vagues repoussées
  DEFEAT:    'defeat',     // les PV du château sont tombés à 0
});

/* --------------------------------------------------------------------
   État interne — NON exporté directement.
   On ne laisse personne muter cet objet à la main : tout passe par les
   fonctions ci-dessous. C'est l'exigence « pas de modification sauvage ».
   -------------------------------------------------------------------- */
function makeFreshState() {
  return {
    // Ressources
    gold: CONFIG.START_GOLD,
    hp: CONFIG.CASTLE_HP,
    maxHp: CONFIG.CASTLE_HP,
    favor: CONFIG.FAVOR_START,   // faveur pour les sorts (T4.1)
    favorMax: CONFIG.FAVOR_MAX,

    // Progression
    phase: Phase.MENU,
    waveIndex: -1,          // -1 = aucune vague lancée ; 0 = première vague
    totalWaves: 0,          // renseigné au chargement d'une carte (Lot 3)

    // Contrôle du temps
    speed: 1,               // doit appartenir à CONFIG.SPEEDS
    paused: false,

    // Entités actives — remplies par les systèmes des lots suivants.
    // On les déclare ici pour que la structure d'état soit complète et stable.
    enemies: [],
    towers: [],
    projectiles: [],

    // Statistiques cumulées de la partie (pour l'écran de fin, T6.5)
    stats: {
      kills: 0,
      goldEarned: 0,        // or gagné (kills + primes), hors dépenses
      leaks: 0,             // ennemis ayant atteint le château
      wavesCleared: 0,
    },
  };
}

let state = makeFreshState();

/* --------------------------------------------------------------------
   Point d'accroche pour la réactivité.
   T1.3 (bus d'événements) branchera ici une fonction qui rediffuse les
   changements. Tant que rien n'est branché, c'est un no-op : aucune
   dépendance dure, le module d'état reste autonome et testable seul.
   -------------------------------------------------------------------- */
let changeHook = null;
export function setChangeHook(fn) {
  changeHook = typeof fn === 'function' ? fn : null;
}
function notify(kind, payload) {
  if (changeHook) changeHook(kind, payload);
}

/* ====================================================================
   ACCESSEURS (lecture seule)
   Renvoient des copies pour les structures mutables, afin qu'un
   appelant ne puisse pas altérer l'état interne par référence.
   ==================================================================== */

export const get = {
  gold:        () => state.gold,
  hp:          () => state.hp,
  maxHp:       () => state.maxHp,
  favor:       () => state.favor,
  favorMax:    () => state.favorMax,
  phase:       () => state.phase,
  waveIndex:   () => state.waveIndex,
  totalWaves:  () => state.totalWaves,
  speed:       () => state.speed,
  paused:      () => state.paused,

  // Numéro de vague « humain » (1-based) pour l'affichage.
  waveNumber:  () => Math.max(0, state.waveIndex + 1),

  // Listes d'entités : on renvoie la référence réelle car les systèmes
  // ont besoin d'itérer/muter les entités en place à chaque frame (perf).
  // Le contrat : on ne remplace jamais le tableau, on le vide via les
  // fonctions dédiées. Les entités elles-mêmes seront gérées par leurs systèmes.
  enemies:     () => state.enemies,
  towers:      () => state.towers,
  projectiles: () => state.projectiles,

  // Stats : copie pour éviter toute mutation externe.
  stats:       () => ({ ...state.stats }),

  // Instantané complet (copie profonde légère) — pratique pour debug/UI.
  snapshot:    () => ({
    gold: state.gold, hp: state.hp, maxHp: state.maxHp,
    phase: state.phase, waveIndex: state.waveIndex, totalWaves: state.totalWaves,
    speed: state.speed, paused: state.paused,
    counts: {
      enemies: state.enemies.length,
      towers: state.towers.length,
      projectiles: state.projectiles.length,
    },
    stats: { ...state.stats },
  }),

  isGameOver:  () => state.phase === Phase.VICTORY || state.phase === Phase.DEFEAT,
};

/* ====================================================================
   MUTATEURS (écriture contrôlée)
   Chaque mutation garantit ses invariants et notifie le changement.
   ==================================================================== */

/* ---- Or ---------------------------------------------------------- */

// Ajoute de l'or (montant positif). Compté dans les gains si `earned`.
export function addGold(amount, { earned = true } = {}) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`addGold: montant invalide (${amount})`);
  }
  state.gold += amount;
  if (earned) state.stats.goldEarned += amount;
  notify('gold', state.gold);
  return state.gold;
}

// Tente de dépenser de l'or. Renvoie true si la dépense a eu lieu,
// false si les fonds sont insuffisants (l'état n'est alors pas modifié).
export function spendGold(amount) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`spendGold: montant invalide (${amount})`);
  }
  if (state.gold < amount) return false;
  state.gold -= amount;
  notify('gold', state.gold);
  return true;
}

// Vérifie si un montant est abordable sans rien modifier.
export function canAfford(amount) {
  return state.gold >= amount;
}

/* ---- Faveur (ressource de sorts, T4.1) -------------------------- */

// Régénère la faveur au fil du temps (bornée au max). Appelée chaque frame.
export function regenFavor(dt) {
  if (state.favor >= state.favorMax) return;
  state.favor = Math.min(state.favorMax, state.favor + CONFIG.FAVOR_REGEN * dt);
  notify('favor', state.favor);
}

// Vrai si assez de faveur pour lancer un sort de coût `amount`.
export function canCastFavor(amount) {
  return state.favor >= amount;
}

// Dépense de la faveur (pour un sort). Renvoie false si insuffisant.
export function spendFavor(amount) {
  if (state.favor < amount) return false;
  state.favor -= amount;
  notify('favor', state.favor);
  return true;
}

/* ---- PV du château ---------------------------------------------- */

// Inflige des dégâts au château. PV borné à 0. Déclenche la défaite si 0.
export function damageCastle(amount = 1) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`damageCastle: montant invalide (${amount})`);
  }
  state.hp = Math.max(0, state.hp - amount);
  state.stats.leaks += 1;
  notify('hp', state.hp);
  if (state.hp === 0 && state.phase !== Phase.DEFEAT) {
    setPhase(Phase.DEFEAT);
  }
  return state.hp;
}

// Soigne le château, borné à maxHp (utile pour d'éventuels bonus).
export function healCastle(amount) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`healCastle: montant invalide (${amount})`);
  }
  state.hp = Math.min(state.maxHp, state.hp + amount);
  notify('hp', state.hp);
  return state.hp;
}

/* ---- Contrôle du temps ------------------------------------------ */

// Fixe la vitesse. N'accepte que les vitesses de CONFIG.SPEEDS.
export function setSpeed(speed) {
  if (!CONFIG.SPEEDS.includes(speed)) {
    throw new Error(`setSpeed: vitesse non autorisée (${speed})`);
  }
  state.speed = speed;
  notify('speed', state.speed);
  return state.speed;
}

export function setPaused(paused) {
  state.paused = !!paused;
  notify('paused', state.paused);
  return state.paused;
}

export function togglePaused() {
  return setPaused(!state.paused);
}

/* ---- Phase et progression --------------------------------------- */

export function setPhase(phase) {
  const valid = Object.values(Phase).includes(phase);
  if (!valid) throw new Error(`setPhase: phase inconnue (${phase})`);
  const previous = state.phase;
  state.phase = phase;
  notify('phase', { phase, previous });
  return state.phase;
}

// Définit le nombre total de vagues (au chargement d'une carte).
export function setTotalWaves(n) {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`setTotalWaves: valeur invalide (${n})`);
  }
  state.totalWaves = n;
  notify('totalWaves', n);
}

// Avance à la vague suivante. Renvoie le nouvel index, ou -1 s'il n'y a
// plus de vague (l'appelant décide alors de la victoire).
export function advanceWave() {
  if (state.waveIndex + 1 >= state.totalWaves) {
    return -1;
  }
  state.waveIndex += 1;
  notify('wave', state.waveIndex);
  return state.waveIndex;
}

// Marque la vague courante comme nettoyée (stat).
export function markWaveCleared() {
  state.stats.wavesCleared += 1;
  notify('waveCleared', state.stats.wavesCleared);
}

/* ---- Statistiques ------------------------------------------------ */

// Enregistre un ennemi tué (stat + gain d'or associé).
export function registerKill(goldReward = 0) {
  state.stats.kills += 1;
  if (goldReward > 0) addGold(goldReward, { earned: true });
  notify('kill', state.stats.kills);
}

/* ---- Entités ----------------------------------------------------- */
/* Ajouts/retraits contrôlés pour préserver le contrat « on ne remplace
   jamais le tableau ». Les entités concrètes viennent aux Lots 2-3 ;
   ces fonctions posent l'interface stable dès maintenant. */

export function addEnemy(e)      { state.enemies.push(e); return e; }
export function addTower(t)      { state.towers.push(t); return t; }
export function addProjectile(p) { state.projectiles.push(p); return p; }

// Retrait par identité (référence). Silencieux si l'entité est absente.
function removeFrom(list, item) {
  const i = list.indexOf(item);
  if (i !== -1) list.splice(i, 1);
}
export function removeEnemy(e)      { removeFrom(state.enemies, e); }
export function removeTower(t)      { removeFrom(state.towers, t); }
export function removeProjectile(p) { removeFrom(state.projectiles, p); }

/* ====================================================================
   RÉINITIALISATION
   Remet l'état à neuf pour (re)commencer une partie. Vide les tableaux
   EN PLACE pour ne jamais casser une référence détenue par un système.
   ==================================================================== */

export function reset() {
  const fresh = makeFreshState();

  // Champs scalaires
  state.gold = fresh.gold;
  state.hp = fresh.hp;
  state.maxHp = fresh.maxHp;
  state.phase = fresh.phase;
  state.waveIndex = fresh.waveIndex;
  state.totalWaves = fresh.totalWaves;
  state.speed = fresh.speed;
  state.paused = fresh.paused;

  // Tableaux : on vide en place (length = 0) plutôt que réassigner.
  state.enemies.length = 0;
  state.towers.length = 0;
  state.projectiles.length = 0;

  // Stats
  state.stats.kills = 0;
  state.stats.goldEarned = 0;
  state.stats.leaks = 0;
  state.stats.wavesCleared = 0;

  notify('reset', null);
}

/* --------------------------------------------------------------------
   Exposition debug (console navigateur) : window.__CF__.state
   Branché ici de façon défensive (utile en dev, sans effet en test Node).
   -------------------------------------------------------------------- */
if (typeof window !== 'undefined') {
  window.__CF__ = window.__CF__ || {};
  window.__CF__.state = { get, snapshot: get.snapshot, Phase, CONFIG };
}
