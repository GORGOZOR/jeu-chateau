/* =====================================================================
   Château Fort — Système audio  (T5.3)
   ---------------------------------------------------------------------
   Tout est SYNTHÉTISÉ via l'API Web Audio (aucun fichier son requis) :
   - Effets : tir (par type de tour), mort d'ennemi, pose de tour, sort,
     début de vague, victoire/défaite.
   - Musique : nappe d'ambiance douce qui évolue en boucle.
   - Volumes : maître / musique / effets réglables (menu ⚙).

   Contrainte navigateur : le contexte audio ne démarre qu'après une
   interaction de l'utilisateur. unlock() est donc appelé au premier
   clic/touche (voir main.js).

   Remplaçable : si de vrais fichiers audio arrivent un jour, il suffira
   de substituer les fonctions play*() par la lecture de buffers.
   ===================================================================== */

export function createAudio() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  const vol = { master: 0.6, music: 0.45, sfx: 0.8 };

  // Si l'API n'existe pas (très vieux navigateur), on renvoie une version
  // inerte : toutes les fonctions existent mais ne font rien.
  if (!AC) {
    const noop = () => {};
    return {
      unlock: noop, playShoot: noop, playDeath: noop, playPlace: noop,
      playSpell: noop, playWaveStart: noop, playEnd: noop,
      startMusic: noop, stopMusic: noop,
      setMasterVolume: noop, setMusicVolume: noop, setSfxVolume: noop,
      get volumes() { return { ...vol }; }, get available() { return false; },
    };
  }

  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let musicTimer = null, musicOn = false;

  function ensure() {
    if (ctx) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = vol.master; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = vol.music; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = vol.sfx; sfxGain.connect(master);
  }
  function unlock() {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
  }

  /* ---- Briques de synthèse ----------------------------------------- */
  // Note tonale : oscillateur avec enveloppe et éventuel glissando.
  function tone({ freq, freqEnd, type = 'sine', dur = 0.12, gain = 0.3, attack = 0.004, dest }) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(dest || sfxGain);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  // Bruit blanc filtré (souffle, impact, poussière).
  function noise({ dur = 0.15, gain = 0.3, filterType = 'lowpass', freq = 1200, freqEnd, dest }) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const flt = ctx.createBiquadFilter(); flt.type = filterType;
    flt.frequency.setValueAtTime(freq, t0);
    if (freqEnd) flt.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(g); g.connect(dest || sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  /* ---- Effets (throttlés pour les plus fréquents) ------------------ */
  let lastShoot = 0;
  function playShoot(type) {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - lastShoot < 0.05) return;  // anti-spam : max ~20/s
    lastShoot = now;
    const jitter = 1 + (Math.random() - 0.5) * 0.12;
    switch (type) {
      case 'baliste':
        tone({ freq: 220 * jitter, freqEnd: 90, type: 'square', dur: 0.14, gain: 0.28 });
        break;
      case 'bucher':  // feu : souffle
        noise({ dur: 0.22, gain: 0.22, filterType: 'lowpass', freq: 900, freqEnd: 300 });
        break;
      case 'glace':   // givre : cristallin
        tone({ freq: 1200 * jitter, freqEnd: 800, type: 'triangle', dur: 0.16, gain: 0.16 });
        break;
      default:        // archers : corde brève
        tone({ freq: 640 * jitter, freqEnd: 300, type: 'triangle', dur: 0.09, gain: 0.2 });
    }
  }
  function playDeath() {
    if (!ctx) return;
    tone({ freq: 300, freqEnd: 70, type: 'sawtooth', dur: 0.22, gain: 0.22 });
    noise({ dur: 0.2, gain: 0.18, filterType: 'lowpass', freq: 800, freqEnd: 200 });
  }
  function playPlace() {
    if (!ctx) return;
    tone({ freq: 160, freqEnd: 110, type: 'square', dur: 0.14, gain: 0.25 });
    noise({ dur: 0.18, gain: 0.16, filterType: 'lowpass', freq: 500 });
  }
  function playSpell() {
    if (!ctx) return;
    tone({ freq: 300, freqEnd: 1100, type: 'sine', dur: 0.4, gain: 0.22 });
    noise({ dur: 0.35, gain: 0.12, filterType: 'bandpass', freq: 600, freqEnd: 2000 });
  }
  function playWaveStart() {
    if (!ctx) return;
    // Cor à deux notes.
    tone({ freq: 196, type: 'sawtooth', dur: 0.28, gain: 0.22 });
    setTimeout(() => tone({ freq: 294, type: 'sawtooth', dur: 0.4, gain: 0.22 }), 160);
  }
  function playEnd(victory) {
    if (!ctx) return;
    const notes = victory ? [392, 494, 587, 784] : [392, 330, 262, 196];
    notes.forEach((f, i) => setTimeout(
      () => tone({ freq: f, type: 'triangle', dur: 0.35, gain: 0.26 }), i * 180));
  }

  /* ---- Musique d'ambiance : nappe douce qui cycle des accords ------ */
  // Accords mineurs espacés, joués en oscillateurs sinus détunés, avec un
  // fondu lent → une nappe calme, non intrusive, qui tourne en boucle.
  const CHORDS = [
    [130.81, 155.56, 196.00], // Do mineur (Do, Mib, Sol)
    [146.83, 174.61, 220.00], // Ré mineur
    [174.61, 220.00, 261.63], // Fa majeur
    [116.54, 146.83, 174.61], // Sib majeur
  ];
  let chordIdx = 0;
  function playChord(freqs) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const dur = 6.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 2.2);      // fondu d'entrée lent
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);   // fondu de sortie
    g.connect(musicGain);
    for (const f of freqs) {
      for (const det of [-2, 2]) {   // léger détune → nappe chaleureuse
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(g);
        o.start(t0); o.stop(t0 + dur + 0.1);
      }
    }
  }
  function startMusic() {
    ensure();
    if (musicOn) return;
    musicOn = true;
    const step = () => {
      if (!musicOn) return;
      playChord(CHORDS[chordIdx % CHORDS.length]);
      chordIdx++;
    };
    step();
    musicTimer = setInterval(step, 6000); // recouvrement léger entre accords
  }
  function stopMusic() {
    musicOn = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  /* ---- Volumes ------------------------------------------------------ */
  const clamp = (v) => Math.max(0, Math.min(1, v));
  function setMasterVolume(v) { vol.master = clamp(v); if (master) master.gain.value = vol.master; }
  function setMusicVolume(v) { vol.music = clamp(v); if (musicGain) musicGain.gain.value = vol.music; }
  function setSfxVolume(v) { vol.sfx = clamp(v); if (sfxGain) sfxGain.gain.value = vol.sfx; }

  return {
    unlock, playShoot, playDeath, playPlace, playSpell, playWaveStart, playEnd,
    startMusic, stopMusic,
    setMasterVolume, setMusicVolume, setSfxVolume,
    get volumes() { return { ...vol }; }, get available() { return true; },
  };
}
