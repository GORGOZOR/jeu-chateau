/* =====================================================================
   Château Fort — Effets de statut cumulables  (T4.2)
   ---------------------------------------------------------------------
   Système unifié de buffs/debuffs porté par chaque ennemi. Quatre statuts :
     - burn       : brûlure — dégâts sur la durée (DoT).
     - chill      : gel — ralentit le déplacement.
     - poison     : poison — DoT, indépendant de la brûlure.
     - vulnerable : vulnérabilité — augmente les dégâts reçus d'UN type précis.

   Règle d'empilement (choix de design) : MIXTE.
     - l'intensité (stacks) s'empile jusqu'à un PLAFOND,
     - la durée se RAFRAÎCHIT à chaque réapplication.

   Chaque ennemi possède un StatusSet ; il l'update chaque frame pour
   appliquer les effets (dégâts, ralenti) et purger les statuts expirés.
   ===================================================================== */

// Définition des statuts : plafond de stacks, effet.
export const STATUS_DEFS = {
  burn: {
    id: 'burn', label: 'Brûlure', color: 0xff5a2a,
    maxStacks: 5,
    dps: 6,          // dégâts/seconde PAR stack
    dmgType: 'fire',
  },
  poison: {
    id: 'poison', label: 'Poison', color: 0x6acc3a,
    maxStacks: 5,
    dps: 4,          // dégâts/seconde par stack
    dmgType: 'poison',
  },
  chill: {
    id: 'chill', label: 'Gel', color: 0x9fd8ff,
    maxStacks: 3,
    // ralentissement : chaque stack ralentit davantage, plafonné.
    slowPerStack: 0.15, // -15% de vitesse par stack (max 3 → -45%)
  },
  vulnerable: {
    id: 'vulnerable', label: 'Vulnérable', color: 0xffcc44,
    maxStacks: 3,
    weaknessPerStack: 0.25, // +25% de dégâts reçus (du type ciblé) par stack
  },
};

/**
 * Crée un ensemble de statuts pour un ennemi.
 * Chaque statut actif : { stacks, timeLeft, meta }.
 */
export function createStatusSet() {
  const active = {}; // id -> { stacks, timeLeft, meta }

  return {
    /**
     * Applique (ou rafraîchit) un statut.
     * @param {string} id       burn | poison | chill | vulnerable
     * @param {number} duration durée (s)
     * @param {object} [opts]   { stacks=1, type } (type = cible de vulnérabilité)
     */
    apply(id, duration, opts = {}) {
      const def = STATUS_DEFS[id];
      if (!def) return;
      const addStacks = opts.stacks ?? 1;
      const cur = active[id];
      if (cur) {
        // intensité empilée jusqu'au plafond, durée rafraîchie.
        cur.stacks = Math.min(def.maxStacks, cur.stacks + addStacks);
        cur.timeLeft = Math.max(cur.timeLeft, duration);
        if (opts.type) cur.meta.type = opts.type;
      } else {
        active[id] = { stacks: Math.min(def.maxStacks, addStacks), timeLeft: duration, meta: { type: opts.type } };
      }
    },

    has(id) { return !!active[id]; },
    stacks(id) { return active[id]?.stacks || 0; },

    /** Facteur de ralentissement courant (1 = normal, <1 = ralenti). */
    slowFactor() {
      const c = active.chill;
      if (!c) return 1;
      return Math.max(0.2, 1 - STATUS_DEFS.chill.slowPerStack * c.stacks);
    },

    /** Multiplicateur de dégâts reçus pour un type donné (vulnérabilité). */
    damageTakenMultiplier(dmgType) {
      const v = active.vulnerable;
      if (!v || !v.meta.type || v.meta.type !== dmgType) return 1;
      return 1 + STATUS_DEFS.vulnerable.weaknessPerStack * v.stacks;
    },

    /**
     * Avance les statuts : renvoie les dégâts de DoT à appliquer ce frame,
     * et purge les statuts expirés.
     * @returns {Array<{amount, dmgType}>} liste de dégâts à infliger
     */
    tick(dt) {
      const damages = [];
      for (const id of Object.keys(active)) {
        const st = active[id];
        const def = STATUS_DEFS[id];
        st.timeLeft -= dt;
        // DoT (brûlure, poison) : dps × stacks × dt
        if (def.dps) {
          damages.push({ amount: def.dps * st.stacks * dt, dmgType: def.dmgType });
        }
        if (st.timeLeft <= 0) delete active[id];
      }
      return damages;
    },

    /** Liste des statuts actifs (pour les indicateurs visuels). */
    list() {
      return Object.keys(active).map(id => ({
        id, stacks: active[id].stacks, color: STATUS_DEFS[id].color,
      }));
    },

    clear() { for (const k of Object.keys(active)) delete active[k]; },
  };
}
