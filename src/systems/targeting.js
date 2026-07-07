/* =====================================================================
   Château Fort — Modes de ciblage des tours  (T4.5)
   ---------------------------------------------------------------------
   Chaque tour a un MODE DE CIBLAGE réglable qui décide QUELLE cible
   choisir parmi les ennemis valides (vivants, ciblables, à portée) :

     - first     : le plus avancé sur le chemin (défaut, classique du TD)
     - last      : le moins avancé (utile pour laisser mariner dans la zone)
     - nearest   : le plus proche de la tour
     - strongest : le plus de PV restants (concentrer sur les blindés)
     - weakest   : le moins de PV (achever les blessés, or plus vite)
     - flying    : priorise les volants s'il y en a, sinon retombe sur first

   Le FILTRAGE (vivant, à portée, volant ciblable ou non) reste la
   responsabilité de la tour ; le mode ne fait que CHOISIR parmi les
   candidats déjà valides. Ainsi une tour qui ne peut pas viser les
   volants ne les verra jamais, quel que soit son mode.
   ===================================================================== */

export const TARGET_MODES = {
  first: {
    id: 'first', label: 'Premier',
    desc: 'Cible l\'ennemi le plus avancé sur le chemin.',
    pick(candidates) {
      let best = null, bp = -Infinity;
      for (const e of candidates) {
        const p = e.pathProgress ?? 0;
        if (p > bp) { bp = p; best = e; }
      }
      return best;
    },
  },
  last: {
    id: 'last', label: 'Dernier',
    desc: 'Cible l\'ennemi le moins avancé (le garde longtemps à portée).',
    pick(candidates) {
      let best = null, bp = Infinity;
      for (const e of candidates) {
        const p = e.pathProgress ?? 0;
        if (p < bp) { bp = p; best = e; }
      }
      return best;
    },
  },
  nearest: {
    id: 'nearest', label: 'Le plus proche',
    desc: 'Cible l\'ennemi le plus proche de la tour.',
    pick(candidates, ctx) {
      let best = null, bd = Infinity;
      const px = ctx?.position?.x ?? 0, pz = ctx?.position?.z ?? 0;
      for (const e of candidates) {
        const dx = e.position.x - px, dz = e.position.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; best = e; }
      }
      return best;
    },
  },
  strongest: {
    id: 'strongest', label: 'Le plus résistant',
    desc: 'Cible l\'ennemi avec le plus de PV (blindés d\'abord).',
    pick(candidates) {
      let best = null, bh = -Infinity;
      for (const e of candidates) {
        const h = e.hp ?? 0;
        if (h > bh) { bh = h; best = e; }
      }
      return best;
    },
  },
  weakest: {
    id: 'weakest', label: 'Le plus faible',
    desc: 'Cible l\'ennemi avec le moins de PV (achève les blessés).',
    pick(candidates) {
      let best = null, bh = Infinity;
      for (const e of candidates) {
        const h = e.hp ?? 0;
        if (h < bh) { bh = h; best = e; }
      }
      return best;
    },
  },
  flying: {
    id: 'flying', label: 'Volants d\'abord',
    desc: 'Priorise les ennemis volants ; sinon, le plus avancé.',
    pick(candidates, ctx) {
      const fly = candidates.filter(e => e.flying);
      if (fly.length) return TARGET_MODES.first.pick(fly, ctx);
      return TARGET_MODES.first.pick(candidates, ctx);
    },
  },
};

export const TARGET_MODE_IDS = Object.keys(TARGET_MODES);
