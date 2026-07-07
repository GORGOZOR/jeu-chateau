/* =====================================================================
   Château Fort — Entité Ennemi  (T3.7)
   ---------------------------------------------------------------------
   Un ennemi qui apparaît au départ du chemin, le suit jusqu'au château,
   et meurt s'il perd tous ses PV. Expose l'interface attendue par les
   tours (position, alive, pathProgress, takeDamage, applySlow).

   Gère : santé + barre de vie, armure (réduit les dégâts non perçants),
   ralentissement temporaire, comportements spéciaux (soin du chaman,
   dégâts au château pour le boss).

   Événements émis via callbacks : onDeath (donne l'or), onReachCastle
   (retire des PV au château).
   ===================================================================== */

import * as THREE from 'three';
import { damageMultiplier } from '../data/damage.js';
import { createStatusSet } from '../systems/status.js';
import { ELITE_AURAS } from '../data/enemies.js';
import { createModelInstance, clipDuration } from '../assets/modelLoader.js';

export function createEnemy(scene, config, path, { onDeath, onReachCastle, onSummon } = {}) {
  // --- Longueur cumulée du chemin (progress ↔ position) ---
  const segs = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, bx, bz, len, start: total });
    total += len;
  }

  // --- Rendu : un corps stylisé (couleur/taille selon le type) ---
  const bodyMat = new THREE.MeshStandardMaterial({
    color: config.color, roughness: 0.7,
    emissive: config.emissive ?? 0x000000,
    emissiveIntensity: config.emissive ? 0.4 : 0,
  });
  const s = config.size;
  const group = new THREE.Group();
  // corps (capsule approximée par cylindre + sphère)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.4, s * 0.5, s * 1.1, 6), bodyMat);
  body.position.y = s * 0.7; body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.4, 8, 6), bodyMat);
  head.position.y = s * 1.4; head.castShadow = true;
  group.add(head);
  // œil unique du cyclope
  if (config.id === 'cyclope') {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(s * 0.18, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xf0f0e0, roughness: 0.4 }));
    eyeWhite.position.set(0, s * 1.45, s * 0.32);
    group.add(eyeWhite);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(s * 0.08, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x992222, emissive: 0x551111, emissiveIntensity: 0.4 }));
    pupil.position.set(0, s * 1.45, s * 0.46);
    group.add(pupil);
  }
  // marqueur d'armure (chevalier) : un plastron plus clair
  if (config.armor) {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(s * 0.9, s * 0.7, s * 0.5),
      new THREE.MeshStandardMaterial({ color: 0xcfd4dc, roughness: 0.4, metalness: 0.5 })
    );
    plate.position.y = s * 0.75;
    group.add(plate);
  }
  // aura de soin (chaman) : un anneau translucide
  let healRing = null;
  if (config.heal) {
    healRing = new THREE.Mesh(
      new THREE.TorusGeometry(config.heal.radius * 0.5, 0.06, 6, 20),
      new THREE.MeshStandardMaterial({
        color: 0x8affaa, emissive: 0x2a8a4a, emissiveIntensity: 0.4,
        transparent: true, opacity: 0.5,
      })
    );
    healRing.rotation.x = Math.PI / 2;
    healRing.position.y = 0.1;
    group.add(healRing);
  }

  // bulle de bouclier (T4.3) : sphère translucide autour du porte-bouclier.
  let shieldBubble = null;
  if (config.shield) {
    shieldBubble = new THREE.Mesh(
      new THREE.SphereGeometry(s * 1.1, 12, 10),
      new THREE.MeshStandardMaterial({
        color: 0x66aaff, emissive: 0x2255aa, emissiveIntensity: 0.3,
        transparent: true, opacity: 0.35,
      })
    );
    shieldBubble.position.y = s * 0.8;
    group.add(shieldBubble);
  }

  // ailes de la gargouille (T4.3) : deux plans triangulaires.
  if (config.flying) {
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x4a4a5a, roughness: 0.8, side: THREE.DoubleSide,
    });
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.9, s * 0.6), wingMat);
      wing.position.set(side * s * 0.5, s * 1.0, -s * 0.1);
      wing.rotation.y = side * 0.6;
      group.add(wing);
    }
  }

  // bâton du nécromancien (T4.3) : un sceptre avec une pointe violette.
  if (config.summon) {
    const staff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, s * 1.4, 5),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 })
    );
    staff.position.set(s * 0.4, s * 0.8, 0);
    group.add(staff);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(s * 0.18, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xaa44dd, emissive: 0x662299, emissiveIntensity: 0.5 })
    );
    orb.position.set(s * 0.4, s * 1.5, 0);
    group.add(orb);
  }

  // Aura d'élite (T4.3+) : un disque coloré au sol + config de l'effet.
  const auraDef = config.aura ? ELITE_AURAS[config.aura] : null;
  let auraDisc = null;
  if (auraDef) {
    auraDisc = new THREE.Mesh(
      new THREE.CircleGeometry(auraDef.radius, 32),
      new THREE.MeshBasicMaterial({
        color: auraDef.color, transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    auraDisc.rotation.x = -Math.PI / 2; // à plat sur le sol
    auraDisc.position.y = 0.05;
    group.add(auraDisc);
    // anneau plus marqué sur le bord
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(auraDef.radius, 0.12, 6, 40),
      new THREE.MeshStandardMaterial({
        color: auraDef.color, emissive: auraDef.color, emissiveIntensity: 0.4,
        transparent: true, opacity: 0.6,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);
  }
  const serpentSegments = [];
  if (config.serpent) {
    const n = config.segments || 6;
    for (let i = 0; i < n; i++) {
      const segS = s * (0.55 - i * 0.03);
      const seg = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.12, segS), 8, 6), bodyMat
      );
      seg.castShadow = true;
      seg.position.y = segS; // posé au sol
      scene.add(seg);        // les segments vivent dans la scène (positions monde)
      serpentSegments.push({ mesh: seg, radius: segS });
    }
  }
  // Historique des positions de la tête (pour placer les segments derrière).
  const trail = [];

  // --- Barre de vie ---
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(s * 1.4, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x220000 }));
  const barFg = new THREE.Mesh(new THREE.PlaneGeometry(s * 1.4, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x33dd33 }));
  barFg.position.z = 0.01;
  const bar = new THREE.Group();
  bar.add(barBg); bar.add(barFg);
  bar.position.y = s * 2.0;
  group.add(bar);

  scene.add(group);

  // --- Modèle glTF (T5.1) : si disponible, il remplace le corps procédural.
  // Sinon (modèle absent/échec), on garde le corps stylisé → fallback.
  let modelInst = null;
  const bodyParts = [body, head]; // parties procédurales à masquer si modèle
  if (config.model) {
    modelInst = createModelInstance(config.model);
    if (modelInst) {
      const sc = config.modelScale || 1;
      modelInst.scene.scale.setScalar(sc);
      // oriente le modèle vers l'avant du chemin (ajusté à l'update).
      group.add(modelInst.scene);
      // masque le corps procédural (on garde la barre de vie).
      for (const p of bodyParts) p.visible = false;
      // lance l'animation de déplacement en boucle.
      const moveAnim = config.anims?.move;
      if (moveAnim) modelInst.play(moveAnim, { loop: true });
    }
  }

  // --- État ---
  let dist = 0;
  let hp = config.hp;
  const maxHp = config.hp;
  let slowT = 0, slowFactor = 1;
  let hasteT = 0, hasteFactor = 1;   // accélération temporaire (aura de vitesse)
  const status = createStatusSet(); // effets de statut cumulables (T4.2)
  // Capacités (T4.3)
  let shield = config.shield ? config.shield.amount : 0;
  let shieldMax = config.shield ? config.shield.amount : 0;
  let shieldRegenTimer = 0;      // délai avant régénération du bouclier
  let summonTimer = config.summon ? config.summon.interval : 0;
  const flyY = config.flying ? (config.flyHeight || 3) : 0;
  // Place le visuel au DÉPART du chemin dès la création (avant le 1er update),
  // sinon le groupe reste à l'origine (près du château) le temps d'une frame.
  group.position.set(path[0][0], flyY, path[0][1]);
  let hitFlash = 0;
  let hitPunch = 0;   // secousse d'échelle à l'impact (T1.6), modèle ou procédural
  let healTimer = 0;
  let auraHealTimer = 0;      // timer de l'aura de soin d'élite
  let dead = false;
  let reached = false;

  const enemy = {
    config,
    position: new THREE.Vector3(path[0][0], 0, path[0][1]),
    get alive() { return !dead && !reached; },
    get pathProgress() { return dist / total; },
    get hp() { return hp; },
    get isElite() { return !!config.elite; },
    get flying() { return !!config.flying; },
    get shield() { return shield; },
    /** Place l'ennemi à une distance donnée sur le chemin (pour l'invocation). */
    setProgress(distance) { dist = Math.max(0, Math.min(total, distance)); },
    group,

    /**
     * Reçoit des dégâts. L'armure réduit les dégâts NON perçants.
     * @param {number} amount
     * @param {object} [opts]  { type, dmgType }  dmgType = type élémentaire (matrice T3.8)
     */
    takeDamage(amount, opts = {}) {
      if (dead || reached) return;
      let dmg = amount;
      // Matrice de résistances (T3.8) : le type de dégât élémentaire de la
      // tour (opts.dmgType) est multiplié selon les résistances de l'ennemi.
      if (opts.dmgType) {
        dmg *= damageMultiplier(config.id, opts.dmgType);
        // Vulnérabilité (T4.2) : amplifie les dégâts du type ciblé.
        dmg *= status.damageTakenMultiplier(opts.dmgType);
      }
      // Bouclier régénérant (T4.3) : absorbe d'abord, bloque la régén.
      if (shieldMax > 0) {
        shieldRegenTimer = config.shield.regenDelay;
        if (shield > 0) {
          const absorbed = Math.min(shield, dmg);
          shield -= absorbed;
          dmg -= absorbed;
        }
      }
      hp -= dmg;
      hitFlash = 0.1;
      hitPunch = 0.14;   // pop visuel (T1.6)
      if (hp <= 0) { hp = 0; die(); }
    },

    applySlow(factor, duration) {
      slowFactor = factor;
      slowT = Math.max(slowT, duration);
    },

    /**
     * Applique un statut cumulable (T4.2).
     * @param {string} id       burn | poison | chill | vulnerable
     * @param {number} duration durée (s)
     * @param {object} [opts]   { stacks, type }
     */
    applyStatus(id, duration, opts = {}) {
      if (dead || reached) return;
      status.apply(id, duration, opts);
    },
    /** Accélère temporairement (aura de vitesse d'élite). */
    applyHaste(factor, duration) {
      hasteFactor = factor; hasteT = Math.max(hasteT, duration);
    },
    get aura() { return config.aura || null; },
    get auraRadius() { return auraDef ? auraDef.radius : 0; },
    get status() { return status; },

    /** Soigne (utilisé par le chaman sur ses voisins). */
    heal(amount) {
      if (dead || reached) return;
      hp = Math.min(maxHp, hp + amount);
    },

    /**
     * Avance l'ennemi + gère soin/barre de vie.
     * @param {number} dt
     * @param {Array} allEnemies  pour le soin de zone du chaman
     * @param {THREE.Camera} camera
     */
    update(dt, allEnemies, camera) {
      if (dead || reached) return;

      // déplacement (ralenti si gelé)
      // Statuts (T4.2) : DoT (brûlure/poison) + purge des expirés.
      const statusDmg = status.tick(dt);
      for (const d of statusDmg) {
        hp -= d.amount * damageMultiplier(config.id, d.dmgType);
      }
      if (hp <= 0 && !dead) { hp = 0; die(); return; }

      // Vitesse : combine le ralenti ponctuel (applySlow) et le gel de statut.
      const statusSlow = status.slowFactor();          // 1 = normal, <1 = gelé
      const punctualSlow = slowT > 0 ? slowFactor : 1;
      const haste = hasteT > 0 ? hasteFactor : 1;       // aura de vitesse
      const v = config.speed * Math.min(statusSlow, punctualSlow) * haste;
      dist += v * dt;
      if (slowT > 0) slowT -= dt;
      if (hasteT > 0) hasteT -= dt;
      if (dist >= total) { reachCastle(); return; }

      // position sur le chemin
      let d = dist;
      let headingSeg = segs[segs.length - 1];
      for (const seg of segs) {
        if (d <= seg.len || seg === segs[segs.length - 1]) {
          const t = Math.min(1, d / seg.len);
          this.position.set(seg.ax + (seg.bx - seg.ax) * t, 0, seg.az + (seg.bz - seg.az) * t);
          headingSeg = seg;
          break;
        }
        d -= seg.len;
      }
      group.position.copy(this.position);
      // Vol (T4.3) : le visuel plane en hauteur (léger bobbing), mais la
      // position logique (x,z) reste au sol pour le ciblage/distance.
      if (flyY > 0) {
        group.position.y = flyY + Math.sin(dist * 2) * 0.2;
      }
      // Orientation du modèle (T5.1) : face à la direction du chemin.
      if (modelInst) {
        const hx = headingSeg.bx - headingSeg.ax, hz = headingSeg.bz - headingSeg.az;
        if (hx || hz) group.rotation.y = Math.atan2(hx, hz);
      }
      // Secousse d'impact (T1.6) : petit pop d'échelle qui retombe. Universel
      // (agit sur le groupe → modèle glTF comme corps procédural).
      if (hitPunch > 0) {
        hitPunch = Math.max(0, hitPunch - dt);
        group.scale.setScalar(1 + 0.22 * (hitPunch / 0.14));
      } else if (group.scale.x !== 1) {
        group.scale.setScalar(1);
      }

      // Bouclier régénérant (T4.3) : après un délai sans être touché, il
      // se recharge progressivement.
      if (shieldMax > 0) {
        if (shieldRegenTimer > 0) shieldRegenTimer -= dt;
        else if (shield < shieldMax) {
          shield = Math.min(shieldMax, shield + config.shield.regen * dt);
        }
        // la bulle s'estompe quand le bouclier baisse, disparaît à 0.
        if (shieldBubble) {
          const ratio = shield / shieldMax;
          shieldBubble.material.opacity = 0.35 * ratio;
          shieldBubble.visible = shield > 0.5;
        }
      }

      // Invocation (T4.3) : le nécromancien fait apparaître des renforts.
      if (config.summon && onSummon) {
        summonTimer -= dt;
        if (summonTimer <= 0) {
          summonTimer = config.summon.interval;
          onSummon(this, config.summon.type, config.summon.count, dist);
        }
      }

      // Corps ondulant du serpent : on enregistre la position de la tête et on
      // place chaque segment à une distance croissante derrière, avec un léger
      // balancement latéral (ondulation).
      if (config.serpent && serpentSegments.length) {
        trail.unshift({ x: this.position.x, z: this.position.z, t: (trail[0]?.t || 0) + v * dt });
        if (trail.length > 200) trail.pop();
        const spacing = s * 0.7; // écart entre segments
        for (let i = 0; i < serpentSegments.length; i++) {
          const back = spacing * (i + 1);
          // cherche dans la traîne le point à distance 'back' derrière la tête
          const headT = trail[0].t;
          let px = this.position.x, pz = this.position.z;
          for (const pt of trail) {
            if (headT - pt.t >= back) { px = pt.x; pz = pt.z; break; }
          }
          // ondulation latérale
          const wobble = Math.sin(headT * 3 - i * 0.8) * s * 0.15;
          serpentSegments[i].mesh.position.set(px, serpentSegments[i].radius, pz + wobble);
        }
      }

      // soin de zone (chaman)
      if (config.heal && allEnemies) {
        healTimer -= dt;
        if (healTimer <= 0) {
          healTimer = config.heal.interval;
          const r2 = config.heal.radius * config.heal.radius;
          for (const o of allEnemies) {
            if (o === this || !o.alive) continue;
            const dx = o.position.x - this.position.x, dz = o.position.z - this.position.z;
            if (dx * dx + dz * dz <= r2) o.heal(config.heal.amount);
          }
        }
        if (healRing) healRing.rotation.z += dt * 1.5;
      }

      // Auras d'élite (T4.3+) : effet de zone autour de l'élite.
      if (auraDef && allEnemies) {
        const r2 = auraDef.radius * auraDef.radius;
        if (auraDef.id === 'healAura') {
          auraHealTimer -= dt;
          if (auraHealTimer <= 0) {
            auraHealTimer = auraDef.interval;
            for (const o of allEnemies) {
              if (!o.alive) continue;
              const dx = o.position.x - this.position.x, dz = o.position.z - this.position.z;
              if (dx * dx + dz * dz <= r2) o.heal(auraDef.heal);
            }
          }
        } else if (auraDef.id === 'hasteAura') {
          // accélère les alliés proches (drapeau lu par leur déplacement).
          for (const o of allEnemies) {
            if (!o.alive || o === this) continue;
            const dx = o.position.x - this.position.x, dz = o.position.z - this.position.z;
            if (dx * dx + dz * dz <= r2) o.applyHaste?.(auraDef.speedMult, 0.3);
          }
        }
        // l'aura 'disable' est gérée côté tours (via getter aura/auraRadius).
        if (auraDisc) auraDisc.material.opacity = 0.18 + Math.sin(dist * 3) * 0.05;
      }

      // apparence : flash blanc si touché, teinte bleue si ralenti
      // Apparence : flash blanc si touché, sinon teinte du statut dominant,
      // sinon gel ponctuel, sinon couleur normale.
      if (hitFlash > 0) { bodyMat.color.setHex(0xffffff); hitFlash -= dt; }
      else {
        const st = status.list();
        if (st.length) {
          // teinte du statut le plus « fort » (dernier appliqué en priorité feu>poison>gel).
          const priority = ['burn', 'poison', 'chill', 'vulnerable'];
          const dominant = priority.find(id => status.has(id));
          const found = st.find(s => s.id === dominant) || st[0];
          bodyMat.color.setHex(found.color);
        }
        else if (slowT > 0) bodyMat.color.setHex(0x88bbff);
        else bodyMat.color.setHex(config.color);
      }

      // barre de vie
      const ratio = Math.max(0, hp / maxHp);
      barFg.scale.x = ratio;
      barFg.position.x = -(s * 1.4) * 0.5 * (1 - ratio);
      barFg.material.color.setHex(ratio > 0.5 ? 0x33dd33 : ratio > 0.25 ? 0xdddd33 : 0xdd3333);
      if (camera) bar.quaternion.copy(camera.quaternion);
    },

    dispose() { removeAll(); },
  };

  // Retire le groupe principal + les segments du serpent de la scène.
  function removeAll() {
    scene.remove(group);
    for (const seg of serpentSegments) scene.remove(seg.mesh);
    if (modelInst) modelInst.dispose();
  }

  function die() {
    if (dead) return;
    dead = true;
    onDeath?.(enemy, config.gold); // or + retrait de la liste : immédiat
    // Si le modèle a une animation de mort, on la joue puis on retire le
    // visuel à la fin (le mixer continue via updateMixers). Sinon, retrait
    // immédiat (fallback procédural).
    const deathAnim = config.anims?.death;
    if (modelInst && deathAnim) {
      if (bar) bar.visible = false;               // masque la barre de vie
      modelInst.play(deathAnim, { loop: false, clampWhenFinished: true, fade: 0.15 });
      const dur = clipDuration(config.model, deathAnim) || 1.5;
      setTimeout(removeAll, dur * 1000 + 200);
    } else {
      removeAll();
    }
  }
  function reachCastle() {
    if (reached) return;
    reached = true;
    removeAll();
    onReachCastle?.(enemy, config.castleDamage ?? 1);
  }

  return enemy;
}
