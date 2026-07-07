/* =====================================================================
   Château Fort — Entité Tour  (T3.5)
   ---------------------------------------------------------------------
   Une tour posée sur un socle. Responsabilités :
     - RENDU : une silhouette stylisée propre à chaque type, qui évolue
       visuellement à chaque niveau (montée en gamme).
     - COMBAT : détecter les ennemis à portée, choisir une cible selon une
       logique, et tirer à la cadence de la tour.

   La logique de combat est découplée des ennemis concrets : la tour reçoit
   une liste d'« ennemis » (objets ayant .position {x,y,z}, .alive, et une
   méthode .takeDamage(d)). Elle est donc testable avec des cibles fictives
   avant même que les vrais ennemis existent (T3.7).

   Le tir produit un événement (onFire) que la couche gameplay branchera
   sur les projectiles/effets (T2.7). Ici, on gère la cadence et le choix
   de cible ; l'application des dégâts est faite via un callback.
   ===================================================================== */

import * as THREE from 'three';
import { TOWER_TYPES, getSpecializations } from '../data/towers.js';
import { makePBRMaterial } from '../render/materials.js';
import { TOWER_DAMAGE_TYPE } from '../data/damage.js';
import { TARGET_MODES } from '../systems/targeting.js';

/* --------------------------------------------------------------------
   Tour d'ARCHERS : tour de guet en bois qui se fortifie par niveau.
     - niveau 1 : 1 archer,  plateforme ouverte (sans toit)
     - niveau 2 : 3 archers, toit léger sur poteaux (ouvert sur les côtés)
     - niveau 3 : 5 archers, toit fermé en planches
   Construite en géométrie procédurale + texture bois partagée.
   -------------------------------------------------------------------- */

let _woodMat = null, _darkWoodMat = null, _archerMat = null;
function woodMaterials() {
  if (!_woodMat) {
    _woodMat = makePBRMaterial('wood', { repeat: 1, ext: 'jpg', hasMetallic: true });
    _darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x5a4029, roughness: 0.85 });
    _archerMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.7 });
  }
  return { wood: _woodMat, dark: _darkWoodMat, archer: _archerMat };
}

// Figurine d'archer stylisée (silhouette low-poly + arc).
function buildArcherFigure() {
  const { archer } = woodMaterials();
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.55, 6), archer);
  body.position.y = 0.28; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), archer);
  head.position.y = 0.66; head.castShadow = true;
  g.add(head);
  const bow = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.03, 6, 12, Math.PI * 1.3),
    new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.7 })
  );
  bow.position.set(0.18, 0.35, 0);
  bow.rotation.z = Math.PI / 2;
  g.add(bow);
  return g;
}

// Positions des archers sur la plateforme selon le niveau (1, 3, 5).
function archerPositions(level) {
  if (level === 1) return [[0, 0]];
  if (level === 2) return [[-0.5, -0.3], [0.5, -0.3], [0, 0.5]];
  return [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5], [0, 0]];
}

