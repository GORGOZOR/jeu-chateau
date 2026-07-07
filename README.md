# Château Fort — Tower Defense 3D

Jeu de tower defense médiéval en 3D, développé avec Three.js (WebGL), sans étape de build.

État actuel : **T1.1 — fondation technique**. Le projet affiche une scène 3D vide (sol + éclairage minimal). Le gameplay arrive dans les tâches suivantes.

---

## Lancer le jeu

Le jeu utilise les **modules ES** et un **import map**. Pour des raisons de sécurité, les navigateurs bloquent les modules chargés via `file://` : **un double-clic sur `index.html` ne fonctionnera pas**. Il faut servir le dossier avec un petit serveur local.

### Option 1 — Python (déjà installé sur la plupart des machines)

Dans un terminal, place-toi dans le dossier du projet puis lance :

```bash
python -m http.server 8000
```

Ouvre ensuite : http://localhost:8000

### Option 2 — Node.js

```bash
npx serve .
```

Puis ouvre l'adresse indiquée dans le terminal.

### Option 3 — Extension d'éditeur

Sous VS Code, l'extension **Live Server** fait la même chose : clic droit sur `index.html` → « Open with Live Server ».

---

## Vérifier que T1.1 est réussie

Une fois la page ouverte, tu dois voir :

- un **sol sombre** en perspective plongeante, avec une **grille de repère** ;
- des **ombres douces** projetées par la lumière (visibles plus tard avec des objets) ;
- **aucune erreur rouge** dans la console du navigateur (F12 → onglet Console) ;
- un message `[Château Fort] T1.1 — scène initialisée, rendu actif.` dans cette console.

Si un message « Rendu 3D indisponible » s'affiche, WebGL n'est pas actif dans ton navigateur.

---

## Structure du projet

```
chateau-fort/
├── index.html          Point d'entrée : canvas + import map Three.js
├── README.md           Ce fichier
├── styles/
│   └── main.css        Styles de base (canvas plein écran, message d'erreur)
├── src/
│   ├── main.js         Initialisation Three.js (scène, caméra, rendu)  ← T1.1
│   ├── core/           Boucle, état, événements, pooling               (T1.2–T1.5)
│   ├── systems/        Ciblage, mouvement, combat, vagues, économie    (Lots 3–4)
│   ├── entities/       Tours, ennemis, projectiles, château            (Lots 2–3)
│   ├── render/         Éclairage, post-process, particules, décor      (Lot 2)
│   ├── data/           Config : tours, ennemis, vagues, cartes         (Lot 3)
│   ├── ui/             HUD, menus, panneaux                            (Lot 6)
│   └── assets/         Chargeur glTF, audio                            (Lot 5)
└── assets/             Modèles, sons, textures (fournis ultérieurement) (Lot 5)
```

Les dossiers vides contiennent un fichier `.gitkeep` en attendant leurs modules.

---

## Notes techniques

- **Cible de performance** : 60 FPS visés, **30 FPS considérés comme un plancher acceptable** lors des pics (grosses vagues, nombreux effets). La boucle à pas de temps fixe garantit que la logique de jeu reste juste même si le rendu tombe à 30 FPS — le jeu ne ralentit pas, il est seulement affiché moins souvent. Le compteur de diagnostic (`__CF__.loop.stats`) suit les creux passés sous ce plancher.
- **Object pooling** : les objets créés en masse (projectiles, effets) sont recyclés via `src/core/pool.js` pour limiter les à-coups du ramasse-miettes.
- **Three.js** est chargé depuis un CDN (unpkg) via l'import map dans `index.html`, version épinglée à `0.160.0`. Pour changer de version, modifier les URLs de l'import map.
- **Pas de build** : le projet tourne tel quel, servi en statique.
- **WebGL requis** : une détection est faite au démarrage avec un message clair en cas d'absence.
