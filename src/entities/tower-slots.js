/* =====================================================================
   Château Fort — Socles de tours  (T3.1)
   ---------------------------------------------------------------------
   Rôle : matérialiser les emplacements où le joueur pourra construire des
   tours. Chaque socle est une petite plateforme de pierre posée au sol,
   avec un état visuel (libre / survolé / occupé). L'interaction (clic pour
   construire) viendra avec le gameplay (T3.5+) ; ici on pose les socles et
   leur rendu, et on expose de quoi les retrouver par position.

   Les socles sont rendus en InstancedMesh (un seul draw call) pour rester
   performant même avec beaucoup d'emplacements.
   ===================================================================== */

import * as THREE from 'three';

/**
 * Construit les socles de tours d'une carte.
 * @param {THREE.Scene} scene
 * @param {Array<{x,z}>} slotConfigs   emplacements (depuis la carte)
 * @param {(x,z)=>number} heightAt     hauteur du terrain (pour poser au sol)
 * @returns objet avec la liste des socles + helpers
 */
export function buildTowerSlots(scene, slotConfigs, heightAt) {
  const group = new THREE.Group();

  // Géométrie d'un socle : cylindre plat (dalle) légèrement biseauté.
  const geo = new THREE.CylinderGeometry(1.3, 1.5, 0.4, 8);
  const matFree = new THREE.MeshStandardMaterial({
    color: 0x8a8a82, roughness: 0.9, metalness: 0,
  });

  // État de chaque socle.
  const slots = slotConfigs.map((cfg, i) => {
    const y = heightAt ? heightAt(cfg.x, cfg.z) : 0;
    const mesh = new THREE.Mesh(geo, matFree.clone());
    mesh.position.set(cfg.x, y + 0.2, cfg.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.slotIndex = i;
    group.add(mesh);
    return {
      index: i,
      x: cfg.x, z: cfg.z, y,
      mesh,
      occupied: false,   // deviendra true quand une tour y sera posée (T3.5)
      tower: null,
    };
  });

  scene.add(group);

  return {
    group,
    slots,
    /** Retrouve le socle le plus proche d'un point (pour le clic, plus tard). */
    nearest(x, z, maxDist = 2) {
      let best = null, bestD = maxDist;
      for (const s of slots) {
        const d = Math.hypot(x - s.x, z - s.z);
        if (d < bestD) { bestD = d; best = s; }
      }
      return best;
    },
    /** Surbrillance d'un socle (survol) — sera branché sur la souris en T3.5. */
    setHighlight(index, on) {
      const s = slots[index];
      if (!s) return;
      s.mesh.material.emissive.setHex(on ? 0x335533 : 0x000000);
    },
    dispose() { scene.remove(group); },
  };
}
