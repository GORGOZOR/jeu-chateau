/* =====================================================================
   Château Fort — Object pooling  (T1.5)
   ---------------------------------------------------------------------
   Rôle : recycler les objets créés en masse et de façon éphémère
   (projectiles, particules, chiffres de dégâts) au lieu d'en allouer un
   neuf à chaque fois et de le laisser au ramasse-miettes. En plein combat,
   des dizaines d'objets naissent et meurent chaque seconde ; sans pool,
   le garbage collector se déclenche et provoque des micro-saccades — ces
   « coups » ponctuels qui font chuter le framerate juste au mauvais moment.

   Rappel de cadence (aligné sur la décision projet) :
     - cible : 60 FPS,
     - plancher acceptable : ~30 FPS lors des pics (grosses vagues, effets).
   La boucle à pas fixe (T1.4) garantit que la LOGIQUE reste juste même à
   30 FPS ; le pooling sert justement à limiter la fréquence de ces creux.

   Périmètre strict T1.5 :
     - un pool générique (acquire / release / reserve / stats),
     - conçu pour être branché sur les projectiles et effets (Lots 2-3),
       sans dépendre d'eux ici.
   ===================================================================== */

/**
 * Pool d'objets générique.
 *
 * @template T
 * @param {object} opts
 * @param {() => T}          opts.create   fabrique un objet neuf (appelée
 *                                         seulement quand le pool est vide)
 * @param {(obj:T) => void}  [opts.reset]  remet un objet à l'état neuf avant
 *                                         réutilisation (ex. position à 0,
 *                                         visible=false)
 * @param {(obj:T) => void}  [opts.onRelease] appelé au retour dans le pool
 *                                         (ex. détacher de la scène)
 * @param {number}           [opts.initial]  nombre d'objets à pré-créer
 * @param {number}           [opts.max]     plafond dur d'objets vivants
 *                                          simultanés (0 = illimité)
 */
export function createPool({ create, reset, onRelease, initial = 0, max = 0 } = {}) {
  if (typeof create !== 'function') {
    throw new Error('createPool: `create` est requis (fabrique d\'objet).');
  }

  // Objets disponibles, prêts à être réutilisés.
  const free = [];
  // Compteur d'objets actuellement « sortis » (acquis, pas encore rendus).
  let inUse = 0;
  // Compteur total d'objets jamais créés (diagnostic : doit se stabiliser).
  let created = 0;

  function makeOne() {
    created++;
    return create();
  }

  // Pré-remplissage optionnel : évite les allocations pendant le jeu en les
  // faisant au chargement.
  for (let i = 0; i < initial; i++) {
    free.push(makeOne());
  }

  return {
    /**
     * Sort un objet du pool (ou en crée un si le pool est vide et que le
     * plafond n'est pas atteint). Renvoie null si le plafond est atteint.
     * @returns {T|null}
     */
    acquire() {
      if (max > 0 && inUse >= max) {
        // Plafond atteint : on refuse plutôt que de gonfler indéfiniment.
        // L'appelant décide quoi faire (ignorer l'effet, recycler le plus vieux…).
        return null;
      }
      const obj = free.length > 0 ? free.pop() : makeOne();
      inUse++;
      return obj;
    },

    /**
     * Rend un objet au pool pour réutilisation.
     * @param {T} obj
     */
    release(obj) {
      if (obj == null) return;
      if (onRelease) onRelease(obj);
      if (reset) reset(obj);
      free.push(obj);
      if (inUse > 0) inUse--;
    },

    /**
     * Pré-crée `n` objets supplémentaires disponibles (montée en charge
     * anticipée avant une grosse vague, par exemple).
     */
    reserve(n) {
      for (let i = 0; i < n; i++) free.push(makeOne());
    },

    /**
     * Vide complètement le pool (objets libres). N'affecte pas les objets
     * encore en usage. `onRelease` est appelé sur chacun pour un nettoyage
     * propre (ex. libérer la géométrie).
     */
    drain() {
      if (onRelease) for (const obj of free) onRelease(obj);
      free.length = 0;
    },

    /** Statistiques de diagnostic. */
    get stats() {
      return {
        free: free.length,     // objets disponibles
        inUse,                 // objets sortis
        created,               // total jamais alloué (doit se stabiliser)
        capacity: free.length + inUse,
      };
    },
  };
}
