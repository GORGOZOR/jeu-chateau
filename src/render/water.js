/* =====================================================================
   Château Fort — Eau (T2.5)
   ---------------------------------------------------------------------
   Rôle : surfaces d'eau crédibles (douve du château + étang du décor).

   Techniques :
     - Vagues de Gerstner : déplacent les sommets à la fois verticalement
       ET horizontalement, ce qui crée de vraies crêtes pointues plutôt
       qu'une simple ondulation sinusoïdale plate. On superpose plusieurs
       trains de vagues de directions/longueurs différentes.
     - Fresnel : l'eau réfléchit surtout vue de biais (bords, rasant) et
       laisse voir sa couleur de profondeur vue de dessus. On simule ça
       en mélangeant une couleur de surface (réflexion du ciel) et une
       couleur profonde selon l'angle de vue.
     - Écume : liseré clair là où la vague monte, et sur les bords.

   L'eau utilise l'environment map (ciel HDRI) pour la réflexion, ce qui
   l'ancre dans l'ambiance crépusculaire.

   Le module expose buildWater(...) et une méthode update(elapsed).
   ===================================================================== */

import * as THREE from 'three';
import { makePBRMaterial, ensureAOUV } from './materials.js';
import { WATER_ZONES, basinDepthAt } from '../data/water-zones.js';

const waterVertex = /* glsl */`
  uniform float uTime;
  // Chaque vague : direction (x,z), amplitude, longueur d'onde, vitesse, netteté.
  #define NUM_WAVES 4
  uniform vec4 uWaves[NUM_WAVES]; // dirX, dirZ, steepness, wavelength
  uniform float uAmp[NUM_WAVES];
  uniform float uSpeed[NUM_WAVES];

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vCrest;   // hauteur relative pour l'écume

  // Une vague de Gerstner : retourne le déplacement (x,y,z) et accumule
  // sa contribution à la tangente/binormale pour recalculer la normale.
  vec3 gerstner(vec2 pos, vec4 w, float amp, float speed, inout vec3 tangent, inout vec3 binormal) {
    vec2 dir = normalize(w.xy);
    float steep = w.z;
    float wavelength = w.w;
    float k = 6.28318 / wavelength;          // nombre d'onde
    float c = sqrt(9.8 / k) * speed;         // célérité
    float f = k * (dot(dir, pos) - c * uTime);
    float a = amp;

    float cosf = cos(f), sinf = sin(f);

    // Contribution aux dérivées (pour la normale).
    tangent  += vec3(-dir.x * dir.x * (steep * sinf),
                      dir.x * (steep * cosf),
                     -dir.x * dir.y * (steep * sinf));
    binormal += vec3(-dir.x * dir.y * (steep * sinf),
                      dir.y * (steep * cosf),
                     -dir.y * dir.y * (steep * sinf));

    return vec3(dir.x * (a * cosf), a * sinf, dir.y * (a * cosf));
  }

  void main() {
    vec3 p = position;
    vec2 base = position.xz;

    vec3 tangent = vec3(1.0, 0.0, 0.0);
    vec3 binormal = vec3(0.0, 0.0, 1.0);
    vec3 disp = vec3(0.0);

    for (int i = 0; i < NUM_WAVES; i++) {
      disp += gerstner(base, uWaves[i], uAmp[i], uSpeed[i], tangent, binormal);
    }
    p += disp;
    vCrest = disp.y;

    vNormal = normalize(cross(binormal, tangent));

    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const waterFragment = /* glsl */`
  uniform vec3 uShallow;   // couleur eau peu profonde / surface
  uniform vec3 uDeep;      // couleur eau profonde
  uniform vec3 uFoam;      // couleur de l'écume
  uniform vec3 uSkyTop;    // couleur du ciel au zénith (réflexion)
  uniform vec3 uSkyHorizon;// couleur du ciel à l'horizon (réflexion)
  uniform vec3 uCameraPos;
  uniform vec3 uSunDir;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vCrest;

  // Réflexion de ciel procédurale : dégradé horizon->zénith selon la
  // direction du rayon réfléchi. Évite de dépendre d'un cube map externe.
  vec3 skyReflect(vec3 R) {
    float t = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
    return mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.7, t));
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCameraPos - vWorldPos);

    // Fresnel : plus l'angle de vue est rasant, plus ça réfléchit.
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    fres = clamp(0.03 + 0.97 * fres, 0.0, 1.0);

    // Couleur de profondeur.
    float depthMix = smoothstep(-0.2, 0.4, N.y);
    vec3 waterColor = mix(uDeep, uShallow, depthMix);

    // Réflexion du ciel.
    vec3 R = reflect(-V, N);
    vec3 envColor = skyReflect(R);

    vec3 col = mix(waterColor, envColor, fres);

    // Écume sur les crêtes hautes (discrète pour éviter le scintillement).
    float foam = smoothstep(0.10, 0.20, vCrest);
    col = mix(col, uFoam, foam * 0.35);

    // Reflet spéculaire du soleil.
    float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 80.0);
    col += vec3(1.0, 0.85, 0.6) * spec * 0.8;

    gl_FragColor = vec4(col, 0.9);
  }
