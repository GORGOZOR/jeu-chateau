/* =====================================================================
   Château Fort — Terrain et décor  (T2.4)
   ---------------------------------------------------------------------
   Rôle : construire le monde autour du château.
     - un terrain herbeux avec relief léger (bruit de Simplex), aplani
       le long du chemin pour que le gameplay reste lisible,
     - un chemin en pavés texturés suivant le tracé (data/path.js),
     - de la végétation (arbres, buissons) et des rochers en InstancedMesh :
       des centaines d'objets rendus en très peu d'appels GPU. C'est LA
       technique qui permet un décor riche sans chute de framerate.

   Textures utilisées : grass (sol), paving (chemin). Via materials.js.
   ===================================================================== */

import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { makePBRMaterial, ensureAOUV } from './materials.js';
import { PATH, PATH_WIDTH, distanceToPath } from '../data/path.js';
import { isNearWater, basinDepthAt } from '../data/water-zones.js';

const WORLD = { width: 80, depth: 72 };

/* --------------------------------------------------------------------
   Hauteur du terrain en (x, z) via bruit de Simplex.
   Aplati près du chemin et du centre (château) pour rester jouable.
   -------------------------------------------------------------------- */
function makeHeightField(seed = 1) {
  const noise = new SimplexNoise();
  return function heightAt(x, z) {
    // Relief de base, doux et ondulant.
    let h = noise.noise(x * 0.035, z * 0.035) * 1.6
          + noise.noise(x * 0.09, z * 0.09) * 0.5;
    // Aplatissement : plus on est près du chemin, plus le sol est plat.
    const dPath = distanceToPath(x, z);
    const flatPath = THREE.MathUtils.smoothstep(dPath, PATH_WIDTH, PATH_WIDTH + 6);
    // Aplatissement autour du château (centre, rayon ~8).
    const dCastle = Math.hypot(x - 0, z - (-6));
    const flatCastle = THREE.MathUtils.smoothstep(dCastle, 7, 13);
    h *= Math.min(flatPath, flatCastle);
    // Creuser une cuve franche sous les zones d'eau. On abaisse le terrain
    // herbeux nettement sous le niveau d'eau (-0.1) dans toute la cuve ET
    // sa marge, pour qu'aucun triangle d'herbe ne perce la surface (le
    // maillage étant discret, on prend de la marge de sécurité).
    const basin = basinDepthAt(x, z, 1.2);
    if (basin < -0.02) {
      // dans la cuve : imposer la profondeur, et forcer encore plus bas
      // près du bord d'eau pour absorber l'interpolation du maillage.
      h = basin - 0.15;
    }
    return h;
  };
}

/* --------------------------------------------------------------------
   Terrain : plan subdivisé déformé par le champ de hauteur.
   -------------------------------------------------------------------- */
function buildTerrain(heightAt) {
  const segX = 96, segZ = 88;
  const geo = new THREE.PlaneGeometry(WORLD.width, WORLD.depth, segX, segZ);
  geo.rotateX(-Math.PI / 2); // à plat

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  ensureAOUV(geo);

  const mat = makePBRMaterial('grass', { repeat: 14, ext: 'jpg', overrides: { roughness: 1 } });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/* --------------------------------------------------------------------
   Chemin pavé : une bande de segments texturés posée le long du tracé,
   légèrement au-dessus du terrain (qui est aplati là de toute façon).
   -------------------------------------------------------------------- */
function buildPath() {
  const group = new THREE.Group();
  const mat = makePBRMaterial('paving', { repeat: 1, ext: 'jpg', overrides: { roughness: 1 } });

  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i];
    const [bx, bz] = PATH[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const geo = new THREE.PlaneGeometry(len + PATH_WIDTH, PATH_WIDTH);
    geo.rotateX(-Math.PI / 2);
    ensureAOUV(geo);
    // On répète la texture proportionnellement à la longueur du segment.
    const seg = new THREE.Mesh(geo, mat.clone());
    seg.material.map = mat.map.clone();
    seg.material.map.wrapS = seg.material.map.wrapT = THREE.RepeatWrapping;
    seg.material.map.repeat.set((len + PATH_WIDTH) / PATH_WIDTH, 1);
    seg.position.set((ax + bx) / 2, 0.06, (az + bz) / 2);
    seg.rotation.y = -Math.atan2(bz - az, bx - ax);
    seg.receiveShadow = true;
    group.add(seg);

    // Petit disque de jonction aux coins pour masquer les angles.
    const joint = new THREE.Mesh(
      (() => { const g = new THREE.CircleGeometry(PATH_WIDTH / 2, 12); g.rotateX(-Math.PI / 2); ensureAOUV(g); return g; })(),
      mat
    );
    joint.position.set(ax, 0.065, az);
    joint.receiveShadow = true;
    group.add(joint);
  }
  return group;
}

/* --------------------------------------------------------------------
   Végétation / rochers en InstancedMesh.
   On disperse N instances en évitant le chemin et le château. Chaque
   instance a sa position (posée sur le terrain), rotation et échelle.
   -------------------------------------------------------------------- */
