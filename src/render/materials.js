/* =====================================================================
   Château Fort — Chargeur de matériaux PBR  (support T2.3 / T2.4)
   ---------------------------------------------------------------------
   Rôle : charger des ensembles de textures PBR (color + normal +
   roughness + ao, parfois metallic) et en faire des MeshStandardMaterial
   prêts à l'emploi, avec cache pour ne charger chaque image qu'une fois.

   Les textures sont dans assets/textures/<nom>/ avec des noms normalisés
   (color, normal, roughness, ao, metallic). Voir le rangement fait au
   moment de l'intégration des assets CC0.
   ===================================================================== */

import * as THREE from 'three';

const loader = new THREE.TextureLoader();

// Cache des textures individuelles déjà chargées (clé = url).
const texCache = new Map();

function loadTex(url, { srgb = false, repeat = 1 } = {}) {
  const key = url + '|' + srgb + '|' + repeat;
  if (texCache.has(key)) return texCache.get(key);

  const tex = loader.load(url);
  // La color map est en espace sRGB ; les cartes de données (normal,
  // roughness, ao) doivent rester en linéaire, sinon l'éclairage est faux.
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8; // netteté des textures vues en biais (sol, murs)
  texCache.set(key, tex);
  return tex;
}

/**
 * Construit un MeshStandardMaterial à partir d'un dossier de textures.
 *
 * @param {string} name    nom du dossier sous assets/textures/
 * @param {object} [opts]
 * @param {number} [opts.repeat=1]      répétition du motif (tiling)
 * @param {string} [opts.ext='jpg']     extension des fichiers
 * @param {boolean}[opts.hasMetallic=false]
 * @param {object} [opts.overrides]     propriétés à forcer sur le matériau
 * @returns {THREE.MeshStandardMaterial}
 */
export function makePBRMaterial(name, {
  repeat = 1, ext = 'jpg', hasMetallic = false, overrides = {},
} = {}) {
  const base = `./assets/textures/${name}/`;

  const mat = new THREE.MeshStandardMaterial({
    map:          loadTex(`${base}color.${ext}`, { srgb: true, repeat }),
    normalMap:    loadTex(`${base}normal.${ext}`, { repeat }),
    roughnessMap: loadTex(`${base}roughness.${ext}`, { repeat }),
    aoMap:        loadTex(`${base}ao.${ext}`, { repeat }),
    roughness: 1.0,   // la roughnessMap module cette valeur
    metalness: 0.0,
    ...overrides,
  });

  if (hasMetallic) {
    mat.metalnessMap = loadTex(`${base}metallic.${ext}`, { repeat });
    mat.metalness = 1.0; // la metalnessMap module cette valeur
  }

  return mat;
}

/**
 * Le aoMap de Three.js a besoin d'un second jeu de coordonnées UV (uv2 /
 * canal 'uv1' selon la version). Cet utilitaire duplique les UV d'une
 * géométrie pour que l'AO s'applique correctement.
 * @param {THREE.BufferGeometry} geo
 */
export function ensureAOUV(geo) {
  if (geo.attributes.uv && !geo.attributes.uv1) {
    geo.setAttribute('uv1', geo.attributes.uv);
  }
}
