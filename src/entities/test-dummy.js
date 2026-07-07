/* =====================================================================
   Château Fort — Cible fictive de test  (outil de debug T3.5 / T3.6)
   ---------------------------------------------------------------------
   Un « ennemi » factice pour VÉRIFIER dans le navigateur que les tours
   ciblent, tirent et appliquent leurs effets (dégâts, ralentissement,
   zone, spécialisations). Ce n'est PAS l'ennemi final du jeu (T3.7) :
   c'est un cube visible qui suit le chemin et expose l'interface qu'une
   tour attend (position, alive, pathProgress, takeDamage, applySlow).

   Réactions visuelles :
     - clignote en rouge quand il prend des dégâts,
     - vire au bleu quand il est ralenti,
     - une barre de vie flotte au-dessus,
     - se régénère en boucle pour un test continu.
   ===================================================================== */

import * as THREE from 'three';
import { PATH } from '../data/path.js';

export function createTestDummy(scene, { maxHp = 300, speed = 4 } = {}) {
  // Corps : un cube bien visible.
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcc4444, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 1), bodyMat);
  body.castShadow = true;

  // Barre de vie (deux plans : fond + jauge) qui regardent la caméra.
  const barBg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.16),
    new THREE.MeshBasicMaterial({ color: 0x222222 })
  );
  const barFg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.16),
    new THREE.MeshBasicMaterial({ color: 0x44dd44 })
  );
  barFg.position.z = 0.01;
  const bar = new THREE.Group();
  bar.add(barBg); bar.add(barFg);
  bar.position.y = 1.3;

  const group = new THREE.Group();
  group.add(body); group.add(bar);
  scene.add(group);

  // Longueur cumulée du chemin (pour convertir progress ↔ position).
  const segs = [];
  let total = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, bx, bz, len, start: total });
    total += len;
  }

  let dist = 0;           // distance parcourue sur le chemin
  let hp = maxHp;
  let slowT = 0, slowFactor = 1;
  let hitFlash = 0;

  const dummy = {
    // --- interface attendue par les tours ---
    position: new THREE.Vector3(PATH[0][0], 0.7, PATH[0][1]),
    alive: true,
    get pathProgress() { return dist / total; },
    takeDamage(d, opts = {}) {
      hp = Math.max(0, hp - d);
      hitFlash = 0.12;
      // Le cube n'est pas retiré par les tours : il encaisse et poursuit sa
      // route jusqu'au château (test de survie). Sa vie descend juste.
    },
    applySlow(factor, duration) {
      slowFactor = factor; slowT = Math.max(slowT, duration);
    },

    // --- animation de la cible ---
    update(dt, camera) {
      // avance sur le chemin (ralenti si gelé).
      const v = speed * (slowT > 0 ? slowFactor : 1);
      dist += v * dt;
      if (dist >= total) {
        // Atteint le château : reboucle un nouveau tour avec la vie pleine.
        dist = 0; hp = maxHp; slowT = 0;
      }
      if (slowT > 0) slowT -= dt;

      // position sur le chemin
      let d = dist;
      for (const s of segs) {
        if (d <= s.len || s === segs[segs.length - 1]) {
          const t = Math.min(1, d / s.len);
          this.position.set(s.ax + (s.bx - s.ax) * t, 0.7, s.az + (s.bz - s.az) * t);
          break;
        }
        d -= s.len;
      }
      group.position.copy(this.position);

      // couleur : rouge flash si touché, bleu si ralenti, sinon normal.
      if (hitFlash > 0) { bodyMat.color.setHex(0xffffff); hitFlash -= dt; }
      else if (slowT > 0) bodyMat.color.setHex(0x66aaff);
      else bodyMat.color.setHex(0xcc4444);

      // barre de vie
      const ratio = Math.max(0, hp / maxHp);
      barFg.scale.x = ratio;
      barFg.position.x = -0.6 * (1 - ratio);
      if (camera) bar.quaternion.copy(camera.quaternion);
    },

    get hp() { return hp; },
    dispose() { scene.remove(group); },
  };

  return dummy;
}
