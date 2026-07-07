/* =====================================================================
   Château Fort — HUD en jeu + écrans de fin  (T6.5, version adaptée)
   ---------------------------------------------------------------------
   Bandeau permanent en haut à gauche :
     - Or (avec les intérêts attendus à la fin de la vague),
     - PV du château (barre + valeur),
     - Vague courante / totale, et le BOUTON « Lancer la vague » pendant
       l'entracte (avec le compte à rebours du lancement automatique).

   Écrans de fin : overlay Victoire / Défaite avec les statistiques de la
   partie (vagues, ennemis vaincus, or amassé) et un bouton Rejouer.

   Comme la barre de sorts : HTML au-dessus du canvas, rafraîchi chaque
   frame via update(). La faveur a déjà sa jauge (spell-bar).
   ===================================================================== */

import * as GameState from '../core/state.js';

export function createHud({ waveManager, economy, onStartWave } = {}) {
  /* ---- Bandeau ------------------------------------------------------ */
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed', 'top:14px', 'left:14px', 'z-index:910',
    'min-width:190px', 'padding:10px 13px',
    'background:rgba(12,20,28,.92)', 'color:#eaf2f8',
    'border:1px solid #2a5a72', 'border-radius:10px',
    'font-family:system-ui,sans-serif', 'font-size:13px',
    'box-shadow:0 4px 14px rgba(0,0,0,.4)',
  ].join(';');

  panel.innerHTML = [
    '<div style="display:flex;justify-content:space-between;align-items:baseline">',
    '  <span>💰 Or</span>',
    '  <span><b id="hudGold" style="color:#ffd700">0</b>',
    '  <span id="hudInterest" style="opacity:.6;font-size:11px"></span></span>',
    '</div>',
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px">',
    '  <span>❤ Château</span><span id="hudHp"><b>20</b>/20</span>',
    '</div>',
    '<div style="height:7px;background:#3a1a1a;border-radius:4px;overflow:hidden;margin-top:3px">',
    '  <div id="hudHpBar" style="height:100%;width:100%;background:linear-gradient(90deg,#c33,#e66);transition:width .2s"></div>',
    '</div>',
    '<div style="display:flex;justify-content:space-between;margin-top:6px">',
    '  <span>⚔ Vague</span><span id="hudWave">—</span>',
    '</div>',
    '<button id="hudWaveBtn" style="display:none;width:100%;margin-top:8px;padding:7px;',
    'background:#1d3a52;color:#eaf2f8;border:1px solid #3a7aa2;border-radius:7px;',
    'cursor:pointer;font-family:inherit;font-size:13px;font-weight:600"></button>',
  ].join('');
  document.body.appendChild(panel);

  const elGold = panel.querySelector('#hudGold');
  const elInterest = panel.querySelector('#hudInterest');
  const elHp = panel.querySelector('#hudHp');
  const elHpBar = panel.querySelector('#hudHpBar');
  const elWave = panel.querySelector('#hudWave');
  const btnWave = panel.querySelector('#hudWaveBtn');
  btnWave.onclick = () => onStartWave?.();

  /* ---- Écran de fin -------------------------------------------------- */
  let endShown = false;
  function showEnd(victory) {
    if (endShown) return;
    endShown = true;
    const s = GameState.get.stats();
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:990',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(4,8,12,.78)', 'font-family:system-ui,sans-serif',
    ].join(';');
    const color = victory ? '#ffd700' : '#e66';
    overlay.innerHTML = [
      '<div style="text-align:center;color:#eaf2f8;background:rgba(12,20,28,.95);',
      'padding:34px 48px;border:1px solid ' + color + ';border-radius:14px">',
      '  <div style="font-size:30px;font-weight:800;color:' + color + '">',
      victory ? '🏆 VICTOIRE' : '💀 DÉFAITE',
      '  </div>',
      '  <div style="opacity:.8;margin-top:6px">',
      victory ? 'Les 15 vagues sont repoussées !' : 'Le château est tombé…',
      '  </div>',
      '  <div style="margin-top:16px;font-size:14px;line-height:1.8;text-align:left">',
      '    Vagues repoussées : <b>' + GameState.get.waveNumber() + ' / ' + GameState.get.totalWaves() + '</b><br>',
      '    Ennemis vaincus : <b>' + s.kills + '</b><br>',
      '    Or amassé (total) : <b style="color:#ffd700">' + Math.floor(s.goldEarned) + '</b><br>',
      '    PV du château : <b>' + GameState.get.hp() + ' / ' + GameState.get.maxHp() + '</b>',
      '  </div>',
      '  <button id="hudReplay" style="margin-top:20px;padding:9px 26px;background:#1d3a52;',
      '  color:#eaf2f8;border:1px solid #3a7aa2;border-radius:8px;cursor:pointer;',
      '  font-family:inherit;font-size:14px;font-weight:600">↻ Rejouer</button>',
      '</div>',
    ].join('');
    document.body.appendChild(overlay);
    overlay.querySelector('#hudReplay').onclick = () => window.location.reload();
  }

  /* ---- Rafraîchissement (chaque frame) ------------------------------- */
  function update() {
    elGold.textContent = Math.floor(GameState.get.gold());
    const interest = economy ? economy.previewInterest() : 0;
    elInterest.textContent = interest > 0 ? ' (+' + interest + ' fin de vague)' : '';

    const hp = GameState.get.hp(), maxHp = GameState.get.maxHp();
    elHp.innerHTML = '<b>' + hp + '</b>/' + maxHp;
    elHpBar.style.width = (100 * hp / maxHp) + '%';

    const phase = GameState.get.phase();
    const wave = GameState.get.waveNumber();
    const total = GameState.get.totalWaves();

    if (phase === 'wave') {
      elWave.innerHTML = '<b>' + wave + '</b>/' + total + ' — en cours';
      btnWave.style.display = 'none';
    } else if (phase === 'prepare') {
      elWave.innerHTML = wave > 0 ? '<b>' + wave + '</b>/' + total + ' repoussée' : 'préparation';
      const nextNum = wave + 1;
      if (nextNum <= total) {
        const inSec = waveManager ? waveManager.nextWaveIn : 0;
        btnWave.textContent = '⚔ Lancer la vague ' + nextNum
          + (inSec > 0 ? ' (auto ' + Math.ceil(inSec) + 's)' : '');
        btnWave.style.display = 'block';
      } else {
        btnWave.style.display = 'none';
      }
    } else {
      btnWave.style.display = 'none';
      if (phase === 'victory') elWave.textContent = 'victoire !';
      else if (phase === 'defeat') elWave.textContent = 'défaite';
    }
  }

  return { update, showEnd, panel };
}