function scatterInstances(geo, mat, count, heightAt, {
  minPathDist = PATH_WIDTH + 1.5,
  minCastleDist = 10,
  scaleRange = [0.8, 1.4],
  yOffset = 0,
  jitterRot = true,
} = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  let placed = 0, attempts = 0;
  const maxAttempts = count * 20;

  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const x = (Math.random() - 0.5) * (WORLD.width - 4);
    const z = (Math.random() - 0.5) * (WORLD.depth - 4);
    // Rejet : trop près du chemin, du château, ou d'un plan d'eau.
    if (distanceToPath(x, z) < minPathDist) continue;
    if (Math.hypot(x - 0, z - (-6)) < minCastleDist) continue;
    if (isNearWater(x, z, 1.5)) continue;

    const s = THREE.MathUtils.lerp(scaleRange[0], scaleRange[1], Math.random());
    dummy.position.set(x, heightAt(x, z) + yOffset, z);
    dummy.rotation.y = jitterRot ? Math.random() * Math.PI * 2 : 0;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  // Si on n'a pas tout placé, on réduit le compte pour ne pas laisser
  // d'instances à la matrice identité (empilées à l'origine).
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/* ---- Géométries stylisées simples pour la végétation ---- */

function makePineGeo() {
  // Sapin stylisé : tronc + 2 cônes. On fusionne en une seule géométrie
  // pour qu'un arbre = une instance.
  const geos = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.16, 0.8, 5);
  trunk.translate(0, 0.4, 0);
  geos.push(trunk);
  const c1 = new THREE.ConeGeometry(0.9, 1.6, 7); c1.translate(0, 1.5, 0); geos.push(c1);
  const c2 = new THREE.ConeGeometry(0.65, 1.2, 7); c2.translate(0, 2.4, 0); geos.push(c2);
  return mergeGeometries(geos);
}

function makeBushGeo() {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  g.translate(0, 0.4, 0);
  return g;
}

function makeRockGeo() {
  const g = new THREE.DodecahedronGeometry(0.6, 0);
  // Déformation légère pour un aspect rocheux irrégulier.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i,
      p.getX(i) * (0.8 + Math.random() * 0.4),
      p.getY(i) * (0.7 + Math.random() * 0.3),
      p.getZ(i) * (0.8 + Math.random() * 0.4));
  }
  g.computeVertexNormals();
  g.translate(0, 0.3, 0);
  return g;
}

/* Fusion de géométries sans dépendre de BufferGeometryUtils (léger, maison).
   Suffisant pour nos petites géométries non indexées mixées. */
function mergeGeometries(geometries) {
  // On convertit chaque géométrie en non-indexée pour concaténer simplement.
  const nonIndexed = geometries.map(g => g.index ? g.toNonIndexed() : g);
  let vertexCount = 0;
  for (const g of nonIndexed) vertexCount += g.attributes.position.count;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  let offset = 0;
  for (const g of nonIndexed) {
    const p = g.attributes.position;
    g.computeVertexNormals();
    const n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      positions[(offset + i) * 3 + 0] = p.getX(i);
      positions[(offset + i) * 3 + 1] = p.getY(i);
      positions[(offset + i) * 3 + 2] = p.getZ(i);
      normals[(offset + i) * 3 + 0] = n.getX(i);
      normals[(offset + i) * 3 + 1] = n.getY(i);
      normals[(offset + i) * 3 + 2] = n.getZ(i);
    }
    offset += p.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return merged;
}

/* --------------------------------------------------------------------
   Point d'entrée : construit tout l'environnement et l'ajoute à la scène.
   @returns { group, heightAt }  (heightAt sert à poser d'autres objets)
   -------------------------------------------------------------------- */
export function buildEnvironment(scene, { quality = 'high' } = {}) {
  const group = new THREE.Group();
  const heightAt = makeHeightField();

  // Sol et chemin.
  group.add(buildTerrain(heightAt));
  group.add(buildPath());

  // Densité de végétation selon la qualité (réglable pour tenir le framerate).
  const density = quality === 'low'
    ? { pines: 40,  bushes: 30,  rocks: 20 }
    : { pines: 120, bushes: 90,  rocks: 50 };

  // Matériaux simples (couleur unie + réaction à l'environnement).
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x2f5233, roughness: 0.9, flatShading: true });
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.95, flatShading: true });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a6a68, roughness: 1.0, flatShading: true });

  const pines  = scatterInstances(makePineGeo(), pineMat, density.pines, heightAt,
    { scaleRange: [0.8, 1.6], minPathDist: PATH_WIDTH + 2 });
  const bushes = scatterInstances(makeBushGeo(), bushMat, density.bushes, heightAt,
    { scaleRange: [0.6, 1.3], minPathDist: PATH_WIDTH + 1 });
  const rocks  = scatterInstances(makeRockGeo(), rockMat, density.rocks, heightAt,
    { scaleRange: [0.5, 1.5], minPathDist: PATH_WIDTH + 0.5, minCastleDist: 9 });

  group.add(pines, bushes, rocks);
  scene.add(group);

  return {
    group,
    heightAt,
    stats: { pines: pines.count, bushes: bushes.count, rocks: rocks.count },
    dispose() { scene.remove(group); },
  };
}
