/* =====================================================================
   Château Fort — Post-processing  (T2.2)
   ---------------------------------------------------------------------
   Rôle : la couche « cinématographique » appliquée à l'image rendue.
     - Bloom : les zones très lumineuses (feu, givre, projectiles, reflets
       du soleil) débordent en un halo doux. C'est ce qui fait « briller »
       les effets.
     - Vignettage : léger assombrissement des bords, concentre le regard
       au centre et donne une touche cinéma.
     - Correction colorimétrique : accentue la teinte crépusculaire
       (ombres légèrement bleutées, hautes lumières chaudes) et ajoute du
       contraste + un grain subtil pour éviter le rendu « plastique ».

   Ordre des passes (important) :
     RenderPass (scène en linéaire)
       → Bloom (travaille en linéaire)
       → Grade (contraste/teinte/grain, en linéaire)
       → OutputPass (tone mapping ACES + conversion sRGB, une seule fois)

   Le tone mapping est fait ICI par OutputPass. On le désactive donc sur
   le renderer quand le post-process est actif, pour ne pas l'appliquer
   deux fois (double correction = image délavée).

   Qualité : en mode « bas », on n'instancie pas de composer du tout et on
   rend en direct (voir main.js), conformément à la tâche.
   ===================================================================== */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* --------------------------------------------------------------------
   Shader de correction colorimétrique maison (« color grade »).
   Applique, dans l'ordre : contraste, mélange de teinte crépusculaire
   (froid dans les ombres, chaud dans les lumières), vignettage, grain.
   Léger et paramétrable ; travaille en espace linéaire (avant OutputPass).
   -------------------------------------------------------------------- */
const GradeShader = {
  uniforms: {
    tDiffuse:   { value: null },
    brightness: { value: 1.0 },    // luminosité globale (réglage joueur)
    contrast:   { value: 1.06 },   // > 1 = plus de contraste
    coolShadows:{ value: new THREE.Color(0x1a2740) }, // teinte des ombres
    warmLights: { value: new THREE.Color(0xffd9a8) }, // teinte des lumières
    gradeAmount:{ value: 0.12 },   // dosage du virage colorimétrique
    vignette:   { value: 0.9 },    // 1 = pas de vignette, plus bas = plus marquée
    grain:      { value: 0.03 },   // intensité du grain
    time:       { value: 0 },      // pour animer le grain
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float brightness;
    uniform float contrast;
    uniform vec3 coolShadows;
    uniform vec3 warmLights;
    uniform float gradeAmount;
    uniform float vignette;
    uniform float grain;
    uniform float time;
    varying vec2 vUv;

    // Bruit pseudo-aléatoire pour le grain.
    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233)) + time) * 43758.5453);
    }

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb;

      // 0. Luminosité globale (agit comme une exposition, en linéaire).
      col *= brightness;

      // 1. Contraste autour du gris moyen.
      col = (col - 0.5) * contrast + 0.5;

      // 2. Virage crépusculaire : on interpole une teinte selon la
      //    luminance (ombres -> froid, lumières -> chaud), dosé finement.
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 tint = mix(coolShadows, warmLights, smoothstep(0.0, 1.0, lum));
      col = mix(col, col * (tint * 2.0), gradeAmount);

      // 3. Vignettage : distance au centre.
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.8, vignette * 0.4, dot(d, d) * 2.0);
      col *= mix(1.0, vig, 1.0 - vignette + 0.0001);

      // 4. Grain subtil.
      col += (rand(vUv) - 0.5) * grain;

      gl_FragColor = vec4(col, tex.a);
    }`,
};

/**
 * Crée le pipeline de post-processing.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {object} [opts]
 * @param {number} [opts.bloomStrength=0.55]
 * @param {number} [opts.bloomRadius=0.4]
 * @param {number} [opts.bloomThreshold=0.85]  luminance à partir de laquelle ça « bloome »
 * @returns {{ composer, setSize, render, grade, bloom, dispose }}
 */
export function createPostProcess(renderer, scene, camera, {
  bloomStrength = 0.55,
  bloomRadius = 0.4,
  bloomThreshold = 0.85,
} = {}) {
  const size = renderer.getSize(new THREE.Vector2());

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.x, size.y);

  // 1. Rendu de la scène.
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 2. Bloom (halo sur les zones lumineuses).
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    bloomStrength,
    bloomRadius,
    bloomThreshold
  );
  composer.addPass(bloom);

  // 3. Correction colorimétrique + vignette + grain.
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  // 4. Sortie : tone mapping ACES + conversion sRGB (une seule fois, ici).
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return {
    composer,
    bloom,
    grade,

    /** Redimensionne le pipeline (à appeler dans onResize). */
    setSize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      bloom.setSize(w, h);
    },

    /** Luminosité globale (1 = neutre). Appliquée avant contraste/grade. */
    setBrightness(v) { grade.uniforms.brightness.value = v; },

    /** Rend une frame. `dt` sert à animer le grain. */
    render(dt = 0) {
      grade.uniforms.time.value += dt;
      composer.render();
    },

    dispose() {
      composer.dispose();
    },
  };
}