function buildArchersTower(level) {
  const { wood, dark } = woodMaterials();
  const g = new THREE.Group();

  const postH = 2.2;
  const half = 0.85;
  const platformY = postH;

  // 4 poteaux d'angle.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, postH, 6), wood);
    post.position.set(sx * half, postH / 2, sz * half);
    post.castShadow = true;
    g.add(post);
  }

  // Croisillons de renfort en X sur deux faces.
  for (const sz of [-1, 1]) {
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(half * 2.3, 0.08, 0.08), dark);
    b1.position.set(0, postH * 0.5, sz * half); b1.rotation.z = 0.5; g.add(b1);
    const b2 = b1.clone(); b2.rotation.z = -0.5; g.add(b2);
  }

  // Plateforme.
  const platform = new THREE.Mesh(new THREE.BoxGeometry(half * 2.2, 0.18, half * 2.2), wood);
  platform.position.y = platformY;
  platform.castShadow = true; platform.receiveShadow = true;
  g.add(platform);

  // Garde-corps.
  const railY = platformY + 0.35;
  for (const [ax, az, len, rot] of [
    [0, -half, half * 2.2, 0], [0, half, half * 2.2, 0],
    [-half, 0, half * 2.2, Math.PI / 2], [half, 0, half * 2.2, Math.PI / 2],
  ]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.07), dark);
    rail.position.set(ax, railY, az); rail.rotation.y = rot;
    g.add(rail);
  }

  // Échelle.
  const ladder = new THREE.Group();
  for (const mx of [-0.18, 0.18]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, postH, 0.05), dark);
    rail.position.set(mx, postH / 2, 0); ladder.add(rail);
  }
  for (let ry = 0.3; ry < postH; ry += 0.35) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), dark);
    rung.position.set(0, ry, 0); ladder.add(rung);
  }
  ladder.position.set(0, 0, half + 0.05);
  g.add(ladder);

  // Archers (1 / 3 / 5). Chaque archer est dans un pivot placé à sa position,
  // qui tourne SUR LUI-MÊME pour viser (la tour, elle, reste fixe).
  const archerPivots = [];
  for (const [px, pz] of archerPositions(level)) {
    const pivot = new THREE.Group();
    pivot.position.set(px, platformY + 0.09, pz);
    const fig = buildArcherFigure();
    pivot.add(fig);
    g.add(pivot);
    archerPivots.push(pivot);
  }
  // Exposé pour que la logique de tir oriente les archers (pas la tour).
  g.userData.aimParts = archerPivots;

  // Toit progressif.
  if (level >= 2) {
    const roofPostH = 0.8;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const rp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, roofPostH, 5), dark);
      rp.position.set(sx * half, platformY + 0.18 + roofPostH / 2, sz * half);
      g.add(rp);
    }
    const roofBaseY = platformY + 0.18 + roofPostH;
    if (level === 2) {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(half * 1.7, 0.9, 4), wood);
      roof.position.y = roofBaseY + 0.45; roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      g.add(roof);
    } else {
      for (const [ax, az, len, rot] of [
        [0, -half, half * 2, 0], [0, half, half * 2, 0],
        [-half, 0, half * 2, Math.PI / 2], [half, 0, half * 2, Math.PI / 2],
      ]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 0.08), wood);
        wall.position.set(ax, roofBaseY + 0.25, az); wall.rotation.y = rot;
        g.add(wall);
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(half * 1.9, 1.1, 4), dark);
      roof.position.y = roofBaseY + 1.05; roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      g.add(roof);
    }
  }

  return g;
}

/* --------------------------------------------------------------------
   BALISTE : grosse arbalète de siège sur piètement en croix.
     - niveau 1 : 1 arc, 1 trait
     - niveau 2 : 2 arcs en tandem, 2 traits (double monture)
     - niveau 3 : identique au niveau 2, mais plus grande
   Inspirée des références (piètement en X, rail de bois, arcs latéraux,
   corde, gros carreau), construite en géométrie procédurale.
   -------------------------------------------------------------------- */
