/* =====================================================================
   Château Fort — Tracé du chemin (données)
   ---------------------------------------------------------------------
   Le chemin que suivront les ennemis, défini comme une suite de points
   (x, z) dans le plan du sol. Il est utilisé dès T2.4 pour poser le sol
   pavé et éviter d'y planter de la végétation, et servira au gameplay
   (déplacement des ennemis, T3.x).

   Convention : le dernier point est à l'entrée du château. Le château
   (T2.3) est à z = -6 ; on fait donc arriver le chemin devant sa porte.
   ===================================================================== */

// Points du chemin, du point d'apparition des ennemis jusqu'au château.
// Le château est à (0, -6), donjon de 7 de côté → porte en monde à z ≈ -2.45,
// face +z. Le chemin serpente depuis le fond gauche et arrive pile devant
// la porte, par l'avant (côté +z), sans boucle ni angle brutal.
export const PATH = [
  [-16, 24],   // apparition, bas-gauche
  [-16, 16],
  [13, 16],    // grande voie horizontale basse (loin des deux étangs)
  [13, 6],     // remontée à droite, à distance de l'étang (berge à x=18)
  [0, 6],      // voie haute vers l'axe du château (espacée de 10 de z=16)
  [0, -2.45],  // arrivée : devant la porte, frontalement
];

// Largeur du chemin (pour le sol pavé et l'exclusion de végétation).
export const PATH_WIDTH = 3.2;

/**
 * Distance minimale d'un point (x,z) au segment de chemin le plus proche.
 * Sert à savoir si un emplacement est « sur le chemin » (pour éviter d'y
 * poser des arbres) — calcul point/segment classique.
 */
export function distanceToPath(x, z) {
  let min = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i];
    const [bx, bz] = PATH[i + 1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, pz = az + t * dz;
    const d = Math.hypot(x - px, z - pz);
    if (d < min) min = d;
  }
  return min;
}
