/* =====================================================================
   Château Fort — Économie avancée  (T4.4)
   ---------------------------------------------------------------------
   Modèle économique paramétrable, centralisé ici plutôt qu'éparpillé.

   - Intérêts : à la fin de chaque vague, le joueur gagne un pourcentage
     de son or en banque (plafonné). Récompense l'épargne et crée le
     dilemme « dépenser maintenant ou capitaliser ». Activable/désactivable.
   - Réglage fin : prime de base par vague, taux, plafond.
   - Mode debug : flux d'or/seconde pour tester.

   Le critère de fini : on peut activer/désactiver les intérêts et mesurer
   l'effet (via le mode debug ou les logs).
   ===================================================================== */

import * as GameState from '../core/state.js';

export const ECONOMY_CONFIG = {
  interestEnabled: true,   // intérêts activés par défaut (choix de design)
  interestRate: 0.15,      // 15% de l'or en banque par vague
  interestCap: 100,        // plafond d'intérêts par vague (or)
  waveBaseBonus: 10,       // prime de fin de vague (base)
  waveBonusPerWave: 1,     // + 1 or par numéro de vague
};

export function createEconomy(cfg = {}) {
  const config = { ...ECONOMY_CONFIG, ...cfg };
  let debugFlow = 0;       // or/seconde en mode debug (0 = off)
  let lastInterest = 0;    // dernier montant d'intérêts versé (pour l'UI/mesure)

  const economy = {
    config,
    get lastInterest() { return lastInterest; },

    /** Active/désactive les intérêts. */
    setInterest(on) { config.interestEnabled = !!on; },
    get interestEnabled() { return config.interestEnabled; },

    /** Règle le taux d'intérêt (0.15 = 15%). */
    setInterestRate(rate) { config.interestRate = Math.max(0, rate); },

    /**
     * Calcule (sans verser) les intérêts pour un montant d'or donné.
     * Utile pour l'affichage « +X or attendus ».
     */
    previewInterest(gold = GameState.get.gold()) {
      if (!config.interestEnabled) return 0;
      return Math.min(config.interestCap, Math.floor(gold * config.interestRate));
    },

    /**
     * Verse la récompense de fin de vague : prime + intérêts.
     * @param {number} waveNumber
     * @returns {{ bonus, interest, total }}
     */
    awardWaveEnd(waveNumber) {
      const bonus = config.waveBaseBonus + config.waveBonusPerWave * waveNumber;
      const interest = this.previewInterest();
      lastInterest = interest;
      const total = bonus + interest;
      GameState.addGold(total, { earned: true });
      return { bonus, interest, total };
    },

    /** Mode debug : verse `orPerSec` or/seconde (0 pour couper). */
    setDebugFlow(orPerSec) { debugFlow = Math.max(0, orPerSec); },
    get debugFlow() { return debugFlow; },

    /** À appeler chaque frame (mode debug économique). */
    update(dt) {
      if (debugFlow > 0) GameState.addGold(debugFlow * dt, { earned: true });
    },
  };

  return economy;
}