function buildBalisteTower(level) {
  const { wood, dark } = woodMaterials();
  const g = new THREE.Group();

  // niveau 3 = même monture que niv.2 mais plus grande.
  const scale = level === 3 ? 1.35 : 1.0;
  const tandem = level >= 2; // 2 arcs en tandem à partir du niveau 2

  const metalMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.4 });
  const stringMat = new THREE.MeshStandardMaterial({ color: 0xe8dcb0, roughness: 0.8 });

  // ================= PIÈTEMENT EN CROIX =================
  for (const rot of [Math.PI / 4, -Math.PI / 4]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 0.24), wood);
    leg.position.y = 0.08; leg.rotation.y = rot;
    leg.castShadow = true;
    g.add(leg);
  }
  // colonne + pivot
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.55, 8), dark);
  column.position.y = 0.38;
  g.add(column);
  const pivotY = 0.66;

  // ================= CHÂSSIS ORIENTABLE (pointe vers +z) =================
  const frame = new THREE.Group();
  frame.position.y = pivotY;

  // Rail principal : plus fin qu'avant, allongé dans l'axe de tir (z).
  const railLen = 2.4;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, railLen), wood);
  rail.castShadow = true;
  frame.add(rail);
  // rainure centrale (le canal du trait) : une fine bande sombre sur le dessus
  const groove = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, railLen * 0.9), dark);
  groove.position.y = 0.09;
  frame.add(groove);
  // 2 ferrures discrètes
  for (const pz of [-railLen * 0.25, railLen * 0.15]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.08), dark);
    band.position.set(0, 0.06, pz);
    frame.add(band);
  }

  // --- Fonction : un ARC courbé à plat (croissant vu de dessus). ---
  // Chaque bras part du centre, s'écarte latéralement, puis se recourbe
  // vers l'AVANT (comme une vraie arbalète vue de dessus). Les bras restent
  // à plat (hauteur constante) : pas de "cornes" qui montent. La corde relie
  // les deux pointes recourbées.
  function buildBow(zPos) {
    const bow = new THREE.Group();
    bow.position.set(0, 0.12, zPos);
    const span = 1.1;   // demi-envergure
    const fwd = 0.5;    // avancée des pointes vers l'avant
    const armY = 0.0;
    for (const side of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, armY, 0),
        new THREE.Vector3(side * span * 0.5, armY, -0.05),
        new THREE.Vector3(side * span * 0.9, armY, 0.15),
        new THREE.Vector3(side * span, armY, fwd),   // pointe recourbée vers l'avant
      ]);
      const armGeo = new THREE.TubeGeometry(curve, 14, 0.055, 6, false);
      const arm = new THREE.Mesh(armGeo, wood);
      arm.castShadow = true;
      bow.add(arm);
    }
    // Corde : relie les deux pointes (±span, armY, fwd).
    const string = new THREE.Mesh(new THREE.BoxGeometry(span * 2, 0.022, 0.022), stringMat);
    string.position.set(0, armY, fwd);
    bow.add(string);
    return bow;
  }

  // --- Fonction : un trait/carreau dans l'axe, pointe vers l'avant (+z). ---
  function buildBolt(xOff, zBase) {
    const bolt = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 6), dark);
    shaft.rotation.x = Math.PI / 2;
    bolt.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), metalMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.75;
    bolt.add(tip);
    // empennage
    const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.16), dark);
    fletch.position.z = -0.6;
    bolt.add(fletch);
    bolt.position.set(xOff, 0.16, zBase);
    return bolt;
  }

  if (tandem) {
    // 2 arcs l'un derrière l'autre, MÊME axe, bien alignés.
    frame.add(buildBow(railLen * 0.34));
    frame.add(buildBow(railLen * 0.02));
    // 2 traits alignés dans l'axe (l'un devant l'autre, sur la rainure).
    frame.add(buildBolt(0, railLen * 0.18));
    frame.add(buildBolt(0, -railLen * 0.14));
  } else {
    frame.add(buildBow(railLen * 0.32));
    frame.add(buildBolt(0, railLen * 0.05));
  }

  // Treuil à l'arrière.
  const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.34, 8), dark);
  winch.rotation.z = Math.PI / 2;
  winch.position.set(0, 0.02, -railLen * 0.44);
  frame.add(winch);

  g.add(frame);
  g.scale.setScalar(scale);
  g.userData.aimFrame = frame;
  return g;
}

/* --------------------------------------------------------------------
   TOUR DE GLACE : un igloo qui tire des boules de neige.
     - niveau 1 : petit igloo, 1 entrée
     - niveau 2 : gros igloo, 1 entrée
     - niveau 3 : très gros igloo à 4 entrées
   Dôme en demi-sphère bleutée + blocs de neige suggérés + entrée(s) voûtée(s)
   + une boule de neige (le projectile) posée devant/au sommet.
   -------------------------------------------------------------------- */
