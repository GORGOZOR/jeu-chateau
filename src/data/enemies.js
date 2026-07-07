/* =====================================================================
   Château Fort — Données des ennemis  (T3.7)
   ---------------------------------------------------------------------
   Les 6 archétypes du cahier des charges (§2.4), chacun forçant une
   réponse tactique différente, plus des variantes d'ÉLITE (plus de PV,
   aspect doré). Tout en configuration : PV, vitesse, or, comportements.

   Comportements :
     - armor       : réduit les dégâts non perçants d'un pourcentage
     - heal        : soigne périodiquement les ennemis proches (chaman)
     - boss        : gros dégâts au château s'il atteint la porte
     - evasive     : petit/rapide, difficile à cibler (visuel)
   ===================================================================== */

import * as THREE from 'three';

export const ENEMY_TYPES = {
  gobelin: {
    id: 'gobelin', name: 'Gobelin',
    hp: 30, speed: 3.2, gold: 3,
    color: 0x5a8a3a, size: 0.6,
    model: 'chicken',       // modèle Chicken (sinon fallback procédural)
    modelScale: 0.9,        // à ajuster visuellement
    anims: { move: 'Walk', death: 'Death', hit: 'HitRecieve' },
    tactic: 'Nombreux et faibles',
  },
  orc: {
    id: 'orc', name: 'Orc',
    hp: 80, speed: 2.2, gold: 6,
    color: 0x3a6a2a, size: 0.85,
    model: 'orc', modelScale: 1.3,
    anims: { move: 'Walk', death: 'Death', hit: 'HitRecieve' },
    tactic: 'Équilibré, résistant',
  },
  chevalier: {
    id: 'chevalier', name: 'Chevalier renégat',
    hp: 150, speed: 1.5, gold: 12,
    color: 0x8a8a9a, size: 0.9,
    armor: 0.5,        // réduit de 50% les dégâts non perçants
    model: 'mushroomking', modelScale: 1.35,
    anims: { move: 'Walk', death: 'Death', hit: 'HitReact' },
    tactic: 'Armure : vulnérable au perçant et au feu',
  },
  eclaireur: {
    id: 'eclaireur', name: 'Éclaireur',
    hp: 20, speed: 4.5, gold: 5,
    color: 0x9a7a4a, size: 0.5,
    model: 'ninja', modelScale: 0.75,
    anims: { move: 'Run', death: 'Death', hit: 'HitReact' },
    evasive: true,     // très rapide, petit
    tactic: 'Très rapide, difficile à cibler',
  },
  belier: {
    id: 'belier', name: 'Bélier de siège',
    hp: 400, speed: 1.0, gold: 25,
    color: 0x6a4a2a, size: 1.3,
    boss: true, castleDamage: 5, // 5 PV au château au lieu de 1
    tactic: 'Boss de vague, gros dégâts au château',
  },
  chaman: {
    id: 'chaman', name: 'Chaman',
    hp: 60, speed: 2.2, gold: 15,
    color: 0x7a3a8a, size: 0.75,
    model: 'wizard', modelScale: 1.1,
    anims: { move: 'Walk', death: 'Death', hit: 'HitRecieve' },
    heal: { radius: 5, amount: 8, interval: 1.5 }, // soigne 8 PV/1.5s dans 5u
    tactic: 'Soigne les alliés proches — à prioriser',
  },
  serpent: {
    id: 'serpent', name: 'Serpent géant',
    hp: 300, speed: 3.6, gold: 30,
    color: 0x2a8a5a, size: 0.9,
    boss: true, castleDamage: 4,
    serpent: true, segments: 6,   // long corps ondulant
    tactic: 'Boss rapide — frappe vite malgré ses PV',
  },
  cyclope: {
    id: 'cyclope', name: 'Cyclope',
    hp: 900, speed: 0.8, gold: 40,
    color: 0x8a6a4a, size: 1.7,
    boss: true, castleDamage: 6,
    model: 'yeti', modelScale: 2.5,
    anims: { move: 'Walk', death: 'Death', hit: 'HitReact' },
    tactic: 'Boss très tanky — un mur à abattre',
  },
  // --- Ennemis à capacités (T4.3) ---
  gargouille: {
    id: 'gargouille', name: 'Gargouille',
    hp: 70, speed: 3.0, gold: 12,
    color: 0x6a6a7a, size: 0.7,
    flying: true,        // volante : seules archers + baliste la ciblent
    flyHeight: 3.2,
    model: 'demon', modelScale: 1.05,
    anims: { move: 'Flying_Idle' },
    noDeathAnim: true,
    tactic: 'Volante — seules les tours à longue portée l\'atteignent',
  },
  porteBouclier: {
    id: 'porteBouclier', name: 'Porte-bouclier',
    hp: 100, speed: 1.6, gold: 14,
    color: 0x4a6a8a, size: 0.9,
    model: 'bluedemon', modelScale: 1.35,
    anims: { move: 'Walk', death: 'Death', hit: 'HitReact' },
    shield: { amount: 120, regen: 25, regenDelay: 2.5 }, // bouclier régénérant
    tactic: 'Bouclier régénérant — dégâts soutenus requis',
  },
  necromancien: {
    id: 'necromancien', name: 'Nécromancien',
    hp: 90, speed: 1.8, gold: 20,
    color: 0x5a2a6a, size: 0.8,
    summon: { type: 'gobelin', count: 2, interval: 4 }, // invoque des gobelins
    model: 'fish', modelScale: 1.2,
    anims: { move: 'Walk', death: 'Death', hit: 'HitRecieve' },
    tactic: 'Invoque des renforts — à éliminer vite',
  },
  // --- Boss modélisé (T5.1) : vrai modèle glTF animé, volant ---
  dragon: {
    id: 'dragon', name: 'Dragon',
    hp: 700, speed: 1.6, gold: 60,
    color: 0x8a3a2a, size: 1.4,
    boss: true, castleDamage: 8,
    flying: true, flyHeight: 4.5,
    model: 'dragon',        // clé du modèle chargé (sinon fallback procédural)
    modelScale: 1.6,        // ajuste la taille du modèle au jeu
    anims: { move: 'Fast_Flying', death: 'Death', hit: 'HitReact' },
    tactic: 'Boss volant — seules les tours à longue portée l\'atteignent',
  },
};

