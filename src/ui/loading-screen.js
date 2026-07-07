/* =====================================================================
   Château Fort — Écran de chargement  (T5.2)
   ---------------------------------------------------------------------
   Overlay plein écran affiché au démarrage pendant le préchargement des
   assets (ciel HDRI + modèles glTF). Une barre progresse à mesure que
   chaque ressource se charge, puis l'écran s'efface et le jeu démarre.

   API :
     const screen = createLoadingScreen();
     screen.setProgress(done, total, label);
     screen.finish();   // fondu de sortie puis retrait du DOM
   ===================================================================== */

export function createLoadingScreen() {
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:1000',
    'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:center',
    'background:radial-gradient(circle at 50% 40%, #14202e 0%, #080d14 100%)',
    'font-family:system-ui,sans-serif', 'color:#eaf2f8',
    'transition:opacity .5s ease',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'Château Fort';
  title.style.cssText = 'font-size:34px;font-weight:800;letter-spacing:1px;'
    + 'color:#ffd700;text-shadow:0 2px 12px rgba(0,0,0,.5);margin-bottom:6px';

  const subtitle = document.createElement('div');
  subtitle.textContent = 'Préparation des défenses…';
  subtitle.style.cssText = 'font-size:14px;opacity:.7;margin-bottom:26px';

  // Piste + remplissage de la barre.
  const barBg = document.createElement('div');
  barBg.style.cssText = 'width:320px;max-width:70vw;height:14px;'
    + 'background:rgba(255,255,255,.08);border:1px solid #2a5a72;'
    + 'border-radius:8px;overflow:hidden';
  const barFg = document.createElement('div');
  barFg.style.cssText = 'height:100%;width:0%;'
    + 'background:linear-gradient(90deg,#3aa0d8,#7fe0ff);'
    + 'transition:width .25s ease';
  barBg.appendChild(barFg);

  const label = document.createElement('div');
  label.style.cssText = 'font-size:12px;opacity:.6;margin-top:10px;height:16px';

  overlay.appendChild(title);
  overlay.appendChild(subtitle);
  overlay.appendChild(barBg);
  overlay.appendChild(label);
  document.body.appendChild(overlay);

  return {
    /** Met à jour la barre. `label` : texte facultatif sous la barre. */
    setProgress(done, total, text) {
      const pct = total > 0 ? Math.round(100 * done / total) : 0;
      barFg.style.width = pct + '%';
      label.textContent = text ? (text + '  (' + pct + '%)') : (pct + '%');
    },
    /** Termine : petit délai à 100%, fondu, puis retrait. */
    finish() {
      barFg.style.width = '100%';
      label.textContent = 'Prêt !';
      setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 550);
      }, 250);
    },
    el: overlay,
  };
}
