/* =====================================================================
   Château Fort — UI de choix de spécialisation  (T3.6)
   ---------------------------------------------------------------------
   Affiche un petit panneau quand une tour de niveau 3 peut se spécialiser.
   Le joueur choisit une des deux branches ; l'effet est appliqué à la tour.

   UI volontairement simple (panneau HTML positionné), en attendant le HUD
   complet du Lot 6. Se greffe sur le DOM par-dessus le canvas.
   ===================================================================== */

import { getSpecializations, TOWER_TYPES } from '../data/towers.js';

let panel = null;

function ensurePanel() {
  if (panel) return panel;
  panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed', 'z-index:1000', 'display:none',
    'background:rgba(18,33,46,0.95)', 'border:1px solid #009CDE',
    'border-radius:10px', 'padding:14px', 'color:#eaf2f8',
    'font-family:system-ui,sans-serif', 'min-width:240px',
    'box-shadow:0 8px 30px rgba(0,0,0,0.5)',
  ].join(';');
  document.body.appendChild(panel);
  return panel;
}

/**
 * Ouvre le panneau de spécialisation pour une tour (doit être niveau 3).
 * @param {object} tower   l'objet tour (avec specialize/specializationOptions)
 * @param {{x:number,y:number}} [screenPos]  position à l'écran (px)
 * @param {()=>void} [onChosen]  callback après choix
 * @returns {boolean} true si le panneau s'est ouvert
 */
export function openSpecializationUI(tower, screenPos = { x: 40, y: 40 }, onChosen) {
  const options = tower.specializationOptions;
  if (!options || options.length === 0) return false;

  const p = ensurePanel();
  const typeName = TOWER_TYPES[tower.typeId].name;
  p.innerHTML = '';

  const title = document.createElement('div');
  title.textContent = 'Spécialiser : ' + typeName;
  title.style.cssText = 'font-weight:700;margin-bottom:10px;color:#009CDE';
  p.appendChild(title);

  for (const branch of options) {
    const btn = document.createElement('button');
    btn.style.cssText = [
      'display:block', 'width:100%', 'text-align:left', 'margin:6px 0',
      'padding:9px 11px', 'background:#0f2a3a', 'color:#eaf2f8',
      'border:1px solid #2a5a72', 'border-radius:7px', 'cursor:pointer',
      'font-family:inherit', 'font-size:13px',
    ].join(';');
    btn.innerHTML = '<b>' + branch.name + '</b> <span style="opacity:.6">('
      + branch.cost + ' or)</span><br><span style="opacity:.8;font-size:12px">'
      + branch.desc + '</span>';
    btn.onmouseenter = () => { btn.style.background = '#164056'; };
    btn.onmouseleave = () => { btn.style.background = '#0f2a3a'; };
    btn.onclick = () => {
      tower.specialize(branch.id);
      close();
      onChosen?.(branch);
    };
    p.appendChild(btn);
  }

  const cancel = document.createElement('button');
  cancel.textContent = 'Annuler';
  cancel.style.cssText = 'margin-top:6px;padding:5px 10px;background:none;color:#8aa;border:none;cursor:pointer;font-family:inherit';
  cancel.onclick = close;
  p.appendChild(cancel);

  p.style.left = screenPos.x + 'px';
  p.style.top = screenPos.y + 'px';
  p.style.display = 'block';
  return true;
}

export function close() {
  if (panel) panel.style.display = 'none';
}