/* --------------------------------------------------------------------
   Variantes d'élite : mêmes archétypes, plus coriaces, aspect doré.
   -------------------------------------------------------------------- */
export const ELITE_MODIFIER = {
  hpMult: 3,          // 3x plus de PV
  goldMult: 3,        // 3x plus d'or
  color: 0xd4af37,    // doré
  emissive: 0x5a4010, // léger éclat doré
  scale: 1.25,
};

/** Construit la config finale d'un ennemi (normal ou élite).
 *  @param {string} typeId
 *  @param {boolean} elite
 *  @param {{hpMult?:number, goldMult?:number}} [mods]  modificateurs de difficulté
 */
/* --------------------------------------------------------------------
   Auras d'élite (T4.3+) : une élite porte aléatoirement UNE aura qui
   affecte une zone autour d'elle.
     - healAura  : soigne les ennemis proches (cercle vert)
     - hasteAura : accélère les ennemis proches (zone violette)
     - disable   : désactive la tour la plus proche à portée (grise la tour)
   -------------------------------------------------------------------- */
export const ELITE_AURAS = {
  healAura: {
    id: 'healAura', color: 0x33dd66, radius: 5,
    heal: 10, interval: 1.0,     // 10 PV/s aux alliés proches
  },
  hasteAura: {
    id: 'hasteAura', color: 0xaa44ee, radius: 5,
    speedMult: 1.5,              // +50% de vitesse pour les alliés proches
  },
  disable: {
    id: 'disable', color: 0xdd4444, radius: 7,
    // désactive la tour la plus proche tant que l'élite est à portée
  },
};
export const ELITE_AURA_IDS = Object.keys(ELITE_AURAS);

function pickRandomAura() {
  return ELITE_AURA_IDS[Math.floor(Math.random() * ELITE_AURA_IDS.length)];
}

export function makeEnemyConfig(typeId, elite = false, mods = {}) {
  const base = ENEMY_TYPES[typeId];
  if (!base) throw new Error('Type d\'ennemi inconnu : ' + typeId);
  const hpMult = mods.hpMult ?? 1;
  const goldMult = mods.goldMult ?? 1;
  const cfg = elite
    ? {
        ...base, elite: true,
        name: base.name + ' d\'élite',
        hp: Math.round(base.hp * ELITE_MODIFIER.hpMult),
        gold: Math.round(base.gold * ELITE_MODIFIER.goldMult),
        color: ELITE_MODIFIER.color,
        emissive: ELITE_MODIFIER.emissive,
        size: base.size * ELITE_MODIFIER.scale,
        aura: mods.aura || pickRandomAura(),  // 1 aura aléatoire (ou forcée)
      }
    : { ...base, elite: false };
  // Modificateurs de difficulté appliqués par-dessus (PV et or).
  cfg.hp = Math.round(cfg.hp * hpMult);
  cfg.gold = Math.round(cfg.gold * goldMult);
  return cfg;
}

/** Liste des types disponibles. */
export const ENEMY_IDS = Object.keys(ENEMY_TYPES);
