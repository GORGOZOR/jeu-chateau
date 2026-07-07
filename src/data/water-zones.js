/* =====================================================================
   Château Fort — Zones d'eau (données partagées)
   ---------------------------------------------------------------------
   Définit les plans d'eau une seule fois, pour que :
     - water.js les rende (surface + berge),
     - environment.js les évite (pas de végétation dans l'eau ni sur la berge).

   Chaque zone : centre (cx, cz), demi-dimensions (halfW, halfD), et un
   rayon de berge (shore) qui déborde autour pour la transition de terre.
   Positions choisies pour être bien visibles depuis la caméra (avant/côté)
   et à l'écart du chemin et du château.
   ===================================================================== */

export const WATER_ZONES = [
  // --- Douve en U autour du château (arrière + 2 flancs, avant ouvert
  //     pour laisser passer le chemin jusqu'à la porte). Berge fine. ---
  { name: 'moat_back',  cx: 0,     cz: -14.75, halfW: 9,   halfD: 1.25, shore: 1, waterY: -0.1 },
  { name: 'moat_left',  cx: -7.75, cz: -7,     halfW: 1.25, halfD: 6.5, shore: 1, waterY: -0.1 },
  { name: 'moat_right', cx: 7.75,  cz: -7,     halfW: 1.25, halfD: 6.5, shore: 1, waterY: -0.1 },

  // --- Étangs décoratifs, bien visibles et dégagés du chemin. ---
  { name: 'pond', cx: 28, cz: 18, halfW: 7, halfD: 5, shore: 3, waterY: -0.1 },
  { name: 'basin', cx: -26, cz: -14, halfW: 6, halfD: 4.5, shore: 3, waterY: -0.1 },
];

/**
 * Distance signée « à l'intérieur » d'une zone d'eau, en tenant compte de
 * la berge. Renvoie :
 *   < 0  : dans l'eau
 *   0..shore : sur la berge
 *   > shore : à l'extérieur (herbe normale)
 * On utilise une distance de type « rectangle arrondi » (Chebyshev adoucie).
 */
export function waterFieldAt(x, z) {
  let best = Infinity;
  for (const w of WATER_ZONES) {
    const dx = Math.max(Math.abs(x - w.cx) - w.halfW, 0);
    const dz = Math.max(Math.abs(z - w.cz) - w.halfD, 0);
    const d = Math.hypot(dx, dz); // 0 si dans le rectangle d'eau
    if (d < best) best = d;
  }
  return best;
}

/** true si (x,z) est dans l'eau ou sur la berge (à exclure pour la végétation). */
export function isNearWater(x, z, margin = 1) {
  for (const w of WATER_ZONES) {
    const dx = Math.max(Math.abs(x - w.cx) - w.halfW, 0);
    const dz = Math.max(Math.abs(z - w.cz) - w.halfD, 0);
    if (Math.max(dx, dz) < w.shore + margin) return true;
  }
  return false;
}

/**
 * Profondeur de creusement du terrain à (x,z) pour former une cuve sous l'eau.
 * Renvoie une valeur <= 0 (0 = pas de creusement, négatif = terrain abaissé).
 * La cuve est profonde à l'intérieur de la zone d'eau et remonte en pente
 * douce sur la largeur de la berge, pour un raccord naturel avec le terrain.
 *
 * @param {number} depth  profondeur maximale de la cuve (défaut 1.2)
 */
export function basinDepthAt(x, z, depth = 1.2) {
  let deepest = 0;
  for (const w of WATER_ZONES) {
    const dx = Math.max(Math.abs(x - w.cx) - w.halfW, 0);
    const dz = Math.max(Math.abs(z - w.cz) - w.halfD, 0);
    // Distance de Chebyshev (max) plutôt qu'euclidienne : donne une cuve
    // à coins CARRÉS, qui coïncide avec la berge rectangulaire. Évite que
    // l'herbe perce dans les angles (coins arrondis = zones non couvertes).
    const d = Math.max(dx, dz);
    let carve;
    if (d <= 0) {
      carve = -depth;
    } else if (d < w.shore) {
      const t = d / w.shore; // 0..1
      // Remontée quartique : le fond reste profond sur une plus grande part
      // de la berge puis remonte vite au bord externe. Ça garantit que le
      // terrain est franchement sous l'eau sur toute la zone immergée,
      // évitant que des triangles d'herbe percent la surface.
      const tt = t * t;
      carve = -depth * (1 - tt) * (1 - tt);
    } else {
      carve = 0;
    }
    if (carve < deepest) deepest = carve;
  }
  return deepest;
}
