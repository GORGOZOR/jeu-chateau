/* =====================================================================
   Château Fort — Vagues de la carte « Plaine »  (T3.9)
   ---------------------------------------------------------------------
   15 vagues scriptées, difficulté croissante. Chaque vague est une liste
   de GROUPES ; un groupe fait apparaître `count` ennemis d'un `type` tous
   les `interval` secondes, après un `delay` initial.

   Vagues de boss aux paliers : 5 (bélier), 10 (serpent), 15 (cyclope).

   Format d'un groupe :
     { type, count, interval, delay, elite? }
   ===================================================================== */

export const PLAINE_WAVES = [
  // 1 — prise en main : quelques gobelins.
  [ { type: 'gobelin', count: 6, interval: 0.9, delay: 0 } ],

  // 2 — gobelins plus nombreux + premiers orcs.
  [ { type: 'gobelin', count: 6, interval: 0.7, delay: 0 },
    { type: 'orc', count: 2, interval: 1.5, delay: 6 } ],

  // 3 — éclaireurs rapides (test de ciblage) + orcs.
  [ { type: 'eclaireur', count: 6, interval: 0.6, delay: 0 },
    { type: 'orc', count: 4, interval: 1.4, delay: 4 } ],

  // 4 — premiers chevaliers (armure) : force à varier les dégâts.
  [ { type: 'orc', count: 4, interval: 1.0, delay: 0 },
    { type: 'chevalier', count: 2, interval: 2.0, delay: 5 } ],

  // 5 — BOSS : bélier de siège + escorte.
  [ { type: 'gobelin', count: 8, interval: 0.5, delay: 0 },
    { type: 'belier', count: 1, interval: 1, delay: 4 } ],

  // 6 — chaman (soigne) + premières GARGOUILLES volantes : il faut des
  // archers ou une baliste pour les atteindre.
  [ { type: 'chaman', count: 2, interval: 3, delay: 0 },
    { type: 'orc', count: 6, interval: 0.9, delay: 2 },
    { type: 'gargouille', count: 2, interval: 1.2, delay: 8 } ],

  // 7 — vague de chevaliers (mur d'armure).
  [ { type: 'chevalier', count: 5, interval: 1.4, delay: 0 },
    { type: 'chaman', count: 1, interval: 1, delay: 6 } ],

  // 8 — nuée d'éclaireurs + gobelins (saturation) + gargouilles.
  [ { type: 'eclaireur', count: 10, interval: 0.4, delay: 0 },
    { type: 'gobelin', count: 12, interval: 0.4, delay: 3 },
    { type: 'gargouille', count: 3, interval: 0.8, delay: 5 } ],

  // 9 — mixte lourd : orcs, chevaliers, chamans + PORTE-BOUCLIERS
  // (bouclier régénérant : dégâts soutenus requis).
  [ { type: 'orc', count: 8, interval: 0.7, delay: 0 },
    { type: 'chevalier', count: 3, interval: 1.6, delay: 4 },
    { type: 'porteBouclier', count: 2, interval: 2, delay: 6 },
    { type: 'chaman', count: 2, interval: 3, delay: 8 } ],

  // 10 — BOSS : serpent géant + escorte rapide.
  [ { type: 'eclaireur', count: 10, interval: 0.5, delay: 0 },
    { type: 'serpent', count: 1, interval: 1, delay: 5 },
    { type: 'orc', count: 6, interval: 1.2, delay: 8 },
    { type: 'chevalier', count: 2, interval: 1.6, delay: 10 } ],

  // 11 — chevaliers soignés + premier NÉCROMANCIEN (invoque des renforts).
  [ { type: 'chevalier', count: 6, interval: 1.2, delay: 0 },
    { type: 'chaman', count: 3, interval: 2.5, delay: 3 },
    { type: 'necromancien', count: 1, interval: 1, delay: 6 },
    { type: 'porteBouclier', count: 2, interval: 2, delay: 9 } ],

  // 12 — première élite (gobelins & orcs dorés).
  [ { type: 'orc', count: 6, interval: 0.8, delay: 0, elite: true },
    { type: 'gobelin', count: 10, interval: 0.4, delay: 4 } ],

  // 13 — double boss : bélier + serpent, escortés d'un nécromancien.
  [ { type: 'belier', count: 1, interval: 1, delay: 0 },
    { type: 'serpent', count: 1, interval: 1, delay: 6 },
    { type: 'necromancien', count: 1, interval: 1, delay: 4 },
    { type: 'chaman', count: 2, interval: 3, delay: 3 },
    { type: 'chevalier', count: 3, interval: 1.4, delay: 5 },
    { type: 'orc', count: 4, interval: 1.0, delay: 9 } ],

  // 14 — vague d'élites variées (avant-dernier palier).
  [ { type: 'chevalier', count: 2, interval: 1.2, delay: 0, elite: true },
    { type: 'eclaireur', count: 8, interval: 0.4, delay: 3 },
    { type: 'gargouille', count: 3, interval: 0.9, delay: 4 },
    { type: 'porteBouclier', count: 1, interval: 2, delay: 7, elite: true },
    { type: 'orc', count: 3, interval: 1.0, delay: 6, elite: true } ],

  // 15 — BOSS FINAL : cyclope + serpent d'élite + horde + air + renforts.
  [ { type: 'cyclope', count: 1, interval: 1, delay: 0 },
    { type: 'dragon', count: 1, interval: 1, delay: 10 },   // boss volant final
    { type: 'serpent', count: 1, interval: 1, delay: 5, elite: true },
    { type: 'necromancien', count: 2, interval: 3, delay: 4 },
    { type: 'gargouille', count: 4, interval: 0.7, delay: 6 },
    { type: 'chaman', count: 3, interval: 2, delay: 3 },
    { type: 'gobelin', count: 15, interval: 0.3, delay: 8 } ],
];

/* --------------------------------------------------------------------
   Niveaux de difficulté : modulent les PV des ennemis et les récompenses.
   -------------------------------------------------------------------- */
export const DIFFICULTIES = {
  normal: { label: 'Normal', hpMult: 1.0, goldMult: 1.0 },
  hard: { label: 'Difficile', hpMult: 1.6, goldMult: 1.25 },
};

/** Nombre total d'ennemis d'une vague (pour l'affichage / la détection de fin). */
export function waveEnemyCount(wave) {
  return wave.reduce((sum, g) => sum + g.count, 0);
}
