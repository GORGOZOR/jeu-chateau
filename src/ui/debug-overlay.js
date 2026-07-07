/* =====================================================================
   Château Fort — Overlay de debug d'équilibrage  (T7.1)
   ---------------------------------------------------------------------
   Panneau (coin bas-gauche) affichant en direct les chiffres utiles pour
   régler l'équilibrage : FPS, ennemis et PV sur le terrain, DPS des tours
   (total + par type), économie (or, or/min) et vague courante.

   Bascule : touche F2, ou __CF__.toggleDebug(). Caché par défaut.
   Mise à jour throttlée (~5/s) pour rester lisible.
   ===================================================================== */

export function createDebugOverlay() {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed', 'left:14px', 'bottom:14px', 'z-index:930', 'display:none',
    'min-width:220px', 'padding:10px 12px',
    'background:rgba(8,14,20,.86)', 'color:#c8f0d0',
    'border:1px solid #2a5a72', 'border-radius:8px',
    'font-family:ui-monospace,Menlo,Consolas,monospace', 'font-size:11px',
    'line-height:1.5', 'white-space:pre', 'pointer-events:none',
  ].join(';');
  panel.textContent = 'DEBUG — en attente…';
  document.body.appendChild(panel);

  let visible = false;
  let acc = 0; // accumulateur pour throttler l'affichage

  return {
    get visible() { return visible; },
    toggle() { visible = !visible; panel.style.display = visible ? 'block' : 'none'; return visible; },
    setVisible(v) { visible = !!v; panel.style.display = visible ? 'block' : 'none'; },
    /** Appelé chaque frame ; ne réécrit le texte que ~5×/s. */
    update(dt, getData) {
      if (!visible) return;
      acc += dt;
      if (acc < 0.2) return;
      acc = 0;
      panel.textContent = getData();
    },
  };
}
