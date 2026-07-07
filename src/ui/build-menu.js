/* =====================================================================
   Château Fort — Menu de construction / gestion des tours
   ---------------------------------------------------------------------
   Panneau contextuel ouvert au CLIC :
     - sur un SOCLE LIBRE  → mode construction : les 4 tours avec leur
       coût (grisées si l'or manque), l'or actuel en tête.
     - sur une TOUR        → mode gestion : améliorer (coût), spécialiser
       (niv 3), changer le mode de ciblage (cycle), vendre (remboursement).

   Le panneau est un div HTML au-dessus du canvas : ses clics ne
   traversent pas vers le jeu. Les actions concrètes (payer, poser,
   vendre…) sont déléguées à main.js via des callbacks — le menu ne
   touche ni à la scène ni à l'état.
   ===================================================================== */

import * as GameState from '../core/state.js';
import { TOWER_TYPES, sellValue } from '../data/towers.js';
import { TARGET_MODES, TARGET_MODE_IDS } from '../systems/targeting.js';

export function createBuildMenu({ onBuild, onUpgrade, onSpecialize, onSell, onCycleTarget } = {}) {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed', 'z-index:940', 'display:none', 'width:210px',
    'padding:10px 12px', 'background:rgba(12,20,28,.95)', 'color:#eaf2f8',
    'border:1px solid #2a5a72', 'border-radius:10px',
    'font-family:system-ui,sans-serif', 'font-size:12px',
    'box-shadow:0 4px 14px rgba(0,0,0,.5)',
  ].join(';');
  document.body.appendChild(panel);

  let current = null; // { kind: 'build'|'manage', slot?, tower? }

  const btnCss = [
    'display:block', 'width:100%', 'margin-top:6px', 'padding:7px 8px',
    'background:#14212e', 'color:#eaf2f8', 'border:1px solid #2a5a72',
    'border-radius:7px', 'cursor:pointer', 'font-family:inherit',
    'font-size:12px', 'text-align:left',
  ].join(';');

  function goldHeader() {
    return '<div style="display:flex;justify-content:space-between;margin-bottom:2px">'
      + '<b>Or</b><b style="color:#ffd700">' + Math.floor(GameState.get.gold()) + '</b></div>';
  }

  function place(x, y) {
    panel.style.left = Math.min(x + 12, window.innerWidth - 230) + 'px';
    panel.style.top = Math.min(y + 12, window.innerHeight - 320) + 'px';
    panel.style.display = 'block';
  }

  /* ---- Mode construction (socle libre) ---------------------------- */
  function showBuild(slot, x, y) {
    current = { kind: 'build', slot };
    panel.innerHTML = goldHeader()
      + '<div style="opacity:.7;margin-bottom:4px">Construire une tour</div>';
    for (const typeId of Object.keys(TOWER_TYPES)) {
      const def = TOWER_TYPES[typeId];
      const cost = def.levels[0].cost;
      const ok = GameState.canAfford(cost);
      const b = document.createElement('button');
      b.style.cssText = btnCss + (ok ? '' : ';opacity:.45;cursor:not-allowed');
      b.innerHTML = '<b>' + def.name + '</b> <span style="float:right;color:#ffd700">'
        + cost + '</span><br><span style="opacity:.65;font-size:11px">' + def.role + '</span>';
      if (ok) b.onclick = () => onBuild?.(typeId, slot);
      panel.appendChild(b);
    }
    place(x, y);
  }

  /* ---- Mode gestion (tour existante) ------------------------------ */
  function showManage(tower, x, y) {
    current = { kind: 'manage', tower };
    const def = TOWER_TYPES[tower.typeId];
    panel.innerHTML = goldHeader()
      + '<div style="margin-bottom:2px"><b>' + def.name + '</b>'
      + ' <span style="opacity:.7">niv. ' + tower.level + '/3</span></div>'
      + '<div style="opacity:.65;font-size:11px;margin-bottom:4px">' + def.role + '</div>';

    // Améliorer.
    if (tower.level < 3) {
      const cost = def.levels[tower.level].cost;
      const ok = GameState.canAfford(cost);
      const b = document.createElement('button');
      b.style.cssText = btnCss + (ok ? '' : ';opacity:.45;cursor:not-allowed');
      b.innerHTML = '⬆ Améliorer <span style="float:right;color:#ffd700">' + cost + '</span>';
      if (ok) b.onclick = () => onUpgrade?.(tower);
      panel.appendChild(b);
    } else if (!tower.specialization) {
      // Spécialiser (niveau 3, pas encore choisie).
      const b = document.createElement('button');
      b.style.cssText = btnCss + ';border-color:#ffd700';
      b.innerHTML = '★ Spécialiser <span style="opacity:.7;font-size:11px">(2 branches)</span>';
      b.onclick = () => onSpecialize?.(tower);
      panel.appendChild(b);
    } else {
      const d = document.createElement('div');
      d.style.cssText = 'margin-top:6px;color:#9fd8ff;font-size:11px';
      d.textContent = '★ ' + tower.specialization.name;
      panel.appendChild(d);
    }

    // Mode de ciblage (cycle).
    const modeLabel = (TARGET_MODES[tower.targetMode] || TARGET_MODES.first).label;
    const bt = document.createElement('button');
    bt.style.cssText = btnCss;
    bt.innerHTML = '🎯 Cible : <b>' + modeLabel + '</b> <span style="float:right;opacity:.6">▸</span>';
    bt.onclick = () => onCycleTarget?.(tower);
    panel.appendChild(bt);

    // Vendre.
    const refund = sellValue(tower.typeId, tower.level);
    const bs = document.createElement('button');
    bs.style.cssText = btnCss + ';border-color:#8a4a3a';
    bs.innerHTML = '✖ Vendre <span style="float:right;color:#ffd700">+' + refund + '</span>';
    bs.onclick = () => onSell?.(tower);
    panel.appendChild(bs);

    place(x, y);
  }

  return {
    showBuild, showManage,
    hide() { panel.style.display = 'none'; current = null; },
    get isOpen() { return panel.style.display !== 'none'; },
    get current() { return current; },
    /** Re-rend le panneau en place (après achat/amélioration). */
    refresh(x, y) {
      if (!current) return;
      const px = x ?? parseInt(panel.style.left, 10), py = y ?? parseInt(panel.style.top, 10);
      if (current.kind === 'build') showBuild(current.slot, px - 12, py - 12);
      else showManage(current.tower, px - 12, py - 12);
    },
  };
}
