/* =====================================================================
   Château Fort — Sorts du seigneur  (T4.1)
   ---------------------------------------------------------------------
   Pouvoirs actifs du joueur, payés en FAVEUR (ressource qui se régénère).
   Trois sorts :
     - arrowRain : pluie de flèches — gros dégâts instantanés dans une zone.
     - frost     : gel — ralentit fortement tous les ennemis d'une zone.
     - rampart   : renfort — barricade temporaire qui ralentit les ennemis
                   qui la traversent (zone de ralentissement au sol).

   Chaque sort a : coût (faveur), cooldown, portée d'effet, et une fonction
   `cast(pos, enemies)` qui applique son effet. Le feedback visuel (particules)
   est délégué via un callback `onEffect`, pour rester découplé du rendu.

   Ciblage : les sorts de zone se lancent à une position monde (fournie par
   le raycaster souris dans main.js). Testable sans souris en passant une
   position directement.
   ===================================================================== */

import * as GameState from '../core/state.js';

export const SPELLS = {
  arrowRain: {
    id: 'arrowRain', name: 'Pluie de flèches',
    cost: 35, cooldown: 8, radius: 5, damage: 60,
    desc: 'Dégâts de zone instantanés.',
    color: 0xd9c27a,
  },
  frost: {
    id: 'frost', name: 'Gel',
    cost: 30, cooldown: 10, radius: 6,
    slowFactor: 0.3, slowDuration: 4,
    desc: 'Ralentit fortement les ennemis d\'une zone.',
    color: 0x9fd8ff,
  },
  rampart: {
    id: 'rampart', name: 'Renfort',
    cost: 45, cooldown: 14, radius: 3.5,
    slowFactor: 0.5, slowDuration: 6, duration: 6,
    desc: 'Barricade temporaire qui ralentit les ennemis.',
    color: 0x8a6a4a,
  },
};

export function createSpellSystem({ onEffect, onRampartCreate, onRampartExpire } = {}) {
  // Cooldown restant par sort (0 = prêt).
  const cooldowns = { arrowRain: 0, frost: 0, rampart: 0 };
  // Barricades actives (renfort) : zones de ralentissement temporaires.
  const ramparts = [];

  const system = {
    SPELLS,
    /** Cooldown restant (s) d'un sort. */
    cooldownLeft(id) { return cooldowns[id] || 0; },
    /** Le sort est-il lançable (prêt + assez de faveur) ? */
    canCast(id) {
      const s = SPELLS[id];
      return s && cooldowns[id] <= 0 && GameState.canCastFavor(s.cost);
    },

    /**
     * Lance un sort à une position monde.
     * @param {string} id
     * @param {{x,z}} pos
     * @param {Array} enemies  liste d'ennemis (position, takeDamage, applySlow)
     * @returns {boolean} true si lancé
     */
    cast(id, pos, enemies = []) {
      const s = SPELLS[id];
      if (!s) return false;
      if (cooldowns[id] > 0) return false;
      if (!GameState.spendFavor(s.cost)) return false;   // coûte la faveur
      cooldowns[id] = s.cooldown;

      const r2 = s.radius * s.radius;
      if (id === 'arrowRain') {
        for (const e of enemies) {
          if (!e.alive) continue;
          const dx = e.position.x - pos.x, dz = e.position.z - pos.z;
          if (dx * dx + dz * dz <= r2) {
            e.takeDamage(s.damage, { type: 'spell', dmgType: 'pierce' });
          }
        }
      } else if (id === 'frost') {
        for (const e of enemies) {
          if (!e.alive) continue;
          const dx = e.position.x - pos.x, dz = e.position.z - pos.z;
          if (dx * dx + dz * dz <= r2) {
            e.applySlow?.(s.slowFactor, s.slowDuration);
            e.takeDamage(5, { type: 'spell', dmgType: 'frost' });
          }
        }
      } else if (id === 'rampart') {
        // Zone de ralentissement persistante (barricade) + son visuel 3D.
        const visual = onRampartCreate?.(pos, s);
        ramparts.push({ x: pos.x, z: pos.z, r2, ...s, timeLeft: s.duration, visual });
      }

      onEffect?.(id, pos, s); // feedback visuel (particules)
      return true;
    },

    /** À appeler chaque frame : cooldowns + barricades actives. */
    update(dt, enemies = []) {
      for (const id of Object.keys(cooldowns)) {
        if (cooldowns[id] > 0) cooldowns[id] = Math.max(0, cooldowns[id] - dt);
      }
      // Barricades : ralentissent les ennemis dessus, puis expirent.
      for (let i = ramparts.length - 1; i >= 0; i--) {
        const b = ramparts[i];
        b.timeLeft -= dt;
        if (b.timeLeft <= 0) {
          onRampartExpire?.(b.visual);
          ramparts.splice(i, 1);
          continue;
        }
        for (const e of enemies) {
          if (!e.alive) continue;
          const dx = e.position.x - b.x, dz = e.position.z - b.z;
          if (dx * dx + dz * dz <= b.r2) e.applySlow?.(b.slowFactor, 0.3);
        }
      }
    },

    get activeRamparts() { return ramparts; },
  };

  return system;
}
