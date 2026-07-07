/* =====================================================================
   Château Fort — Carte « Plaine »  (T3.1 / T3.2)
   ---------------------------------------------------------------------
   Une carte est décrite ENTIÈREMENT en configuration : le chargeur
   (map-loader.js) construit la scène à partir de cet objet, sans code
   spécifique à la carte. Pour créer une autre carte, il suffit de copier
   ce fichier et d'en changer les valeurs.

   Schéma d'une carte :
     - id, name        : identité
     - theme           : couleurs et densité de végétation (direction artistique)
     - world           : dimensions du terrain
     - entries         : points d'apparition des ennemis (départ du chemin)
     - path            : suite de points (x,z) que suivent les ennemis
     - pathWidth       : largeur du chemin
     - castle          : position + orientation du château (objectif à défendre)
     - towerSlots      : emplacements constructibles (socles de tours)
     - water           : zones d'eau (douve + étangs)
     - startGold, startHp : conditions de départ

   NOTE : ce format centralise ce qui était éparpillé (path.js, water-zones.js).
   Ces modules restent la source des helpers géométriques ; la carte en
   RÉFÉRENCE les données pour rester cohérente.
   ===================================================================== */

import { PATH, PATH_WIDTH } from '../path.js';
import { WATER_ZONES } from '../water-zones.js';

export const plaine = {
  id: 'plaine',
  name: 'La Plaine',

  // Direction artistique de la carte.
  theme: {
    grassColor: 0x4a5a30,      // teinte du sol (indicatif, la texture prime)
    fogColor: 0x3b4a63,
    vegetation: { pines: 120, bushes: 90, rocks: 50 }, // densité (mode high)
  },

  // Dimensions du monde (doivent correspondre à environment.js).
  world: { width: 80, depth: 72 },

  // Point(s) d'apparition des ennemis = premier point du chemin.
  entries: [ { x: PATH[0][0], z: PATH[0][1] } ],

  // Chemin suivi par les ennemis (référence la donnée partagée).
  path: PATH,
  pathWidth: PATH_WIDTH,

  // Château à défendre (fin du chemin).
  castle: { position: { x: 0, y: 0, z: -6 }, facing: 0 },

  // Zones d'eau (douve en U + étangs). Référence la donnée partagée.
  water: WATER_ZONES,

  // Socles de tours : emplacements constructibles, placés le long du chemin,
  // validés (hors chemin, hors eau, hors château). Générés en amont puis
  // figés ici pour des positions stables et prévisibles.
  // y sera calé sur la hauteur du terrain au chargement.
  towerSlots: [
    { x: -19.8, z: 22 }, { x: -12.2, z: 22 },
    { x: -14,   z: 12.2 },
    { x: -6,    z: 19.8 }, { x: -6, z: 12.2 },
    { x: 2,     z: 19.8 }, { x: 2,  z: 12.2 },
    { x: 10,    z: 19.8 }, { x: 10, z: 12.2 },
    { x: 16.8,  z: 14 },
    { x: 11,    z: 2.2 }, { x: 3, z: 2.2 },
    { x: -3.8,  z: 4 },
  ],

  // Conditions de départ (cohérentes avec l'état de jeu, core/state.js).
  startGold: 160,
  startHp: 20,
};

// Registre des cartes disponibles (une seule pour l'instant).
export const MAPS = { plaine };
export const DEFAULT_MAP = 'plaine';
