/* =====================================================================
   Château Fort — Info-bulles comparatives  (T4.5)
   ---------------------------------------------------------------------
   Objectif : que le joueur décide en connaissance de cause. Au survol
   d'une tour, une info-bulle montre ses stats ACTUELLES et celles du
   NIVEAU SUIVANT (avec les deltas), le coût d'amélioration, la valeur de
   revente, le mode de ciblage — et au niveau 3, la spécialisation choisie
   ou les deux branches disponibles.

   Deux parties découplées :
     - buildTowerTooltipData(tower) : PURE (testable sans DOM), construit
       l'objet de données du comparatif.
     - createTooltip() : le DOM (une div flottante), show(data,x,y)/hide().
   ===================================================================== */

import { TOWER_TYPES, sellValue } from '../data/towers.js';
import { TARGET_MODES } from '../systems/targeting.js';

/**
 * Construit les données d'info-bulle d'une tour (comparatif avant/après).
 * @param {object} tower  la tour (typeId, level, stats, targetMode, ...)
 * @returns {object} données prêtes à afficher
 */
export function buildTowerTooltipData(tower) {
  const def = TOWER_TYPES[tower.typeId];
  const cur = tower.stats;
  const isMax = tower.level >= 3;
  const next = isMax ? null : def.levels[tower.level]; // levels[level-1] = courant

  // Lignes comparées : libellé, valeur actuelle, valeur suivante, delta.
  const statDefs = [
    { key: 'damage', label: 'Dégâts' },
    { key: 'range', label: 'Portée' },
    { key: 'fireRate', label: 'Cadence' },
  ];
  const rows = [];
  for (const s of statDefs) {
    if (cur[s.key] == null) continue;
    const row = { label: s.label, cur: cur[s.key] };
    if (next && next[s.key] != null) {
      row.next = next[s.key];
      row.delta = Math.round((next[s.key] - cur[s.key]) * 100) / 100;
    }
    rows.push(row);
  }

  const modeDef = TARGET_MODES[tower.targetMode] || TARGET_MODES.first;

  const data = {
    name: def.name,
    role: def.role,
    level: tower.level,
    isMax,
    rows,
    upgradeCost: next ? next.cost : null,
    sellValue: sellValue(tower.typeId, tower.level),
    targetModeLabel: modeDef.label,
  };

  // Au niveau 3 : spécialisation choisie, ou les 2 branches disponibles.
  if (isMax) {
    if (tower.specialization) {
      data.specialization = {
        name: tower.specialization.name,
        desc: tower.specialization.desc,
      };
    } else if (tower.specializationOptions?.length) {
      data.specializationOptions = tower.specializationOptions.map(b => ({
        name: b.name, desc: b.desc,
      }));
    }
  }

  return data;
}

/** Formate les données en HTML (petit tableau comparatif). */
export function formatTooltipHtml(d) {
  const esc = (s) => String(s).replace(/</g, '&lt;');
  let h = '<div style="font-weight:700;font-size:13px">' + esc(d.name)
    + ' <span style="opacity:.7;font-weight:400">niv. ' + d.level + '/3</span></div>';
  h += '<div style="opacity:.65;font-size:11px;margin-bottom:6px">' + esc(d.role)
    + ' — cible : ' + esc(d.targetModeLabel) + '</div>';

  h += '<table style="border-collapse:collapse;font-size:12px;width:100%">';
  for (const r of d.rows) {
    h += '<tr><td style="padding:1px 8px 1px 0;opacity:.8">' + esc(r.label) + '</td>'
      + '<td style="text-align:right">' + r.cur + '</td>';
    if (r.next != null) {
      const up = r.delta >= 0;
      h += '<td style="padding:0 4px;opacity:.6">→</td>'
        + '<td style="text-align:right;color:' + (up ? '#8f8' : '#f88') + '">'
        + r.next + ' (' + (up ? '+' : '') + r.delta + ')</td>';
    }
    h += '</tr>';
  }
  h += '</table>';

  if (d.upgradeCost != null) {
    h += '<div style="margin-top:6px;font-size:12px">Amélioration : <b style="color:#ffd700">'
      + d.upgradeCost + ' or</b></div>';
  } else if (d.specialization) {
    h += '<div style="margin-top:6px;font-size:12px;color:#9fd8ff">★ '
      + esc(d.specialization.name) + '</div>'
      + '<div style="opacity:.7;font-size:11px">' + esc(d.specialization.desc) + '</div>';
  } else if (d.specializationOptions) {
    h += '<div style="margin-top:6px;font-size:12px;color:#ffd700">Spécialisations disponibles :</div>';
    for (const o of d.specializationOptions) {
      h += '<div style="font-size:11px;margin-top:2px"><b>' + esc(o.name)
        + '</b> <span style="opacity:.7">— ' + esc(o.desc) + '</span></div>';
    }
  }
  h += '<div style="margin-top:5px;font-size:11px;opacity:.6">Revente : '
    + d.sellValue + ' or</div>';
  return h;
}

/** Crée la div d'info-bulle flottante. */
export function createTooltip() {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'z-index:950', 'display:none',
    'max-width:260px', 'padding:9px 11px',
    'background:rgba(12,20,28,.94)', 'color:#eaf2f8',
    'border:1px solid #2a5a72', 'border-radius:8px',
    'font-family:system-ui,sans-serif', 'pointer-events:none',
    'box-shadow:0 4px 14px rgba(0,0,0,.45)',
  ].join(';');
  document.body.appendChild(el);

  return {
    show(data, x, y) {
      el.innerHTML = formatTooltipHtml(data);
      // évite de sortir de l'écran à droite/en bas.
      const pad = 14;
      el.style.left = Math.min(x + pad, window.innerWidth - 280) + 'px';
      el.style.top = Math.min(y + pad, window.innerHeight - 220) + 'px';
      el.style.display = 'block';
    },
    hide() { el.style.display = 'none'; },
    el,
  };
}
