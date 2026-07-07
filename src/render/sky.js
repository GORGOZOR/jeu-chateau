/* =====================================================================
   Château Fort — Ciel et environnement lumineux  (T2.1)
   ---------------------------------------------------------------------
   Rôle : poser le ciel crépusculaire et l'éclairage d'ambiance basé image.
   Une HDRI (image panoramique haute dynamique) sert à deux choses :
     1. FOND visible de la scène (le ciel qu'on voit derrière le décor),
     2. ENVIRONMENT MAP : source de lumière ambiante réaliste. Les
        matériaux PBR (MeshStandardMaterial) s'en servent pour leurs
        reflets et leur éclairage diffus — c'est ce qui donne le rendu
        « léché » plutôt qu'un éclairage plat.

   Le chargement est asynchrone. On expose une fonction qui renvoie une
   promesse résolue quand le ciel est prêt, avec un repli propre (fond
   dégradé procédural) si la HDRI est absente ou échoue — conformément à
   la robustesse voulue (le jeu ne doit jamais planter faute d'un asset).

   Périmètre strict T2.1 : le ciel + l'ambiance basée image.
   L'éclairage directionnel (soleil, ombres) est dans lighting.js.
   ===================================================================== */

import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// Chemin de la HDRI crépusculaire (Qwantani Dusk 2, Poly Haven, CC0).
const HDRI_PATH = './assets/hdri/sky_dusk.hdr';

// Teinte de repli si la HDRI ne charge pas : un dégradé crépusculaire
// bleu-nuit vers ocre, cohérent avec la palette du jeu.
const FALLBACK_TOP = new THREE.Color(0x1a2740);
const FALLBACK_BOTTOM = new THREE.Color(0x6b4a3a);

/**
 * Construit un fond dégradé procédural (repli sans HDRI).
 * Rendu via une grande sphère inversée avec un shader de dégradé vertical.
 */
function makeGradientSky() {
  const geo = new THREE.SphereGeometry(200, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: FALLBACK_TOP },
      bottomColor: { value: FALLBACK_BOTTOM },
      offset: { value: 20 },
      exponent: { value: 0.6 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        float t = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fallbackSky';
  return mesh;
}

/**
 * Installe le ciel dans la scène.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer  nécessaire au PMREMGenerator
 * @param {object} [opts]
 * @param {boolean} [opts.useAsBackground=true]  utiliser la HDRI en fond visible
 * @returns {Promise<{ mode:'hdri'|'fallback', envMap:THREE.Texture|null }>}
 */
export function setupSky(scene, renderer, { useAsBackground = true } = {}) {
  return new Promise((resolve) => {
    const loader = new RGBELoader();

    loader.load(
      HDRI_PATH,
      (hdrTexture) => {
        // Génère une environment map filtrée (PMREM) à partir de la HDRI :
        // c'est la forme optimisée pour l'éclairage PBR.
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        const envMap = pmrem.fromEquirectangular(hdrTexture).texture;

        scene.environment = envMap; // éclairage ambiant de tous les matériaux PBR

        if (useAsBackground) {
          // Le fond montre la HDRI en projection équirectangulaire.
          hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
          scene.background = hdrTexture;
          // Atténue un peu l'intensité du fond pour ne pas écraser la scène.
          scene.backgroundIntensity = 0.9;
        } else {
          hdrTexture.dispose();
        }

        pmrem.dispose();
        resolve({ mode: 'hdri', envMap });
      },
      undefined, // pas de suivi de progression ici (viendra au préchargeur, T5.2)
      (err) => {
        // Repli : la HDRI n'a pas pu charger. On ne casse pas le jeu.
        console.warn('[sky] HDRI introuvable ou illisible, repli sur ciel dégradé.', err);
        scene.add(makeGradientSky());
        scene.background = FALLBACK_TOP.clone();
        resolve({ mode: 'fallback', envMap: null });
      }
    );
  });
}
