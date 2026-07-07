/* =====================================================================
   Château Fort — Gestionnaire de vagues  (T3.9)
   ---------------------------------------------------------------------
   Orchestre le déroulé d'une partie :
     - PREPARE (entracte) : le joueur bâtit ; on attend le lancement.
     - WAVE : les ennemis de la vague apparaissent de façon échelonnée
       (selon les groupes) ; la vague finit quand tous sont morts/passés.
     - transition : petite prime de fin de vague, retour en PREPARE, ou
       VICTORY si c'était la dernière vague.
     - DEFEAT géré par GameState quand les PV du château tombent à 0.

   Découplé du rendu : on lui fournit `spawnEnemy(type, elite)` qui crée
   l'ennemi concret, et une fonction `liveEnemyCount()` pour savoir combien
   d'ennemis sont encore en jeu.
   ===================================================================== */

import * as GameState from './state.js';
import { PLAINE_WAVES, DIFFICULTIES, waveEnemyCount } from '../data/waves/plaine.js';

export function createWaveManager({
  waves = PLAINE_WAVES,
  difficulty = 'normal',
  spawnEnemy,          // (type, elite) => enemy
  liveEnemyCount,      // () => nombre d'ennemis encore en jeu
  economy,             // système d'économie (T4.4) — gère la récompense de vague
  onWaveStart,         // (waveNumber) => void   (optionnel, UI)
  onWaveEnd,           // (waveNumber, reward) => void
  onVictory, onDefeat, // () => void
} = {}) {
  const diff = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  GameState.setTotalWaves(waves.length);
  GameState.setPhase(GameState.Phase.PREPARE);

  // File d'apparition de la vague en cours : chaque item = { type, elite, at }
  // où `at` est le temps (s) depuis le début de la vague.
  let spawnQueue = [];
  let waveTime = 0;
  let running = false;      // une vague est en cours d'apparition/combat
  let spawnedAll = false;   // tous les ennemis de la vague sont apparus
  let betweenTimer = 0;     // petite pause avant la vague suivante

  // Construit la file d'apparition d'une vague à partir de ses groupes.
  function buildQueue(wave) {
    const q = [];
    for (const g of wave) {
      for (let i = 0; i < g.count; i++) {
        q.push({ type: g.type, elite: !!g.elite, at: (g.delay || 0) + i * (g.interval || 1) });
      }
    }
    q.sort((a, b) => a.at - b.at);
    return q;
  }

  const manager = {
    difficulty: diff,
    get phase() { return GameState.get.phase(); },
    get isRunning() { return running; },

    /** Lance la vague suivante (depuis l'entracte). */
    startNextWave() {
      if (running) return false;
      if (GameState.get.phase() === GameState.Phase.VICTORY
        || GameState.get.phase() === GameState.Phase.DEFEAT) return false;
      const idx = GameState.advanceWave();
      if (idx < 0) return false; // plus de vagues
      const wave = waves[idx];
      spawnQueue = buildQueue(wave);
      waveTime = 0;
      running = true;
      spawnedAll = false;
      GameState.setPhase(GameState.Phase.WAVE);
      onWaveStart?.(idx + 1, waveEnemyCount(wave));
      return true;
    },

    /** À appeler chaque frame. */
    update(dt) {
      if (GameState.get.isGameOver()) return;

      // Entracte : on décompte l'éventuelle pause auto entre vagues.
      if (!running) {
        if (betweenTimer > 0) {
          betweenTimer -= dt;
          if (betweenTimer <= 0) this.startNextWave();
        }
        return;
      }

      // Apparition échelonnée des ennemis de la vague.
      waveTime += dt;
      while (spawnQueue.length && spawnQueue[0].at <= waveTime) {
        const item = spawnQueue.shift();
        // Les modificateurs de difficulté (PV/or) sont appliqués à la création.
        spawnEnemy?.(item.type, item.elite, { hpMult: diff.hpMult, goldMult: diff.goldMult });
      }
      if (spawnQueue.length === 0) spawnedAll = true;

      // Fin de vague : tous apparus ET plus aucun ennemi vivant.
      if (spawnedAll && (liveEnemyCount?.() ?? 0) === 0) {
        running = false;
        const waveNum = GameState.get.waveNumber();
        GameState.markWaveCleared();
        // Récompense de fin de vague : déléguée à l'économie (prime + intérêts)
        // si disponible, sinon fallback simple.
        let reward = null;
        if (economy) {
          reward = economy.awardWaveEnd(waveNum);
        } else {
          GameState.addGold(10 + waveNum, { earned: true });
        }
        onWaveEnd?.(waveNum, reward);

        // Dernière vague ? victoire. Sinon, retour en entracte.
        if (waveNum >= waves.length) {
          GameState.setPhase(GameState.Phase.VICTORY);
          onVictory?.();
        } else {
          GameState.setPhase(GameState.Phase.PREPARE);
        }
      }
    },

    /** Programme le lancement auto de la prochaine vague après `sec` s. */
    scheduleNext(sec = 8) { betweenTimer = sec; },
    /** Secondes restantes avant le lancement auto de la prochaine vague (0 si aucun). */
    get nextWaveIn() { return Math.max(0, betweenTimer); },

    get currentWave() { return GameState.get.waveNumber(); },
    get totalWaves() { return waves.length; },
  };

  return manager;
}