function buildGlaceTower(level) {
  const g = new THREE.Group();

  // Taille du dôme selon le niveau.
  const radius = level === 1 ? 0.9 : level === 2 ? 1.15 : 1.4;
  const entries = level === 3 ? 4 : 1;

  // Matériaux : neige (blanc bleuté) et glace (translucide clair).
  const snowMat = new THREE.MeshStandardMaterial({
    color: 0x9fb8d0, roughness: 1.0, metalness: 0,
  });
  const iceMat = new THREE.MeshStandardMaterial({
    color: 0x8fbdd8, roughness: 0.7, metalness: 0,
  });
  const shadowMat = new THREE.MeshStandardMaterial({ color: 0x7a96b4, roughness: 1.0 });

  // --- Dôme principal (demi-sphère) ---
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    snowMat
  );
  dome.position.y = 0.02;
  dome.castShadow = true;
  dome.receiveShadow = true;
  g.add(dome);

  // --- Blocs de neige suggérés : anneaux horizontaux (rainures) sur le dôme ---
  for (const frac of [0.35, 0.62, 0.82]) {
    const ringY = radius * Math.sin(frac * Math.PI / 2);
    const ringR = radius * Math.cos(frac * Math.PI / 2);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringR, 0.025, 6, 20),
      shadowMat
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = ringY + 0.02;
    g.add(ring);
  }

  // --- Entrée(s) voûtée(s) : petit tunnel qui dépasse du dôme ---
  function buildEntrance(angle) {
    const e = new THREE.Group();
    const tunH = radius * 0.5;
    const tunR = radius * 0.28;
    // demi-cylindre couché = voûte du tunnel
    const tunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(tunR, tunR, tunH, 12, 1, false, 0, Math.PI),
      snowMat
    );
    tunnel.rotation.z = Math.PI / 2;
    tunnel.rotation.y = Math.PI / 2;
    tunnel.position.set(0, tunR * 0.6, radius * 0.82 + tunH / 2);
    e.add(tunnel);
    // ouverture sombre (l'entrée)
    const hole = new THREE.Mesh(
      new THREE.CircleGeometry(tunR * 0.8, 12, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 1 })
    );
    hole.position.set(0, tunR * 0.55, radius * 0.82 + tunH);
    e.add(hole);
    e.rotation.y = angle;
    return e;
  }
  for (let i = 0; i < entries; i++) {
    g.add(buildEntrance((i / entries) * Math.PI * 2));
  }

  // --- Boule de neige (le projectile), posée au sommet du dôme ---
  const snowball = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.22, 12, 10),
    iceMat
  );
  snowball.position.y = radius + radius * 0.15;
  snowball.castShadow = true;
  g.add(snowball);
  g.userData.snowball = snowball; // repère pour animer le tir plus tard

  // Petit socle de glace sous l'igloo pour l'asseoir sur le socle de pierre.
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.02, radius * 1.05, 0.12, 16),
    shadowMat
  );
  rim.position.y = 0.04;
  g.add(rim);

  return g;
}

/* --------------------------------------------------------------------
   TOUR DE MAGE : une tour de pierre (blocs empilés) surmontée d'un petit
   magicien rouge qui lève les mains, avec une ou deux boules de feu qui
   flottent au-dessus.
     - niveau 1 : tour courte, 1 mage, 1 boule de feu
     - niveau 2 : tour plus haute, 1 boule de feu
     - niveau 3 : tour encore plus haute, 2 boules de feu
   -------------------------------------------------------------------- */
