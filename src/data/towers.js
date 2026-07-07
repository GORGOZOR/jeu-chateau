/* =====================================================================
   Château Fort — Données des tours  (T3.5)
   ---------------------------------------------------------------------
   Les 5 tours du jeu, chacune avec 3 niveaux d'amélioration. Tout est en
   configuration : stats, coûts, apparence. Équilibrage ajustable ici sans
   toucher au code (l'équilibrage fin est le Lot 7).

   Stats par niveau :
     - damage    : dégâts par tir (ou par seconde pour le DoT)
     - range     : portée (unités monde)
     - fireRate  : tirs par seconde (cadence)
     - cost      : coût d'achat (niveau 1) ou d'amélioration (niveaux 2-3)
     - special   : effet particulier (armorPierce, aoe, dot, slow…)

   Basé sur le cahier des charges §2.3 (valeurs niveau 1 indicatives).
   ===================================================================== */

export const TOWER_TYPES = {
  archers: {
    id: 'archers',
    name: 'Tour d\'archers',
    role: 'Dégâts monocible équilibrés',
    color: 0x8a5a3a,          // bois
    accent: 0x6a8a4a,          // toit vert
    projectile: 'arrow',
    levels: [
      { damage: 10, range: 12, fireRate: 1.5, cost: 50 },
      { damage: 18, range: 14, fireRate: 1.8, cost: 60 },
      { damage: 30, range: 16, fireRate: 2.2, cost: 90 },
    ],
  },
  baliste: {
    id: 'baliste',
    name: 'Baliste',
    role: 'Gros dégâts, lente, perce-armure',
    color: 0x6a5a4a,
    accent: 0x3a2a1a,
    projectile: 'bolt',
    special: 'armorPierce',
    levels: [
      { damage: 45, range: 18, fireRate: 0.4, cost: 100 },
      { damage: 75, range: 20, fireRate: 0.5, cost: 120 },
      { damage: 120, range: 22, fireRate: 0.6, cost: 160 },
    ],
  },
  bucher: {
    id: 'bucher',
    name: 'Tour de mage',
    role: 'Boules de feu — dégâts sur la durée (DoT)',
    color: 0x8a8a92,          // pierre
    accent: 0xff5a2a,          // feu
    projectile: 'fireball',
    special: 'dot',
    levels: [
      { damage: 7, range: 10, fireRate: 1.0, cost: 80 },   // damage = dégâts/seconde
      { damage: 13, range: 12, fireRate: 1.0, cost: 100 },
      { damage: 20, range: 14, fireRate: 1.0, cost: 140 },
    ],
  },
  glace: {
    id: 'glace',
    name: 'Tour de glace',
    role: 'Ralentit les ennemis',
    color: 0x6a8aaa,
    accent: 0xcceeff,
    projectile: 'frostbolt',
    special: 'slow',
    slowFactor: 0.5,           // réduit la vitesse de 50%
    slowDuration: 2,           // secondes
    levels: [
      { damage: 5, range: 12, fireRate: 1.0, cost: 70 },
      { damage: 9, range: 14, fireRate: 1.2, cost: 90 },
      { damage: 15, range: 16, fireRate: 1.5, cost: 130 },
    ],
  },
};

/** Taux de remboursement à la revente (cahier des charges §2.3). */
export const SELL_REFUND = 0.7;

/* --------------------------------------------------------------------
   Spécialisations de niveau 3 (T3.6).
   Quand une tour atteint le niveau 3, le joueur choisit UNE des deux
   branches. Chaque branche applique des modificateurs aux stats de base
   du niveau 3 et/ou un effet distinct. `apply` renvoie les stats modifiées.
   -------------------------------------------------------------------- */
export const SPECIALIZATIONS = {
  archers: [
    {
      id: 'rapid', name: 'Tir rapide',
      desc: 'Cadence de tir fortement accrue.',
      cost: 60,
      apply: (s) => ({ ...s, fireRate: s.fireRate * 2.0 }),
    },
    {
      id: 'sniper', name: 'Longue portée',
      desc: 'Portée et dégâts accrus, tir perçant.',
      cost: 60,
      apply: (s) => ({ ...s, range: s.range * 1.5, damage: Math.round(s.damage * 1.6) }),
    },
  ],
  baliste: [
    {
      id: 'piercer', name: 'Perce-armure renforcé',
      desc: 'Dégâts massifs, ignore toute armure.',
      cost: 120,
      apply: (s) => ({ ...s, damage: Math.round(s.damage * 1.7) }),
      special: 'armorPierce',
    },
    {
      id: 'multishot', name: 'Tir multiple',
      desc: 'Touche jusqu\'à 3 ennemis alignés.',
      cost: 120,
      apply: (s) => ({ ...s, damage: Math.round(s.damage * 0.8) }),
      special: 'multishot', multishotCount: 3,
    },
  ],
  bucher: [ // tour de mage
    {
      id: 'inferno', name: 'Brasier',
      desc: 'Brûlure intense (dégâts/seconde très accrus).',
      cost: 100,
      apply: (s) => ({ ...s, damage: Math.round(s.damage * 1.8) }),
      special: 'dot',
    },
    {
      id: 'meteors', name: 'Boules multiples',
      desc: 'Portée accrue, brûle une plus large zone.',
      cost: 100,
      apply: (s) => ({ ...s, range: s.range * 1.4 }),
      special: 'dot',
    },
  ],
  glace: [
    {
      id: 'deepfreeze', name: 'Gel intense',
      desc: 'Ralentissement plus fort et plus long.',
      cost: 90,
      apply: (s) => ({ ...s }),
      special: 'slow', slowFactor: 0.3, slowDuration: 3.5,
    },
    {
      id: 'blizzard', name: 'Givre étendu',
      desc: 'Portée accrue, ralentit une zone.',
      cost: 90,
      apply: (s) => ({ ...s, range: s.range * 1.4 }),
      special: 'slowAoe', slowFactor: 0.5, slowDuration: 2, aoeRadius: 3,
    },
  ],
};

/** Renvoie les deux branches de spécialisation d'un type de tour. */
export function getSpecializations(typeId) {
  return SPECIALIZATIONS[typeId] || [];
}

/** Coût total investi dans une tour jusqu'au niveau `level` (1-indexé). */
export function totalInvested(typeId, level) {
  const t = TOWER_TYPES[typeId];
  let sum = 0;
  for (let i = 0; i < level; i++) sum += t.levels[i].cost;
  return sum;
}

/** Valeur de revente d'une tour de niveau `level`. */
export function sellValue(typeId, level) {
  return Math.floor(totalInvested(typeId, level) * SELL_REFUND);
}
