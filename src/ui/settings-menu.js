/* =====================================================================
   Château Fort — Menu de réglages  (luminosité + caméra)
   ---------------------------------------------------------------------
   Un bouton ⚙ en haut à droite ouvre un petit panneau :
     - Luminosité : slider 0.4 (sombre) … 1.0 (neutre) … 1.8 (clair).
     - Angle caméra : slider −60° … +60° autour de la vue initiale
       (doublé par les touches ← / → maintenues).

   Le panneau se synchronise à l'ouverture (il relit l'angle courant, qui
   a pu changer au clavier). UI simple en HTML, comme la barre de sorts.
   ===================================================================== */

export function createSettingsMenu({ onBrightness, getAngle, setAngle,
  onMasterVolume, onMusicVolume, onSfxVolume, initialVolumes,
  onQualityMode, initialQualityMode } = {}) {
  // Bouton ⚙ (toggle).
  const btn = document.createElement('button');
  btn.textContent = '⚙';
  btn.title = 'Réglages (luminosité, caméra)';
  btn.style.cssText = [
    'position:fixed', 'top:14px', 'right:14px', 'z-index:920',
    'width:38px', 'height:38px', 'border-radius:10px',
    'background:rgba(12,20,28,.92)', 'color:#eaf2f8',
    'border:1px solid #2a5a72', 'font-size:18px', 'cursor:pointer',
  ].join(';');
  document.body.appendChild(btn);

  // Panneau.
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed', 'top:58px', 'right:14px', 'z-index:920', 'display:none',
    'width:230px', 'padding:12px 14px',
    'background:rgba(12,20,28,.94)', 'color:#eaf2f8',
    'border:1px solid #2a5a72', 'border-radius:10px',
    'font-family:system-ui,sans-serif', 'font-size:12px',
    'box-shadow:0 4px 14px rgba(0,0,0,.45)',
  ].join(';');

  // --- Ligne luminosité -------------------------------------------------
  const briLabel = document.createElement('div');
  briLabel.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:3px';
  briLabel.innerHTML = '<span>Luminosité</span><span id="briVal">1.00</span>';
  const bri = document.createElement('input');
  bri.type = 'range'; bri.min = '0.4'; bri.max = '1.8'; bri.step = '0.05'; bri.value = '1';
  bri.style.cssText = 'width:100%;margin-bottom:12px';
  const briVal = briLabel.querySelector('#briVal');
  bri.addEventListener('input', () => {
    briVal.textContent = Number(bri.value).toFixed(2);
    onBrightness?.(Number(bri.value));
  });

  // --- Ligne angle caméra ----------------------------------------------
  const camLabel = document.createElement('div');
  camLabel.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:3px';
  camLabel.innerHTML = '<span>Angle caméra</span><span id="camVal">0°</span>';
  const cam = document.createElement('input');
  cam.type = 'range'; cam.min = '-60'; cam.max = '60'; cam.step = '1'; cam.value = '0';
  cam.style.cssText = 'width:100%;margin-bottom:10px';
  const camVal = camLabel.querySelector('#camVal');
  cam.addEventListener('input', () => {
    camVal.textContent = cam.value + '°';
    setAngle?.(Number(cam.value));
  });

  // --- Section audio (T5.3) : volumes maître / musique / effets ---------
  const vols = initialVolumes || { master: 0.6, music: 0.45, sfx: 0.8 };
  function volumeRow(name, value, onChange) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:3px';
    const pct = Math.round(value * 100);
    row.innerHTML = '<span>' + name + '</span><span>' + pct + '%</span>';
    const val = row.querySelector('span:last-child');
    const s = document.createElement('input');
    s.type = 'range'; s.min = '0'; s.max = '1'; s.step = '0.05'; s.value = String(value);
    s.style.cssText = 'width:100%;margin-bottom:10px';
    s.addEventListener('input', () => {
      val.textContent = Math.round(Number(s.value) * 100) + '%';
      onChange?.(Number(s.value));
    });
    panel.appendChild(row); panel.appendChild(s);
  }

  const audioTitle = document.createElement('div');
  audioTitle.style.cssText = 'border-top:1px solid #24485c;margin:2px 0 8px;padding-top:8px;opacity:.8';
  audioTitle.textContent = 'Son';
  panel.appendChild(audioTitle);
  volumeRow('Volume général', vols.master, onMasterVolume);
  volumeRow('Musique', vols.music, onMusicVolume);
  volumeRow('Effets', vols.sfx, onSfxVolume);

  // --- Qualité graphique (T7.3) : Auto / Haute / Basse ------------------
  const gfxTitle = document.createElement('div');
  gfxTitle.style.cssText = 'border-top:1px solid #24485c;margin:2px 0 8px;padding-top:8px;opacity:.8';
  gfxTitle.textContent = 'Performance';
  panel.appendChild(gfxTitle);

  const gfxRow = document.createElement('div');
  gfxRow.style.cssText = 'display:flex;gap:5px;margin-bottom:4px';
  const modes = [['auto', 'Auto'], ['high', 'Haute'], ['low', 'Basse']];
  let curMode = initialQualityMode || 'auto';
  const btns = {};
  for (const [mode, label] of modes) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'flex:1;padding:6px 4px;border-radius:6px;cursor:pointer;'
      + 'font-family:inherit;font-size:12px;border:1px solid #3a7aa2;'
      + 'background:' + (mode === curMode ? '#1d3a52' : '#14212e') + ';color:#eaf2f8';
    b.onclick = () => {
      curMode = mode;
      for (const [m, bb] of Object.entries(btns)) bb.style.background = (m === mode ? '#1d3a52' : '#14212e');
      onQualityMode?.(mode);
    };
    btns[mode] = b;
    gfxRow.appendChild(b);
  }
  panel.appendChild(gfxRow);
  const gfxHint = document.createElement('div');
  gfxHint.style.cssText = 'font-size:10px;opacity:.55;margin-bottom:4px';
  gfxHint.textContent = 'Auto : réduit la qualité si le jeu rame.';
  panel.appendChild(gfxHint);

  // --- Rappel des raccourcis --------------------------------------------
  const help = document.createElement('div');
  help.style.cssText = 'opacity:.65;font-size:11px;line-height:1.5';
  help.innerHTML = '← → : orienter la caméra<br>molette : zoom<br>Espace : pause tactique';

  panel.appendChild(briLabel); panel.appendChild(bri);
  panel.appendChild(camLabel); panel.appendChild(cam);
  panel.appendChild(help);
  document.body.appendChild(panel);

  btn.addEventListener('click', () => {
    const opening = panel.style.display === 'none';
    if (opening && getAngle) {
      // synchronise le slider avec l'angle courant (modifiable au clavier).
      const a = Math.round(getAngle());
      cam.value = String(a);
      camVal.textContent = a + '°';
    }
    panel.style.display = opening ? 'block' : 'none';
  });

  return { btn, panel };
}