function buildMageTower(level) {
  const g = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8a92, roughness: 0.95 });
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0x6a6a72, roughness: 0.95 });
  const robeMat = new THREE.MeshStandardMaterial({ color: 0xcc2a2a, roughness: 0.7 }); // rouge
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8c090, roughness: 0.8 });
  const fireMat = new THREE.MeshStandardMaterial({
    color: 0xff6a1a, roughness: 0.4,
    emissive: 0xff4400, emissiveIntensity: 0.6, // lumineux mais raisonnable
  });

  // Hauteur de la tour selon le niveau.
  const towerH = level === 1 ? 1.8 : level === 2 ? 2.6 : 3.2;
  const shaftR = 0.62; // rayon du fût

  // --- Fût de pierre : un cylindre régulier, habillé de blocs rocheux ---
  // Cœur cylindrique (assure une structure nette qui porte la plateforme).
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftR * 0.85, shaftR, towerH, 12),
    stoneMat
  );
  shaft.position.y = towerH / 2 + 0.1;
  shaft.castShadow = true;
  g.add(shaft);
  // Blocs rocheux plaqués sur le fût pour le relief (s'arrêtent avant le sommet
  // pour ne pas encombrer la plateforme).
  const nRings = Math.max(2, Math.round(towerH / 0.6));
  for (let i = 0; i < nRings; i++) {
    const y = 0.4 + i * (towerH - 0.6) / nRings;
    const perRing = 5;
    for (let k = 0; k < perRing; k++) {
      const ang = (k / perRing) * Math.PI * 2 + i * 0.6;
      const size = 0.22 + Math.random() * 0.14;
      const block = new THREE.Mesh(
        new THREE.DodecahedronGeometry(size, 0),
        k % 2 === 0 ? stoneMat : stoneDark
      );
      block.position.set(Math.cos(ang) * shaftR, y, Math.sin(ang) * shaftR);
      block.rotation.set(Math.random(), Math.random(), Math.random());
      block.castShadow = true;
      g.add(block);
    }
  }

  // --- Plateforme sommitale : large, plane, dégagée pour le mage ---
  const platY = towerH + 0.2;
  const platR = shaftR + 0.15;
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(platR, platR * 0.95, 0.2, 12), stoneMat
  );
  platform.position.y = platY;
  platform.castShadow = true; platform.receiveShadow = true;
  g.add(platform);
  // Rebord crénelé autour de la plateforme (merlons), façon tour de guet.
  const nMerlons = 8;
  for (let k = 0; k < nMerlons; k++) {
    const ang = (k / nMerlons) * Math.PI * 2;
    const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), stoneDark);
    merlon.position.set(
      Math.cos(ang) * (platR - 0.06),
      platY + 0.2,
      Math.sin(ang) * (platR - 0.06)
    );
    merlon.rotation.y = ang;
    g.add(merlon);
  }
  const platTopY = platY + 0.1; // surface où repose le mage

  // --- Petit magicien rouge ---
  const mage = new THREE.Group();
  // robe (tronc conique)
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.28, 0.6, 8), robeMat);
  robe.position.y = 0.3; robe.castShadow = true;
  mage.add(robe);
  // tête
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skinMat);
  head.position.y = 0.68;
  mage.add(head);
  // chapeau pointu rouge
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 8), robeMat);
  hat.position.y = 0.92;
  mage.add(hat);
  // bras levés (deux petits cylindres en V vers le haut)
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 5), robeMat);
    arm.position.set(side * 0.16, 0.52, 0.05);
    arm.rotation.z = side * -0.7; // lève les mains
    mage.add(arm);
  }
  mage.position.y = platTopY;
  g.add(mage);

  // --- Boule(s) de feu qui flotte(nt) au-dessus des mains ---
  const nFire = level === 3 ? 2 : 1;
  const fireballs = [];
  const fireY = platTopY + 1.0; // au-dessus des mains levées
  if (nFire === 1) {
    const fb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), fireMat);
    fb.position.set(0, fireY, 0.1);
    g.add(fb); fireballs.push(fb);
  } else {
    for (const side of [-1, 1]) {
      const fb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), fireMat);
      fb.position.set(side * 0.22, fireY, 0.1);
      g.add(fb); fireballs.push(fb);
    }
  }
  g.userData.fireballs = fireballs; // repère pour animer (lévitation/tir)

  return g;
}