`;

/**
 * Construit une surface d'eau.
 *
 * @param {object} [opts]
 * @param {number} [opts.width=20]
 * @param {number} [opts.depth=20]
 * @param {number} [opts.segments=48]  subdivisions (plus = vagues plus fines)
 * @param {THREE.Texture} [opts.envMap] cube env map pour la réflexion
 * @param {THREE.Vector3} [opts.position]
 * @param {number} [opts.rotationY=0]
 * @param {THREE.Shape} [opts.shape]   forme personnalisée (sinon rectangle)
 * @returns {{ mesh, update, material }}
 */
export function buildWater({
  width = 20, depth = 20, segments = 48,
  envMap = null, position = new THREE.Vector3(0, 0, 0), rotationY = 0,
  geometry = null,
} = {}) {
  const geo = geometry || new THREE.PlaneGeometry(width, depth, segments, segments);
  if (!geometry) geo.rotateX(-Math.PI / 2); // à plat

  const material = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      // 4 trains de vagues : dir(x,z), steepness, wavelength
      uWaves: { value: [
        new THREE.Vector4( 1.0, 0.3, 0.18, 8.0),
        new THREE.Vector4(-0.6, 1.0, 0.14, 5.0),
        new THREE.Vector4( 0.4, -0.8, 0.10, 3.2),
        new THREE.Vector4(-1.0, -0.4, 0.06, 2.0),
      ]},
      uAmp:   { value: [0.12, 0.07, 0.04, 0.02] },
      uSpeed: { value: [0.8, 1.0, 1.2, 1.4] },
      uShallow: { value: new THREE.Color(0x3a6b7a) },
      uDeep:    { value: new THREE.Color(0x12303f) },
      uFoam:    { value: new THREE.Color(0xcfe4e8) },
      // Couleurs de ciel pour la réflexion procédurale (accordées au crépuscule).
      uSkyTop:     { value: new THREE.Color(0x2a3a5a) },
      uSkyHorizon: { value: new THREE.Color(0xd9a86a) },
      uSunDir:     { value: new THREE.Vector3(-0.6, 0.5, 0.4).normalize() },
      uCameraPos: { value: new THREE.Vector3() },
    },
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(position);
  mesh.rotation.y = rotationY;
  mesh.renderOrder = 1; // dessiné après le terrain (transparence)

  return {
    mesh,
    material,
    /** À appeler chaque frame : avance les vagues et met à jour la caméra. */
    update(elapsed, camera) {
      material.uniforms.uTime.value = elapsed;
      if (camera) material.uniforms.uCameraPos.value.copy(camera.position);
    },
  };
}

/* --------------------------------------------------------------------
   Construit les plans d'eau (depuis WATER_ZONES) avec une berge de terre
   autour de chacun pour une transition propre herbe -> berge -> eau.
   -------------------------------------------------------------------- */
export function buildWaterFeatures(scene, { heightAt = null } = {}) {
  const waters = [];
  const group = new THREE.Group();

  // Matériau de berge (Ground054), légèrement répété.
  const shoreMat = makePBRMaterial('shore', { repeat: 3, ext: 'jpg', overrides: { roughness: 1 } });

  for (const z of WATER_ZONES) {
    // --- Berge : plan de terre qui épouse EXACTEMENT la cuve creusée dans
    //     le terrain (même fonction basinDepthAt), un peu plus grand que
    //     l'eau. Ainsi la berge tapisse le fond et les pentes du bassin :
    //     on voit de la terre sous l'eau et sur les bords, sans flaque. ---
    const bw = (z.halfW + z.shore) * 2;
    const bd = (z.halfD + z.shore) * 2;
    const shoreGeo = new THREE.PlaneGeometry(bw, bd, 32, 32);
    shoreGeo.rotateX(-Math.PI / 2);
    const pos = shoreGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // position monde du sommet = centre zone + position locale
      const wx = z.cx + pos.getX(i);
      const wz = z.cz + pos.getZ(i);
      // hauteur = fond de cuve (légèrement sous l'eau au centre)
      pos.setY(i, basinDepthAt(wx, wz, 1.2));
    }
    pos.needsUpdate = true;
    shoreGeo.computeVertexNormals();
    ensureAOUV(shoreGeo);
    const shore = new THREE.Mesh(shoreGeo, shoreMat);
    shore.position.set(z.cx, 0.03, z.cz); // très légèrement au-dessus du terrain
    shore.receiveShadow = true;
    group.add(shore);

    // --- Surface d'eau : elle déborde sur la pente jusqu'à la ligne où
    //     le terrain remonte au niveau d'eau (-0.1). Avec la remontée
    //     quartique de basinDepthAt (depth=1.2), le terrain atteint -0.1 à
    //     ~0.84*shore du bord du rectangle. On agrandit donc l'eau de cette
    //     marge pour qu'elle colle au bord du bassin, sans liseré sec.
    const waterMargin = z.shore * 0.84;
    const water = buildWater({
      width: (z.halfW + waterMargin) * 2, depth: (z.halfD + waterMargin) * 2, segments: 40,
      position: new THREE.Vector3(z.cx, z.waterY, z.cz),
    });
    group.add(water.mesh);
    waters.push(water);
  }

  scene.add(group);

  return {
    waters,
    group,
    update(elapsed, camera) {
      for (const w of waters) w.update(elapsed, camera);
    },
    dispose() { scene.remove(group); },
  };
}
