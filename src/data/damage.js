/* =====================================================================
   Château Fort — Types de dégâts et résistances  (T3.8)
   ---------------------------------------------------------------------
   Introduit une profondeur type/dégât : chaque tour inflige un TYPE de
   dégât, chaque ennemi a des RÉSISTANCES et FAIBLESSES. Un ennemi
   résistant au feu prend visiblement moins de dégâts d'une tour de feu ;
   un ennemi faible au perçant en prend bien plus.

   Multiplicateurs marqués (choix de design) :
     - résiste  → ×0.4  (-60%)
     - neutre   → ×1.0
     - faible   → ×2.0  (+100%)
   ===================================================================== */

// Les 4 types de dégâts canoniques.
export const DamageType = Object.freeze({
  PIERCE: 'pierce',   // perçant  (baliste)
  BLUNT: 'blunt',     // contondant (archers)
  FIRE: 'fire',       // feu      (tour de mage)
  FROST: 'frost',     // givre    (tour de glace)
});

// Multiplicateurs.
export const RESIST = 0.4;   // -60%
export const NEUTRAL = 1.0;
export const WEAK = 2.0;     // +100%

// Type de dégât infligé par chaque tour (par id de tour).
export const TOWER_DAMAGE_TYPE = {
  archers: DamageType.BLUNT,
  baliste: DamageType.PIERCE,
  bucher: DamageType.FIRE,    // tour de mage
  glace: DamageType.FROST,
};

/* --------------------------------------------------------------------
   Matrice de résistances par ennemi.
   Pour chaque ennemi : { type: multiplicateur }. Absent = neutre (1.0).
   -------------------------------------------------------------------- */
export const RESISTANCES = {
  // Le chevalier en armure : résiste au contondant ET au perçant physique,
  // mais l'armure chauffe → FAIBLE au feu. (Remplace l'ancienne 'armor'.)
  chevalier: {
    [DamageType.BLUNT]: RESIST,
    [DamageType.PIERCE]: RESIST,
    [DamageType.FIRE]: WEAK,
  },
  // L'orc, épais : résiste un peu au contondant.
  orc: {
    [DamageType.BLUNT]: RESIST,
  },
  // L'éclaireur, agile et léger : faible partout au corps (perçant/contondant),
  // mais file vite. Ici on le rend faible au perçant (tir précis).
  eclaireur: {
    [DamageType.PIERCE]: WEAK,
  },
  // Le bélier de bois : très FAIBLE au feu, résiste au contondant.
  belier: {
    [DamageType.FIRE]: WEAK,
    [DamageType.BLUNT]: RESIST,
  },
  // Le serpent : sang-froid, résiste au givre ; faible au feu.
  serpent: {
    [DamageType.FROST]: RESIST,
    [DamageType.FIRE]: WEAK,
  },
  // Le cyclope, colosse : résiste au perçant (trop épais) et au contondant ;
  // le feu et le givre le prennent normalement.
  cyclope: {
    [DamageType.PIERCE]: RESIST,
    [DamageType.BLUNT]: RESIST,
  },
  // Le chaman : fragile, faible au feu (perturbe ses incantations).
  chaman: {
    [DamageType.FIRE]: WEAK,
  },
  // La gargouille, créature de pierre : les traits ricochent (résiste au
  // perçant), mais le contondant la brise (faible). Comme seuls archers
  // (contondant) et baliste (perçant) peuvent la viser, les ARCHERS
  // deviennent la vraie réponse anti-gargouille.
  gargouille: {
    [DamageType.PIERCE]: RESIST,
    [DamageType.BLUNT]: WEAK,
  },
  // Le porte-bouclier : le pavois bloque les traits (résiste au perçant),
  // mais son bois prend feu (faible au feu).
  porteBouclier: {
    [DamageType.PIERCE]: RESIST,
    [DamageType.FIRE]: WEAK,
  },
  // Le nécromancien : imprégné du froid de la mort (résiste au givre),
  // ses étoffes et ossements brûlent bien (faible au feu).
  necromancien: {
    [DamageType.FROST]: RESIST,
    [DamageType.FIRE]: WEAK,
  },
  // Le dragon : créature de feu (y résiste fortement), mais le froid
  // engourdit son vol (faible au givre). Volant → seuls archers/baliste
  // le touchent au sol ; le SORT de gel devient un contre précieux.
  dragon: {
    [DamageType.FIRE]: RESIST,
    [DamageType.FROST]: WEAK,
  },
};

/**
 * Multiplicateur de dégâts pour un type donné contre un ennemi donné.
 * @param {string} enemyId
 * @param {string} damageType  une valeur de DamageType
 * @returns {number} multiplicateur (RESIST / NEUTRAL / WEAK)
 */
export function damageMultiplier(enemyId, damageType) {
  const row = RESISTANCES[enemyId];
  if (!row || row[damageType] == null) return NEUTRAL;
  return row[damageType];
}

/** Étiquette lisible d'un type de dégât (pour l'info-bulle). */
export const DAMAGE_LABEL = {
  [DamageType.PIERCE]: 'Perçant',
  [DamageType.BLUNT]: 'Contondant',
  [DamageType.FIRE]: 'Feu',
  [DamageType.FROST]: 'Givre',
};

/**
 * Renvoie les résistances et faiblesses lisibles d'un ennemi, pour l'UI.
 * @returns {{ resist: string[], weak: string[] }}
 */
export function enemyResistanceInfo(enemyId) {
  const row = RESISTANCES[enemyId] || {};
  const resist = [], weak = [];
  for (const [type, mult] of Object.entries(row)) {
    if (mult < 1) resist.push(DAMAGE_LABEL[type]);
    else if (mult > 1) weak.push(DAMAGE_LABEL[type]);
  }
  return { resist, weak };
}