/* Construit la géométrie stylisée d'une tour selon son type et son niveau.
   Le niveau (1-3) augmente la taille / ajoute des éléments = montée en gamme. */
function buildTowerMesh(type, level) {
  const def = TOWER_TYPES[type];

  // Les archers ont leur propre construction complète (tour de guet en bois),
  // sans la base de pierre commune aux autres tours.
  if (def.id === 'archers') return buildArchersTower(level);
  if (def.id === 'baliste') return buildBalisteTower(level);
  if (def.id === 'glace') return buildGlaceTower(level);
  if (def.id === 'bucher') return buildMageTower(level);

  // Fallback : type inconnu → une simple borne de pierre (ne devrait pas
  // arriver, les 4 types gérés renvoient plus haut).
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.7, 1.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.9 })
  );
  base.position.y = 0.8; base.castShadow = true;
  g.add(base);
  return g;
}

/**
 * Crée une tour d'un type donné, posée sur un socle.
 * @param {THREE.Scene} scene
 * @param {string} typeId
 * @param {{x,y,z}} position   position du socle
 * @param {object} [opts]
 * @param {(info)=>void} [opts.onFire]  appelé à chaque tir (pour projectile/effet)
 * @returns objet tour
 */
export function createTower(scene, typeId, position, { onFire, animateIn = false } = {}) {
  const def = TOWER_TYPES[typeId];
  let level = 1;
  let stats = def.levels[0];
  let specialization = null; // branche choisie au niveau 3 (T3.6)
  // Effet actif : part des propriétés du type, surchargé par la spécialisation.
  let fx = {
    special: def.special || null,
    aoeRadius: def.aoeRadius,
    slowFactor: def.slowFactor, slowDuration: def.slowDuration,
    multishotCount: 1,
  };

  let mesh = buildTowerMesh(typeId, level);
  mesh.position.set(position.x, position.y + 0.4, position.z);
  scene.add(mesh);

  // Animation de pose (T1.7) : la tour "pousse" avec un léger dépassement.
  const GROW_DUR = 0.28;
  let growT = animateIn ? 0 : -1;      // -1 = pas d'animation (échelle pleine)
  if (animateIn) mesh.scale.setScalar(0.4);
  function startGrow() { if (animateIn) { growT = 0; mesh.scale.setScalar(0.4); } }

  let cooldown = 0; // temps restant avant le prochain tir
  let disabled = false; // désactivée par une aura d'élite (T4.3+)
  let targetMode = 'first'; // mode de ciblage réglable (T4.5)

  // Règle de ciblage des unités volantes (T4.3) : seules les tours à longue
  // portée (archers, baliste) peuvent atteindre les ennemis volants.
  const canHitFlying = (typeId === 'archers' || typeId === 'baliste');
  function canTarget(e) {
    if (e.flying && !canHitFlying) return false;
    return true;
  }

  // Choix de cible (T4.5) : la tour FILTRE les candidats valides (vivants,
  // ciblables, à portée), puis délègue le CHOIX au mode de ciblage courant.
  function pickTarget(enemies) {
    const r2 = stats.range * stats.range;
    const candidates = [];
    for (const e of enemies) {
      if (!e.alive || !canTarget(e)) continue;
      const dx = e.position.x - position.x;
      const dz = e.position.z - position.z;
      if (dx * dx + dz * dz > r2) continue;         // hors de portée
      candidates.push(e);
    }
    if (!candidates.length) return null;
    const mode = TARGET_MODES[targetMode] || TARGET_MODES.first;
    return mode.pick(candidates, { position });
  }

  const tower = {
    typeId, position,
    get level() { return level; },
    get stats() { return stats; },
    /** Mode de ciblage courant (T4.5) : first, last, nearest, strongest, weakest, flying. */
    get targetMode() { return targetMode; },
    setTargetMode(modeId) {
      if (!TARGET_MODES[modeId]) return false;
      targetMode = modeId;
      return true;
    },
    mesh,

    /** Améliore la tour au niveau suivant (max 3). Renvoie true si réussi. */
    upgrade() {
      if (level >= 3) return false;
      level++;
      stats = def.levels[level - 1];
      // Remplace le mesh par la version du nouveau niveau (montée visuelle).
      scene.remove(mesh);
      mesh = buildTowerMesh(typeId, level);
      mesh.position.set(position.x, position.y + 0.4, position.z);
      scene.add(mesh);
      tower.mesh = mesh;
      startGrow();   // petit pop de la nouvelle version (T1.7)
      return true;
    },

    /** Les deux branches de spécialisation disponibles (niveau 3 requis). */
    get specializationOptions() {
      return level >= 3 && !specialization ? getSpecializations(typeId) : [];
    },
    get specialization() { return specialization; },

    /**
     * Choisit une spécialisation (branche) au niveau 3. Applique les
     * modificateurs de stats et l'effet distinct. Renvoie true si réussi.
     * @param {string} branchId  id de la branche (ex. 'rapid', 'sniper')
     */
    specialize(branchId) {
      if (level < 3 || specialization) return false;
      const branches = getSpecializations(typeId);
      const branch = branches.find(b => b.id === branchId);
      if (!branch) return false;
      specialization = branch;
      // Applique les stats modifiées.
      stats = branch.apply(def.levels[2]);
      // Surcharge l'effet actif si la branche le précise.
      if (branch.special) fx.special = branch.special;
      if (branch.aoeRadius != null) fx.aoeRadius = branch.aoeRadius;
      if (branch.slowFactor != null) fx.slowFactor = branch.slowFactor;
      if (branch.slowDuration != null) fx.slowDuration = branch.slowDuration;
      if (branch.multishotCount != null) fx.multishotCount = branch.multishotCount;
      return true;
    },

    /**
     * Logique de combat, appelée chaque frame.
     * @param {number} dt
     * @param {Array} enemies  liste d'ennemis {position, alive, pathProgress, takeDamage}
     */
    update(dt, enemies) {
      // Animation de pose (T1.7) : croissance avec dépassement (easeOutBack).
      // Tourne même si la tour est désactivée (elle apparaît quand même).
      if (growT >= 0) {
        growT += dt;
        const t = Math.min(1, growT / GROW_DUR);
        const s = 1.70158;
        const eob = 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
        mesh.scale.setScalar(0.4 + 0.6 * eob);
        if (t >= 1) { mesh.scale.setScalar(1); growT = -1; }
      }
      if (disabled) return;   // tour désactivée (aura d'élite) : ne tire pas
      cooldown -= dt;

      if (fx.special === 'dot') {
        // Aura continue : dégâts/seconde selon le niveau (équilibrage préservé),
        // ET marque le statut BRÛLURE (T4.2) pour le visuel et les synergies
        // (vulnérabilité au feu, cumul lisible).
        const r2 = stats.range * stats.range;
        let nearest = null, nd = Infinity;
        for (const e of enemies) {
          if (!e.alive || !canTarget(e)) continue;
          const dx = e.position.x - position.x, dz = e.position.z - position.z;
          const d2 = dx * dx + dz * dz;
          if (d2 <= r2) {
            e.takeDamage(stats.damage * dt, { type: 'dot', dmgType: TOWER_DAMAGE_TYPE[typeId] });
            e.applyStatus?.('burn', 1.5, { stacks: 1 }); // marque visuelle + synergie
            if (d2 < nd) { nd = d2; nearest = e; }
          }
        }
        // Lance une boule de feu (effet visuel) vers la cible la plus proche.
        if (nearest) {
          cooldown -= dt;
          if (cooldown <= 0) {
            cooldown = 1 / (stats.fireRate || 1);
            onFire?.({ tower, target: nearest, level, type: def.projectile });
          }
        }
        return;
      }

      if (cooldown > 0) return;
      const target = pickTarget(enemies);
      if (!target) return;
      cooldown = 1 / stats.fireRate;

      const dx = target.position.x - position.x;
      const dz = target.position.z - position.z;
      const aimAngle = Math.atan2(dx, dz);
      // Si la tour expose des "parties orientables" (ex. les archers), on ne
      // fait pivoter QUE celles-là (la structure reste fixe). Chaque partie
      // pivote sur elle-même. Sinon, on oriente la tour entière.
      const aimParts = mesh.userData.aimParts;
      if (aimParts && aimParts.length) {
        for (const part of aimParts) {
          // angle local : la cible en coordonnées relatives à la position
          // de la partie (pour que chaque archer vise correctement).
          const px = target.position.x - (position.x + part.position.x);
          const pz = target.position.z - (position.z + part.position.z);
          part.rotation.y = Math.atan2(px, pz);
        }
      } else {
        mesh.rotation.y = aimAngle;
      }

      // Type de dégât élémentaire de cette tour (pour la matrice T3.8).
      const dmgType = TOWER_DAMAGE_TYPE[typeId];

      if (fx.special === 'aoe') {
        const ar2 = fx.aoeRadius * fx.aoeRadius;
        for (const e of enemies) {
          if (!e.alive || !canTarget(e)) continue;
          const ex = e.position.x - target.position.x, ez = e.position.z - target.position.z;
          if (ex * ex + ez * ez <= ar2) e.takeDamage(stats.damage, { type: 'aoe', dmgType });
        }
      } else if (fx.special === 'slow') {
        target.takeDamage(stats.damage, { type: 'frost', dmgType });
        target.applySlow?.(fx.slowFactor, fx.slowDuration);
        target.applyStatus?.('chill', fx.slowDuration, { stacks: 1 });
      } else if (fx.special === 'slowAoe') {
        // givre étendu : ralentit + dégâts sur une zone autour de la cible.
        const ar2 = fx.aoeRadius * fx.aoeRadius;
        for (const e of enemies) {
          if (!e.alive || !canTarget(e)) continue;
          const ex = e.position.x - target.position.x, ez = e.position.z - target.position.z;
          if (ex * ex + ez * ez <= ar2) {
            e.takeDamage(stats.damage, { type: 'frost', dmgType });
            e.applySlow?.(fx.slowFactor, fx.slowDuration);
            e.applyStatus?.('chill', fx.slowDuration, { stacks: 1 });
          }
        }
      } else if (fx.special === 'multishot') {
        // touche les N ennemis les plus avancés à portée.
        const r2 = stats.range * stats.range;
        const inRange = enemies.filter(e => e.alive && canTarget(e) &&
          (e.position.x - position.x) ** 2 + (e.position.z - position.z) ** 2 <= r2)
          .sort((a, b) => (b.pathProgress ?? 0) - (a.pathProgress ?? 0))
          .slice(0, fx.multishotCount);
        for (const e of inRange) e.takeDamage(stats.damage, { type: 'pierce', dmgType });
      } else if (fx.special === 'armorPierce') {
        target.takeDamage(stats.damage, { type: 'pierce', dmgType });
      } else {
        target.takeDamage(stats.damage, { type: 'physical', dmgType });
      }

      onFire?.({ tower, target, level, type: def.projectile });
    },

    dispose() { scene.remove(mesh); },

    /** Active/désactive la tour (aura d'élite). Grise le mesh quand désactivée. */
    get disabled() { return disabled; },
    setDisabled(v) {
      if (disabled === v) return;
      disabled = v;
      // grise (ou restaure) tous les matériaux du mesh.
      mesh.traverse((o) => {
        if (!o.material) return;
        if (v) {
          if (o.userData._origColor === undefined && o.material.color) {
            o.userData._origColor = o.material.color.getHex();
          }
          if (o.material.color) o.material.color.setHex(0x555555);
        } else if (o.userData._origColor !== undefined && o.material.color) {
          o.material.color.setHex(o.userData._origColor);
        }
      });
    },
  };

  return tower;
}
