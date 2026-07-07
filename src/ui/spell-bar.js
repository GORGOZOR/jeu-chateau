/* =====================================================================
   Château Fort — UI des sorts  (T4.1)
   ---------------------------------------------------------------------
   Barre de sorts en bas de l'écran : un bouton par sort (nom, coût), une
   jauge de faveur, et l'état de cooldown. Cliquer un bouton sélectionne le
   sort ; le prochain clic sur le terrain le lance (géré dans main.js).

   UI simple en HTML par-dessus le canvas, en attendant le HUD complet (Lot 6).
   ===================================================================== */

import * as GameState from '../core/state.js';
import { SPELLS } from '../systems/spells.js';

export function createSpellBar({ spellSystem, onSelect } = {}) {
  const bar = document.createElement('div');
  bar.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:18px', 'transform:translateX(-50%)',
    'z-index:900', 'display:flex', 'gap:10px', 'align-items:flex-end',
    'font-family:system-ui,sans-serif',
  ].join(';');

  // Jauge de faveur.
  const favorWrap = document.createElement('div');
  favorWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;color:#cfe;margin-right:6px';
  const favorLabel = document.createElement('div');
  favorLabel.style.cssText = 'font-size:11px;opacity:.8;margin-bottom:3px';
  favorLabel.textContent = 'Faveur';
  const favorBarBg = document.createElement('div');
  favorBarBg.style.cssText = 'width:70px;height:10px;background:#123;border:1px solid #2a5a72;border-radius:5px;overflow:hidden';
  const favorBarFg = document.createElement('div');
  favorBarFg.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,#3aa0d8,#7fe0ff);transition:width .1s';
  favorBarBg.appendChild(favorBarFg);
  const favorVal = document.createElement('div');
  favorVal.style.cssText = 'font-size:11px;margin-top:2px';
  favorWrap.appendChild(favorLabel); favorWrap.appendChild(favorBarBg); favorWrap.appendChild(favorVal);
  bar.appendChild(favorWrap);

  // Boutons de sorts.
  const buttons = {};
  for (const id of Object.keys(SPELLS)) {
    const s = SPELLS[id];
    const btn = document.createElement('button');
    btn.style.cssText = [
      'position:relative', 'width:96px', 'padding:8px 6px',
      'background:#14212e', 'color:#eaf2f8', 'border:1px solid',
      'border-color:#' + s.color.toString(16).padStart(6, '0'),
      'border-radius:8px', 'cursor:pointer', 'font-family:inherit',
      'font-size:12px', 'text-align:center', 'overflow:hidden',
    ].join(';');
    btn.innerHTML = '<b>' + s.name + '</b><br><span style="opacity:.7">'
      + s.cost + ' faveur</span>';
    // voile de cooldown
    const cd = document.createElement('div');
    cd.style.cssText = 'position:absolute;left:0;bottom:0;width:100%;background:rgba(0,0,0,.6);height:0%;pointer-events:none';
    btn.appendChild(cd);
    btn.onclick = () => onSelect?.(id);
    bar.appendChild(btn);
    buttons[id] = { btn, cd };
  }

  document.body.appendChild(bar);

  // Rafraîchit l'affichage (faveur + cooldowns). À appeler chaque frame.
  function update() {
    const favor = GameState.get.favor();
    const favorMax = GameState.get.favorMax();
    favorBarFg.style.width = (100 * favor / favorMax) + '%';
    favorVal.textContent = Math.floor(favor) + ' / ' + favorMax;
    for (const id of Object.keys(buttons)) {
      const s = SPELLS[id];
      const left = spellSystem.cooldownLeft(id);
      const cd = buttons[id].cd;
      cd.style.height = (100 * left / s.cooldown) + '%';
      const ready = left <= 0 && favor >= s.cost;
      buttons[id].btn.style.opacity = ready ? '1' : '0.55';
    }
  }

  return { update, el: bar };
}
