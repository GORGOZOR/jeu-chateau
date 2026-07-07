/* =====================================================================
   Château Fort — Projectiles et effets de tir  (T2.7)
   ---------------------------------------------------------------------
   Fait voler un projectile de la tour vers sa cible et joue un impact.
   Un type de projectile par tour :
     - 'arrow'     (archers)  : fine flèche, vol tendu et rapide
     - 'bolt'      (baliste)  : gros carreau, très rapide
     - 'fireball'  (mage)     : boule de feu lumineuse + traînée + explosion
     - 'frostbolt' (glace)    : éclat bleu + petit nuage de givre à l'impact

   Les projectiles sont mis en commun (pooling) et se servent du système de
   particules pour les traînées et impacts. Léger et sans dépendance au
   gameplay : on lui donne un point de départ, une cible, un type.
   ===================================================================== */

import * as THREE from 'three';

// Géométries/matériaux partagés (créés une fois).
let shared = null;
function getShared() {
  if (shared) return shared;
  shared = {
    arrow: {
      geo: new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5),
      mat: new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.7 }),
      speed: 40, color: 0xffffff,
    },
    bolt: {
      geo: new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6),
      mat: new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.6, metalness: 0.3 }),
      speed: 55, color: 0xcccccc,
    },
    fireball: {
      geo: new THREE.SphereGeometry(0.22, 10, 8),
      mat: new THREE.MeshStandardMaterial({
        color: 0xff7a2a, emissive: 0xff4400, emissiveIntensity: 0.9, roughness: 0.4,
      }),
      speed: 26, color: 0xff5a20,
    },
    frostbolt: {
      geo: new THREE.OctahedronGeometry(0.18, 0),
      mat: new THREE.MeshStandardMaterial({
        color: 0xafe0ff, emissive: 0x3a6a8a, emissiveIntensity: 0.3, roughness: 0.3,
      }),
      speed: 34, color: 0x9fd8ff,
    },
  };
  return shared;
}

/**
 * Crée le gestionnaire de projectiles.
 * @param {THREE.Scene} scene
 * @param {object} [particles]  système de particules (T2.6) pour traînées/impacts
 */
export function createProjectileSystem(scene, particles = null) {
  const active = [];       // projectiles en vol
  const pool = [];         // meshes recyclables (par type)

  function acquireMesh(type) {
    const s = getShared()[type] || getShared().arrow;
    // cherche un mesh libre du bon type
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].userData.ptype === type && !pool[i].visible) {
        pool[i].visible = true;
        return pool[i];
      }
    }
    const m = new THREE.Mesh(s.geo, s.mat);
    m.userData.ptype = type;
    m.castShadow = false;
    scene.add(m);
    pool.push(m);
    return m;
  }

  return {
    /**
     * Lance un projectile depuis une position vers une cible.
     * @param {string} type  'arrow' | 'bolt' | 'fireball' | 'frostbolt'
     * @param {THREE.Vector3|{x,y,z}} from
     * @param {object} target  ennemi ciblé (doit avoir .position)
     */
    fire(type, from, target) {
      const s = getShared()[type] || getShared().arrow;
      const mesh = acquireMesh(type);
      const start = new THREE.Vector3(from.x, from.y, from.z);
      mesh.position.copy(start);
      active.push({
        mesh, type, speed: s.speed, target,
        // on mémorise une position cible figée (au cas où la cible disparaît)
        aim: new THREE.Vector3(target.position.x, target.position.y ?? 0.7, target.position.z),
        traveled: 0,
      });
    },

    /** À appeler chaque frame : fait avancer les projectiles et gère l'impact. */
    update(dt) {
      for (let i = active.length - 1; i >= 0; i--) {
        const p = active[i];
        // cible mobile : réajuste le point visé si la cible est encore vivante
        if (p.target && p.target.alive) {
          p.aim.set(p.target.position.x, p.target.position.y ?? 0.7, p.target.position.z);
        }
        const dir = new THREE.Vector3().subVectors(p.aim, p.mesh.position);
        const dist = dir.length();
        const step = p.speed * dt;

        // Traînée de feu pour la boule de feu.
        if (p.type === 'fireball' && particles) {
          // (léger : on ne crée pas un émetteur par projectile ; on pourrait
          //  ajouter une traînée dédiée en T5, ici on garde simple)
        }

        if (dist <= step || dist < 0.4) {
          // IMPACT : effet selon le type puis on recycle le projectile.
          this.impact(p.type, p.aim);
          p.mesh.visible = false;
          active.splice(i, 1);
          continue;
        }
        dir.normalize();
        p.mesh.position.addScaledVector(dir, step);
        // orienter le projectile dans sa direction de vol
        if (p.type === 'arrow' || p.type === 'bolt') {
          const axis = new THREE.Vector3(0, 1, 0);
          p.mesh.quaternion.setFromUnitVectors(axis, dir);
        } else {
          p.mesh.rotation.x += dt * 6;
          p.mesh.rotation.y += dt * 6;
        }
      }
    },

    /** Joue l'effet d'impact à une position (utilise les particules si dispo). */
    impact(type, pos) {
      if (!particles) return;
      const p = new THREE.Vector3(pos.x, pos.y, pos.z);
      if (type === 'fireball') {
        const e = particles.createEmitter({
          max: 40, rate: 0, life: 0.5, lifeVar: 0.2,
          position: p, velocity: new THREE.Vector3(0, 2, 0), spread: 5,
          gravity: new THREE.Vector3(0, -4, 0),
          colorStart: new THREE.Color(0xffcc55), colorEnd: new THREE.Color(0xcc3300),
          sizeStart: 9, sizeEnd: 1, blending: THREE.AdditiveBlending,
        });
        e.burst(30);
        this._autoDispose(e);
      } else if (type === 'frostbolt') {
        const e = particles.createEmitter({
          max: 30, rate: 0, life: 0.6, lifeVar: 0.2,
          position: p, velocity: new THREE.Vector3(0, 1, 0), spread: 3,
          gravity: new THREE.Vector3(0, -2, 0),
          colorStart: new THREE.Color(0xdff2ff), colorEnd: new THREE.Color(0x5a9ac0),
          sizeStart: 7, sizeEnd: 1, blending: THREE.AdditiveBlending,
        });
        e.burst(20);
        this._autoDispose(e);
      } else {
        // flèche / carreau : petite poussière d'impact discrète
        const e = particles.createEmitter({
          max: 16, rate: 0, life: 0.35, lifeVar: 0.1,
          position: p, velocity: new THREE.Vector3(0, 1, 0), spread: 2,
          gravity: new THREE.Vector3(0, -5, 0),
          colorStart: new THREE.Color(0xccbb99), colorEnd: new THREE.Color(0x776655),
          sizeStart: 5, sizeEnd: 1, blending: THREE.NormalBlending,
        });
        e.burst(10);
        this._autoDispose(e);
      }
    },

    // Retire un émetteur d'impact quand ses particules sont éteintes.
    _autoDispose(emitter) {
      setTimeout(() => emitter.dispose(), 1200);
    },

    get activeCount() { return active.length; },
    dispose() {
      for (const m of pool) scene.remove(m);
      pool.length = 0; active.length = 0;
    },
  };
}
