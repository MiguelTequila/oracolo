/* L'Oracolo di ErCaciotta90 — logica del sito (nessuna libreria esterna). */
(function () {
"use strict";
const CFG = window.CONFIG || {};
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

// ---------- memoria locale (puo' mancare: modalita' privata, ecc.)
const mem = {
  get(k, d) { try { const v = localStorage.getItem("oracolo." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("oracolo." + k, JSON.stringify(v)); } catch (e) {} },
};

// ---------- casualita'
function rngSeed(seed) { // mulberry32
  let a = seed >>> 0;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const rnd = Math.random;
function pesca(lista, pesi, r = rnd) {
  const tot = pesi.reduce((a, b) => a + b, 0); let x = r() * tot;
  for (let i = 0; i < lista.length; i++) { x -= pesi[i]; if (x <= 0) return lista[i]; }
  return lista[lista.length - 1];
}
function poisson(l, r = rnd) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
function mescola(arr, r = rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- dati
let PARTITE = [], ROSE = {}, META = {}, INDISP = new Set(), RIGORISTI = {};
async function carica(url) {
  const inl = window.DATI_INLINE; if (inl) { const k = url.split("/").pop().replace(".json", ""); if (inl[k]) return inl[k]; }
  const r = await fetch(url + "?v=" + Date.now().toString().slice(0, -5)); if (!r.ok) throw new Error(url); return r.json(); }

// ---------- utilita' date (ora italiana)
function oggiRoma() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date()); }
function giorniDa(isoA, isoB) { return Math.round((Date.parse(isoB) - Date.parse(isoA)) / 86400000); }
function dataBella(iso, ora) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00Z");
  const g = d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return g + (ora ? " · " + oraItaliana(iso, ora) : "");
}
function oraItaliana(iso, ora) { // gli orari del modello sono UTC
  try { return new Date(iso + "T" + ora + ":00Z").toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }); }
  catch (e) { return ora; }
}

// ================================================================ ORACOLO
const PESI_GOL = { A: 6, C: 2.4, D: 0.7, P: 0.02 };
const PESI_GIALLO = { D: 1.5, C: 1.4, A: 0.7, P: 0.15 };
const REPARTO = { P: "Portiere", D: "Difensore", C: "Centrocampista", A: "Attaccante" };
const GIALLI_MEDI = 4.3; // media di gialli a partita in Serie A, circa
const PROB_ROSSO_DIRETTO = 0.07;

function matriceRisultati(lh, la, rho, max = 9) {
  const pois = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
  const celle = [], pesi = [];
  for (let h = 0; h <= max; h++) for (let a = 0; a <= max; a++) {
    let tau = 1;
    if (h === 0 && a === 0) tau = 1 - lh * la * rho;
    else if (h === 0 && a === 1) tau = 1 + lh * rho;
    else if (h === 1 && a === 0) tau = 1 + la * rho;
    else if (h === 1 && a === 1) tau = 1 - rho;
    celle.push([h, a]); pesi.push(Math.max(0, tau) * pois(lh, h) * pois(la, a));
  }
  return { celle, pesi };
}

// Gol attesi per una sfida libera: forza attacco/difesa dalle statistiche
// piu' recenti di ogni squadra, ridotte verso la media.
function forzeSquadre() {
  const f = {};
  for (const p of PARTITE) {
    const put = (sq, s) => { if (s && s.gf != null && s.gs != null && !f[sq]) f[sq] = { gf: s.gf, gs: s.gs }; };
    put(p.casa, p.statCasa); put(p.trasferta, p.statTrasf);
  }
  const v = Object.values(f);
  const media = v.length ? v.reduce((a, b) => a + b.gf, 0) / v.length : 1.35;
  return { f, media: media || 1.35 };
}
function lambdaLibera(casa, trasf) {
  const reale = PARTITE.find(p => p.casa === casa && p.trasferta === trasf);
  if (reale) return { lh: reale.lh, la: reale.la, rho: reale.rho || 0 };
  const { f, media } = forzeSquadre();
  const k = 0.35; // quanto si tira verso la media
  const att = s => f[s] ? (1 - k) * (f[s].gf / media) + k : 1;
  const dif = s => f[s] ? (1 - k) * (f[s].gs / media) + k : 1;
  const cl = x => Math.min(3.4, Math.max(0.3, x));
  return { lh: cl(media * att(casa) * dif(trasf) * 1.11), la: cl(media * att(trasf) * dif(casa) / 1.11), rho: 0 };
}

function rosaDi(sq) {
  const r = (ROSE[sq] || []).filter(g => !INDISP.has(sq + "|" + g.n));
  return r.length ? r : null;
}
function pescaGiocatore(sq, pesi, esclusi) {
  const rosa = rosaDi(sq);
  if (!rosa) { const r = pesca(Object.keys(pesi), Object.values(pesi)); return { n: REPARTO[r], r, generico: true }; }
  const cand = rosa.filter(g => !esclusi || !esclusi.has(g.n));
  // p = peso giocatore 1 (riserva) ... 5 (big): chi gioca e vale di piu' segna di piu'
  const fattore = pesi === PESI_GOL ? (g => Math.pow(g.p || 2, 1.6)) : (g => 0.4 + 0.3 * (g.p || 2));
  return pesca(cand, cand.map(g => (pesi[g.r] || 0.5) * fattore(g)));
}
function minuto(tardi) {
  let m = tardi ? Math.max(3, Math.round(90 * Math.sqrt(rnd()))) : 1 + Math.floor(rnd() * 90);
  if (m >= 45 && m <= 46 && rnd() < .5) return "45+" + (1 + Math.floor(rnd() * 3));
  if (m >= 89 && rnd() < .6) return "90+" + (1 + Math.floor(rnd() * 5));
  return String(m);
}
const valMin = m => m.includes("+") ? parseInt(m) + parseInt(m.split("+")[1]) / 10 : parseInt(m);

// Frequenze medie in Serie A (stime arrotondate)
const QUOTA_GOL_SU_RIGORE = 0.085;   // circa 1 gol su 12 arriva dal dischetto
const RIGORI_FALLITI_MEDI = 0.07;    // rigori sbagliati o parati a partita
const QUOTA_PARATI = 0.65;           // dei falliti: 2 su 3 parati, 1 su 3 fuori/palo
const INFORTUNI_MEDI = 0.35;         // infortuni a partita che costringono al cambio

function rigoristaDi(sq) {
  const rosa = rosaDi(sq);
  if (!rosa) return { n: "Rigorista", generico: true };
  // prima la lista ufficiale dei rigoristi (il primo disponibile)
  for (const nome of RIGORISTI[sq] || []) { const g = rosa.find(x => x.n === nome); if (g) return g; }
  // il rigorista e' l'attaccante (o in mancanza il centrocampista) che vale di piu'
  for (const r of ["A", "C"]) {
    const c = rosa.filter(g => g.r === r);
    if (c.length) return c.reduce((a, b) => ((b.p || 0) > (a.p || 0) ? b : a));
  }
  return rosa[0];
}
function portiereDi(sq) {
  const rosa = rosaDi(sq), gk = rosa ? rosa.filter(g => g.r === "P") : [];
  if (!gk.length) return { n: "il portiere", generico: true };
  return gk.reduce((a, b) => ((b.p || 0) > (a.p || 0) ? b : a));
}

function profezia(casa, trasf, lam) {
  const { celle, pesi } = matriceRisultati(lam.lh, lam.la, lam.rho);
  const [gh, ga] = pesca(celle, pesi);
  const fuori = {}; // nome -> minuto da cui non e' piu' in campo
  const inCampo = (g, m) => g.generico || !(g.n in fuori) || fuori[g.n] > valMin(m);
  const scegli = (sq, pesiR, m) => {
    const via = new Set(Object.keys(fuori).filter(n => fuori[n] <= valMin(m)));
    return pescaGiocatore(sq, pesiR, via);
  };
  // infortuni (prima di tutto: chi si fa male esce)
  const infortuni = [];
  for (let i = 0, n = poisson(INFORTUNI_MEDI); i < n; i++) {
    const sq = rnd() < 0.5 ? casa : trasf, m = minuto(false);
    const g = scegli(sq, { P: 0.2, D: 1.2, C: 1.1, A: 1 }, m);
    if (!g.generico && g.n in fuori) continue;
    infortuni.push({ sq, n: g.n, m }); if (!g.generico) fuori[g.n] = valMin(m);
  }
  // cartellini: prima l'eventuale rosso diretto, poi i gialli
  const ammoniti = {}, cartellini = [];
  if (rnd() < PROB_ROSSO_DIRETTO) {
    const sq = rnd() < 0.5 ? casa : trasf, m = minuto(true), g = scegli(sq, { D: 1.6, C: 1.3, A: .8, P: .3 }, m);
    if (inCampo(g, m)) { cartellini.push({ sq, n: g.n, m, tipo: "rosso" }); if (!g.generico) fuori[g.n] = valMin(m); }
  }

  const eventiGialli = [];
  for (let i = 0, n = poisson(GIALLI_MEDI); i < n; i++) eventiGialli.push(minuto(true));
  eventiGialli.sort((a, b) => valMin(a) - valMin(b)).forEach(m => {
    const sq = rnd() < 0.54 ? trasf : casa, g = scegli(sq, PESI_GIALLO, m);
    if (!inCampo(g, m)) return;
    // chi e' gia' ammonito di solito si controlla: 6 volte su 10 il giallo va a un altro
    if (!g.generico && ammoniti[g.n] && rnd() < 0.6) { const altro = scegli(sq, PESI_GIALLO, m); if (!ammoniti[altro.n]) { ammoniti[altro.n] = true; cartellini.push({ sq, n: altro.n, m, tipo: "giallo" }); return; } }
    if (!g.generico && ammoniti[g.n]) {
      // se aveva un rosso diretto piu' tardi, quel rosso non c'e' piu': e' gia' fuori
      const k = cartellini.findIndex(c => c.n === g.n && c.tipo === "rosso"); if (k >= 0) cartellini.splice(k, 1);
      cartellini.push({ sq, n: g.n, m, tipo: "rosso2" }); fuori[g.n] = valMin(m);
    }
    else { ammoniti[g.n] = true; cartellini.push({ sq, n: g.n, m, tipo: "giallo" }); }
  });
  // gol, alcuni su rigore
  const gol = [];
  const segna = (sq, contro) => {
    const m = minuto(false);
    if (rnd() < 0.03) { const g = scegli(contro, { D: 3, C: 1, A: .3, P: .2 }, m); gol.push({ sq, n: g.n, m, extra: "aut." }); return; }
    if (rnd() < QUOTA_GOL_SU_RIGORE) {
      const r = rigoristaDi(sq);
      if (inCampo(r, m)) { gol.push({ sq, n: r.n, m, extra: "rig." }); return; }
    }
    gol.push({ sq, n: scegli(sq, PESI_GOL, m).n, m });
  };
  for (let i = 0; i < gh; i++) segna(casa, trasf);
  for (let i = 0; i < ga; i++) segna(trasf, casa);
  // rigori sbagliati o parati (non cambiano il risultato)
  const rigoriFalliti = [];
  for (let i = 0, n = poisson(RIGORI_FALLITI_MEDI); i < n; i++) {
    const sq = rnd() < lam.lh / (lam.lh + lam.la) ? casa : trasf, contro = sq === casa ? trasf : casa, m = minuto(false);
    let r = rigoristaDi(sq); if (!inCampo(r, m)) r = scegli(sq, PESI_GOL, m);
    const parato = rnd() < QUOTA_PARATI, gk = portiereDi(contro);
    rigoriFalliti.push({ sq, n: r.n, m, esito: parato ? "parato" : pesca(["fuori", "palo", "traversa"], [3, 2, 1]), portiere: parato ? gk.n : null, sqPortiere: contro });
  }
  const ord = (a, b) => valMin(a.m) - valMin(b.m);
  gol.sort(ord); cartellini.sort(ord); infortuni.sort(ord); rigoriFalliti.sort(ord);
  return { casa, trasf, gh, ga, gol, cartellini, infortuni, rigoriFalliti, frase: fraseOracolo(gh, ga, casa, trasf) };
}

function fraseOracolo(gh, ga, casa, trasf) {
  const tot = gh + ga, diff = Math.abs(gh - ga), vince = gh > ga ? casa : trasf;
  const generiche = [
    "Le stelle non mentono. Gli arbitri, a volte sì.",
    "Così è scritto nella sfera. Il VAR potrebbe dissentire.",
    "Ho visto il futuro: c'era anche un fuorigioco millimetrico.",
    "La nebbia si dirada… e appare il tabellino.",
    "L'Oracolo ha parlato. Il fantallenatore trema.",
    "Visione chiara come un rigore al 95'.",
    "I fondi del caffè confermano.",
  ];
  if (tot === 0) return "Vedo… nebbia. E sbadigli. Tanti sbadigli.";
  if (tot >= 6) return "Una pioggia di gol! I portieri farebbero meglio a restare a casa.";
  if (diff >= 3) return `Notte fonda per chi incontra ${vince}. La sfera è spietata.`;
  if (gh === ga) return pesca(["Pace tra i due regni: nessuno prevale.", "Un punto a testa, e tutti scontenti.", generiche[0]], [1, 1, 1]);
  if (diff === 1 && tot >= 3) return "Una battaglia decisa da un soffio. Cuori deboli, astenersi.";
  return pesca(generiche, generiche.map(() => 1));
}

function testoCondivisione(p) {
  const r = [`🔮 L'Oracolo di ErCaciotta90 ha parlato:`, `${p.casa} ${p.gh}-${p.ga} ${p.trasf}`];
  if (p.gol.length) r.push("⚽ " + p.gol.map(g => `${g.n}${g.extra ? " (" + g.extra + ")" : ""} ${g.m}'`).join(", "));
  const gialli = p.cartellini.filter(c => c.tipo === "giallo"), rossi = p.cartellini.filter(c => c.tipo !== "giallo");
  if (gialli.length) r.push("🟨 " + gialli.map(c => c.n).join(", "));
  if (rossi.length) r.push("🟥 " + rossi.map(c => `${c.n} ${c.m}'`).join(", "));
  p.rigoriFalliti.forEach(x => r.push(x.esito === "parato" ? `🧤 ${x.portiere} para il rigore a ${x.n} (${x.m}')` : `❌ ${x.n} sbaglia il rigore, ${x.esito} (${x.m}')`));
  if (p.infortuni.length) r.push("🚑 " + p.infortuni.map(x => `${x.n} ${x.m}'`).join(", "));
  r.push(`"${p.frase}"`, "", "Interroga anche tu l'Oracolo: " + urlSito());
  return r.join("\n");
}
function urlSito() { return location.origin + location.pathname.replace(/index\.html$/, ""); }

async function condividi(testo) {
  if (navigator.share) { try { await navigator.share({ text: testo }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(testo); toast("Copiato! Incollalo nel gruppo WhatsApp"); }
  catch (e) { toast("Condivisione non disponibile qui"); }
  try { window.open("https://wa.me/?text=" + encodeURIComponent(testo), "_blank"); } catch (e) {}
}
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2200); }

// ---------- interfaccia oracolo
const statoO = { modo: "giornata", giornate: [], gIdx: 0, scelta: null };

function preparaOracolo() {
  statoO.giornate = [...new Set(PARTITE.map(p => p.giornata))].sort((a, b) => a - b);
  // squadre per la sfida libera
  const squadre = [...new Set([...PARTITE.map(p => p.casa), ...PARTITE.map(p => p.trasferta), ...Object.keys(ROSE)])].sort((a, b) => a.localeCompare(b, "it"));
  const sc = $("#sel-casa"), st = $("#sel-trasf");
  sc.innerHTML = st.innerHTML = squadre.map(s => `<option>${esc(s)}</option>`).join("");
  if (squadre.length > 1) st.selectedIndex = 1;
  sc.onchange = st.onchange = aggiornaBottone;
  $("#g-prec").onclick = () => { statoO.gIdx = Math.max(0, statoO.gIdx - 1); disegnaGiornata(); };
  $("#g-succ").onclick = () => { statoO.gIdx = Math.min(statoO.giornate.length - 1, statoO.gIdx + 1); disegnaGiornata(); };
  document.querySelectorAll("#vista-oracolo .int").forEach(b => b.onclick = () => {
    document.querySelectorAll("#vista-oracolo .int").forEach(x => x.classList.toggle("attivo", x === b));
    statoO.modo = b.dataset.modo;
    $("#pannello-giornata").hidden = statoO.modo !== "giornata";
    $("#pannello-libera").hidden = statoO.modo !== "libera";
    aggiornaBottone();
  });
  $("#interroga").onclick = interroga;
  if (!statoO.giornate.length) {
    $("#lista-partite").innerHTML = `<div class="nessuno">Nessuna partita in calendario al momento. Prova la Sfida libera!</div>`;
    $("#g-titolo").textContent = "—";
  } else disegnaGiornata();
  const senzaRose = squadre.filter(s => !rosaDi(s));
  if (senzaRose.length) {
    const a = $("#avviso-rose"); a.hidden = false;
    a.textContent = senzaRose.length === squadre.length
      ? "Rose in arrivo: finché non sono caricate, l'Oracolo indica solo il reparto di chi segna o viene ammonito."
      : "Per alcune squadre la rosa non è ancora caricata: per loro l'Oracolo indica solo il reparto.";
  }
}

function disegnaGiornata() {
  const g = statoO.giornate[statoO.gIdx];
  $("#g-titolo").textContent = g + "ª giornata";
  $("#g-prec").disabled = statoO.gIdx === 0;
  $("#g-succ").disabled = statoO.gIdx === statoO.giornate.length - 1;
  const box = $("#lista-partite"); box.innerHTML = "";
  PARTITE.filter(p => p.giornata === g).forEach(p => {
    const b = el("button", "partita" + (statoO.scelta === p ? " scelta" : ""),
      `<span class="sq c">${esc(p.casa)}</span><span class="quando">${esc(dataBella(p.data, p.ora))}</span><span class="sq t">${esc(p.trasferta)}</span>`);
    b.onclick = () => { statoO.scelta = p; disegnaGiornata(); aggiornaBottone(); };
    box.appendChild(b);
  });
}
function aggiornaBottone() {
  const b = $("#interroga");
  if (statoO.modo === "giornata") {
    b.disabled = !statoO.scelta; b.textContent = statoO.scelta ? "🔮 Interroga l'Oracolo" : "Scegli una partita";
  } else {
    const ok = $("#sel-casa").value && $("#sel-casa").value !== $("#sel-trasf").value;
    b.disabled = !ok; b.textContent = ok ? "🔮 Interroga l'Oracolo" : "Scegli due squadre diverse";
  }
}

let inCorso = false;
function interroga() {
  if (inCorso) return;
  let casa, trasf, lam;
  if (statoO.modo === "giornata") { const p = statoO.scelta; casa = p.casa; trasf = p.trasferta; lam = { lh: p.lh, la: p.la, rho: p.rho || 0 }; }
  else { casa = $("#sel-casa").value; trasf = $("#sel-trasf").value; lam = lambdaLibera(casa, trasf); }
  const box = $("#responso"); box.hidden = false; inCorso = true;
  box.innerHTML = `<div class="sfera"></div><p class="attesa">${esc(pesca(["L'Oracolo scruta la nebbia…", "Consulto le stelle e il VAR…", "Leggo i fondi del caffè…", "La sfera si sta scaldando…"], [1, 1, 1, 1]))}</p>`;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => {
    const p = profezia(casa, trasf, lam);
    mostraProfezia(p); inCorso = false;
    mem.set("profezie", (mem.get("profezie", 0) || 0) + 1);
  }, 1600);
}

function mostraProfezia(p) {
  const colonna = (sq, lista, fmt) => {
    const it = lista.filter(x => x.sq === sq);
    return `<div class="colonna"><h4>${esc(sq)}</h4>${it.length ? it.map(fmt).join("") : `<div class="nessuno">—</div>`}</div>`;
  };
  const sezione = (titolo, lista, fmt) => lista.length
    ? `<div class="sezione-ev"><div class="titolo-ev">${titolo}</div><div class="eventi">${colonna(p.casa, lista, fmt)}${colonna(p.trasf, lista, fmt)}</div></div>` : "";
  const ev = (m, ico, testo) => `<div class="ev"><span class="min">${m}'</span>${ico} ${testo}</div>`;
  const fGol = g => ev(g.m, "⚽", esc(g.n) + (g.extra ? ` <span class="tag">${g.extra === "rig." ? "su rigore" : "autogol"}</span>` : ""));
  const icona = { giallo: "🟨", rosso: "🟥", rosso2: "🟨🟥" };
  const fCart = c => ev(c.m, icona[c.tipo], esc(c.n) + (c.tipo === "rosso" ? ` <span class="tag rosso">rosso diretto</span>` : c.tipo === "rosso2" ? ` <span class="tag rosso">espulso</span>` : ""));
  const fRig = x => x.esito === "parato"
    ? ev(x.m, "🧤", `Rigore di ${esc(x.n)} <b>parato</b> da ${esc(x.portiere)}`)
    : ev(x.m, "❌", `${esc(x.n)} sbaglia il rigore <span class="tag">${x.esito}</span>`);
  const fInf = x => ev(x.m, `<span class="croce">✚</span>`, `${esc(x.n)} <span class="tag">esce infortunato</span>`);
  const box = $("#responso");
  box.innerHTML = `
    <div class="tabellone"><div class="sq c">${esc(p.casa)}</div><div class="punteggio">${p.gh} - ${p.ga}</div><div class="sq">${esc(p.trasf)}</div></div>
    <p class="frase">"${esc(p.frase)}"</p>
    ${sezione("⚽ Marcatori", p.gol, fGol)}
    ${sezione("🟨 Cartellini", p.cartellini, fCart)}
    ${sezione("🎯 Rigori falliti", p.rigoriFalliti, fRig)}
    ${sezione("✚ Infortuni", p.infortuni, fInf)}
    ${!p.cartellini.length ? `<p class="nessuno centro">Partita correttissima: nessun cartellino.</p>` : ""}
    <div class="fila" style="margin-top:16px">
      <button class="bottone verde" id="cond-prof">📲 Condividi</button>
      <button class="bottone" id="di-nuovo">🔁 Chiedi di nuovo</button>
    </div>`;
  $("#cond-prof").onclick = () => condividi(testoCondivisione(p));
  $("#di-nuovo").onclick = interroga;
}

// ================================================================ QUIZ
const INIZIO_QUIZ = "2026-11-01";
function numeroQuiz() { return giorniDa(INIZIO_QUIZ, oggiRoma()) + 1; }
function domandeDelGiorno() {
  const n = numeroQuiz(), r = rngSeed(n * 9973 + 17), scelte = [];
  for (let l = 1; l <= 5; l++) {
    const lista = window.DOMANDE.filter(d => d.l === l);
    if (!lista.length) continue;
    // passo 7: con liste che non sono multipli di 7 si vedono tutte prima di ripetere
    const passo = lista.length % 7 === 0 ? 1 : 7;
    scelte.push(preparaDomanda(lista[((n - 1) * passo + l * 3) % lista.length], r));
  }
  return scelte;
}
function preparaDomanda(d, r) {
  const ordine = mescola(d.o.map((_, i) => i), r);
  return { l: d.l, q: d.q, s: d.s, o: ordine.map(i => d.o[i]), a: ordine.indexOf(d.a) };
}
function domandeLeggenda() {
  const lista = mescola(window.DOMANDE.filter(d => d.l >= 4)).slice(0, 10);
  return lista.map(d => preparaDomanda(d, rnd));
}
const NOMI_LIVELLO = { 1: "Riscaldamento", 2: "Tifoso", 3: "Esperto", 4: "Malato di calcio", 5: "Leggenda" };

function statoQuiz() {
  return mem.get("quiz", { giocati: 0, serie: 0, ultimo: null, record: 0, oggi: null, recordLeggenda: 0, nick: "" });
}

function quizHome() {
  const s = statoQuiz(), oggi = oggiRoma(), giocatoOggi = s.oggi && s.oggi.data === oggi;
  // la serie si azzera se si e' saltato un giorno
  const serie = s.ultimo && giorniDa(s.ultimo, oggi) <= 1 ? s.serie : 0;
  const sblocco = CFG.sbloccoLeggenda || 3, sbloccata = s.giocati >= sblocco;
  $("#quiz-gioco").hidden = true;
  const h = $("#quiz-home"); h.hidden = false;
  h.innerHTML = `
    <div class="carta">
      <h2>🧠 Quiz dell'Oracolo #${numeroQuiz()}</h2>
      <p class="piccolo">5 domande uguali per tutti, dalla facile alla leggendaria. ${CFG.secondiQuiz || 15} secondi a domanda. Una sola possibilità al giorno.</p>
      <div class="statistiche">
        <div class="stat"><b>${serie}🔥</b><span>giorni di fila</span></div>
        <div class="stat"><b>${s.giocati}</b><span>quiz giocati</span></div>
        <div class="stat"><b>${s.record}</b><span>record punti</span></div>
      </div>
      ${giocatoOggi ? `
        <div class="centro"><div class="griglia">${s.oggi.griglia}</div>
        <p>Oggi: <b>${s.oggi.giuste}/5</b> · <b>${s.oggi.punti}</b> punti</p>
        <p class="piccolo">Prossimo quiz tra <span id="countdown"></span></p></div>
        <button class="bottone verde" style="width:100%" id="ricondividi">📲 Condividi il risultato</button>`
      : `<div class="due-campi">
           <label class="piccolo">Il tuo nome in classifica
             <input class="input" id="nick" maxlength="20" placeholder="es. ErCaciotta" value="${esc(s.nick || "")}"></label>
           <label class="piccolo">Codice lega (facoltativo)
             <input class="input" id="lega" maxlength="20" placeholder="es. SERIEFORCO" value="${esc(s.lega || "")}"></label>
         </div>
         ${classificaAttiva() ? "" : `<p class="piccolo">La classifica online arriva a breve: per ora il nome compare nel risultato condiviso.</p>`}
         <button class="bottone-grande" id="gioca">Gioca il quiz di oggi</button>`}
    </div>
    <div class="carta ${sbloccata ? "" : "lucchetto"}">
      <h2>👑 Modalità Leggenda ${sbloccata ? "" : "🔒"}</h2>
      <p class="piccolo">10 domande solo per veri intenditori, ${CFG.secondiLeggenda || 12} secondi l'una. Si può rigiocare.</p>
      ${sbloccata
        ? `<p>Record: <b>${s.recordLeggenda || 0}</b> punti</p><button class="bottone oro" style="width:100%" id="leggenda">Sfida la Leggenda</button>`
        : `<p class="piccolo">Si sblocca dopo ${sblocco} quiz del giorno (${Math.min(s.giocati, sblocco)}/${sblocco}).</p>`}
    </div>`;
  const g = $("#gioca");
  if (g) g.onclick = () => {
    s.nick = ($("#nick").value || "").trim().replace(/\s+/g, " "); s.lega = ($("#lega").value || "").trim().replace(/\s+/g, "").toUpperCase();
    if (s.nick && (s.nick.length < 2)) { toast("Il nome deve avere almeno 2 caratteri"); return; }
    mem.set("quiz", s); avviaQuiz("giorno");
  };
  const l = $("#leggenda"); if (l) l.onclick = () => avviaQuiz("leggenda");
  const rc = $("#ricondividi"); if (rc) rc.onclick = () => condividi(testoQuiz(s.oggi, s.nick));
  if (giocatoOggi) avviaCountdown();
}
function avviaCountdown() {
  const t = () => {
    const c = $("#countdown"); if (!c) return clearInterval(avviaCountdown._i);
    const ora = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
    const mezz = new Date(ora); mezz.setHours(24, 0, 0, 0);
    const s = Math.max(0, Math.floor((mezz - ora) / 1000));
    c.textContent = `${Math.floor(s / 3600)}h ${String(Math.floor(s % 3600 / 60)).padStart(2, "0")}m`;
  };
  clearInterval(avviaCountdown._i); t(); avviaCountdown._i = setInterval(t, 30000);
}

const Q = { modo: null, domande: [], i: 0, esiti: [], punti: 0, tempoTot: 0, timer: null, inizio: 0, durata: 15 };

function avviaQuiz(modo) {
  Q.modo = modo; Q.i = 0; Q.esiti = []; Q.punti = 0; Q.tempoTot = 0;
  Q.domande = modo === "giorno" ? domandeDelGiorno() : domandeLeggenda();
  Q.durata = modo === "giorno" ? (CFG.secondiQuiz || 15) : (CFG.secondiLeggenda || 12);
  if (modo === "giorno") { // segna subito: chiudere la pagina non regala un secondo tentativo
    const s = statoQuiz(); s.inCorso = oggiRoma(); mem.set("quiz", s);
  }
  $("#quiz-home").hidden = true; $("#quiz-gioco").hidden = false;
  mostraDomanda();
}

function mostraDomanda() {
  const d = Q.domande[Q.i], box = $("#quiz-gioco");
  const punti = Q.domande.map((_, k) => `<div class="puntino ${k < Q.i ? (Q.esiti[k] ? "ok" : "ko") : k === Q.i ? "ora" : ""}"></div>`).join("");
  box.innerHTML = `<div class="carta">
    <div class="progresso">${punti}</div>
    <div class="livello">${NOMI_LIVELLO[d.l]} <span class="secondi" id="sec">${Q.durata}</span></div>
    <div class="domanda">${esc(d.q)}</div>
    <div class="timer"><i id="barra"></i></div>
    <div class="opzioni">${d.o.map((o, k) => `<button class="opz" data-k="${k}">${esc(o)}</button>`).join("")}</div>
    <div id="dopo"></div></div>`;
  box.querySelectorAll(".opz").forEach(b => b.onclick = () => rispondi(+b.dataset.k));
  Q.inizio = performance.now();
  const barra = $("#barra"), sec = $("#sec");
  clearInterval(Q.timer);
  Q.timer = setInterval(() => {
    const pass = (performance.now() - Q.inizio) / 1000, resto = Math.max(0, Q.durata - pass);
    barra.style.transform = `scaleX(${resto / Q.durata})`; sec.textContent = Math.ceil(resto);
    if (resto <= 0) rispondi(-1);
  }, 100);
}

function rispondi(k) {
  clearInterval(Q.timer);
  const d = Q.domande[Q.i], usato = Math.min(Q.durata, (performance.now() - Q.inizio) / 1000);
  const giusta = k === d.a; Q.esiti.push(giusta); Q.tempoTot += usato;
  if (giusta) Q.punti += 100 + Math.round((Q.durata - usato) * 10);
  document.querySelectorAll(".opz").forEach((b, j) => {
    b.disabled = true;
    if (j === d.a) b.classList.add("giusta"); else if (j === k) b.classList.add("sbagliata");
  });
  const ultima = Q.i === Q.domande.length - 1;
  $("#dopo").innerHTML = `<div class="spiega">${k === -1 ? "⏰ Tempo scaduto! " : giusta ? "✅ Esatto! " : "❌ No. "}${esc(d.s)}</div>
    <button class="bottone-grande" id="avanti">${ultima ? "Vedi il risultato" : "Avanti →"}</button>`;
  $("#avanti").onclick = () => { if (ultima) fineQuiz(); else { Q.i++; mostraDomanda(); } };
}

function testoQuiz(r, nick) {
  return [`🔮 Quiz dell'Oracolo di ErCaciotta90 #${r.numero}${nick ? " · " + nick : ""}`, `${r.griglia} ${r.giuste}/5 · ${r.punti} punti`, `⏱️ ${r.secondi}s`, "", "Sfidami: " + urlSito()].join("\n");
}

function fineQuiz() {
  const s = statoQuiz(), giuste = Q.esiti.filter(Boolean).length;
  const griglia = Q.esiti.map(e => e ? "🟩" : "🟥").join("");
  const box = $("#quiz-gioco");
  let ris;
  if (Q.modo === "giorno") {
    const oggi = oggiRoma();
    ris = { data: oggi, numero: numeroQuiz(), giuste, punti: Q.punti, griglia, secondi: Math.round(Q.tempoTot) };
    s.serie = s.ultimo && giorniDa(s.ultimo, oggi) === 1 ? s.serie + 1 : (s.ultimo === oggi ? s.serie : 1);
    s.ultimo = oggi; s.giocati += 1; s.record = Math.max(s.record, Q.punti); s.oggi = ris; delete s.inCorso;
  } else {
    s.recordLeggenda = Math.max(s.recordLeggenda || 0, Q.punti);
  }
  mem.set("quiz", s);
  const giudizio = giuste === Q.domande.length ? "Sei tu l'Oracolo. 👑" : giuste >= Q.domande.length * .8 ? "Da allenatore in seconda!" : giuste >= Q.domande.length / 2 ? "Tifoso vero, ma la Leggenda è lontana." : "Torna domani, la sfera ti aspetta.";
  box.innerHTML = `<div class="carta centro">
    <h2>${Q.modo === "giorno" ? "Quiz #" + numeroQuiz() + " completato" : "👑 Leggenda completata"}</h2>
    <div class="griglia">${griglia}</div>
    <div class="grande">${Q.punti}</div><p>punti · ${giuste}/${Q.domande.length} giuste · ${Math.round(Q.tempoTot)}s</p>
    <p class="frase">${giudizio}</p>
    ${Q.modo === "giorno" ? `<button class="bottone verde" style="width:100%" id="cond-quiz">📲 Sfida la tua lega</button>` : `<button class="bottone oro" style="width:100%" id="riprova">🔁 Riprova</button>`}
    <p id="esito-cl" class="esito-cl piccolo"></p>
    <button class="bottone" style="width:100%;margin-top:8px" id="torna">Torna al quiz</button></div>`;
  const c = $("#cond-quiz"); if (c) c.onclick = () => condividi(testoQuiz(ris, s.nick));
  if (Q.modo === "giorno") inviaRisultato(ris, s);
  const rp = $("#riprova"); if (rp) rp.onclick = () => avviaQuiz("leggenda");
  $("#torna").onclick = quizHome;
}

// Chi chiude la pagina a meta' quiz del giorno lo perde (come Wordle).
function controllaQuizInterrotto() {
  const s = statoQuiz(), oggi = oggiRoma();
  if (s.inCorso === oggi && !(s.oggi && s.oggi.data === oggi)) {
    s.serie = s.ultimo && giorniDa(s.ultimo, oggi) === 1 ? s.serie + 1 : 1;
    s.ultimo = oggi; s.giocati += 1;
    s.oggi = { data: oggi, numero: numeroQuiz(), giuste: 0, punti: 0, griglia: "⬛⬛⬛⬛⬛", secondi: 0 };
    delete s.inCorso; mem.set("quiz", s);
  }
}


// ================================================================ CLASSIFICA
function classificaAttiva() { const c = CFG.classifica || {}; return !!(c.url && c.chiave); }
async function rpc(nome, corpo) {
  const c = CFG.classifica, h = { "Content-Type": "application/json", apikey: c.chiave };
  if (c.chiave.startsWith("eyJ")) h.Authorization = "Bearer " + c.chiave;
  const r = await fetch(c.url.replace(/\/$/, "") + "/rest/v1/rpc/" + nome, { method: "POST", headers: h, body: JSON.stringify(corpo || {}) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
function idDispositivo() {
  let id = mem.get("dispositivo", null);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
    mem.set("dispositivo", id);
  }
  return id;
}
const MSG_CL = {
  ok: "🏆 Risultato registrato in classifica!",
  gia_giocato: "Il risultato di oggi era già in classifica.",
  nome_occupato: "⚠️ Questo nome è già usato da un altro telefono: il risultato non è entrato in classifica. Scegline un altro domani.",
  quiz_scaduto: "Il quiz è di ieri: non vale per la classifica.",
  nome_non_valido: "⚠️ Nome non valido (2-20 caratteri).",
  lega_non_valida: "⚠️ Codice lega non valido (2-20 caratteri).",
  punteggio_non_valido: "⚠️ Punteggio non accettato.",
};
async function inviaRisultato(ris, s) {
  const box = $("#esito-cl");
  if (!classificaAttiva()) return;
  if (!s.nick) { if (box) box.textContent = "Senza nome non entri in classifica: domani inseriscilo prima di giocare."; return; }
  try {
    const esito = await rpc("invia_risultato", { p_nick: s.nick, p_device: idDispositivo(), p_lega: s.lega || "", p_numero: ris.numero, p_giuste: ris.giuste, p_punti: ris.punti, p_secondi: ris.secondi });
    if (box) box.textContent = MSG_CL[esito] || esito;
  } catch (e) { if (box) box.textContent = "Classifica non raggiungibile in questo momento."; }
}

const CL = { mese: null, filtro: "tutti", turno: 0 };
function meseCorrente() { return oggiRoma().slice(0, 7); }
function spostaMese(m, d) { let [a, b] = m.split("-").map(Number); b += d; if (b < 1) { b = 12; a--; } if (b > 12) { b = 1; a++; } return `${a}-${String(b).padStart(2, "0")}`; }
function nomeMese(m) { const [a, b] = m.split("-").map(Number); const t = new Date(Date.UTC(a, b - 1, 15)).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }); return t.charAt(0).toUpperCase() + t.slice(1); }

async function mostraClassifica() {
  if (!CL.mese) CL.mese = meseCorrente();
  const s = statoQuiz(), corpo = $("#cl-corpo");
  $("#m-titolo").textContent = "🏆 " + nomeMese(CL.mese);
  $("#m-succ").disabled = CL.mese >= meseCorrente();
  $("#m-prec").disabled = CL.mese <= "2026-11";
  $("#cl-lega-btn").textContent = s.lega ? "Lega " + s.lega : "La mia lega";
  document.querySelectorAll("#cl-filtro .int").forEach(b => b.classList.toggle("attivo", b.dataset.filtro === CL.filtro));
  if (!classificaAttiva()) { corpo.innerHTML = `<p class="nessuno centro">La classifica online sta per arrivare. Intanto gioca il quiz: il nome che scegli sarà il tuo posto in classifica.</p>`; return; }
  if (CL.filtro === "lega" && !s.lega) { corpo.innerHTML = `<p class="nessuno centro">Inserisci un codice lega nella scheda Quiz (lo stesso per tutti i tuoi amici) e qui vedrai solo la vostra classifica.</p>`; return; }
  corpo.innerHTML = `<p class="attesa">Carico la classifica…</p>`;
  const turno = ++CL.turno;
  try {
    const righe = await rpc("classifica", { p_mese: CL.mese, p_lega: CL.filtro === "lega" ? s.lega : null });
    if (turno !== CL.turno) return; // e' arrivata una richiesta piu' recente
    if (!righe.length) { corpo.innerHTML = `<p class="nessuno centro">Nessun risultato ancora. Il primo posto è libero: gioca il quiz di oggi!</p>`; return; }
    const med = ["🥇", "🥈", "🥉"], io = (s.nick || "").toLowerCase();
    corpo.innerHTML = `<table class="tabella"><thead><tr><th>#</th><th>Nome</th><th class="n">Quiz</th><th class="n">Punti</th></tr></thead><tbody>${
      righe.map(r => `<tr class="${r.nome.toLowerCase() === io ? "io" : ""}"><td><span class="medaglia">${r.pos <= 3 ? med[r.pos - 1] : r.pos}</span></td>
        <td>${esc(r.nome)}${r.lega && CL.filtro === "tutti" ? `<span class="lega">${esc(r.lega)}</span>` : ""}</td>
        <td class="n">${r.giocati}</td><td class="n"><b>${r.punti}</b></td></tr>`).join("")}</tbody></table>`;
  } catch (e) { corpo.innerHTML = `<p class="nessuno centro">Classifica non raggiungibile in questo momento. Riprova tra poco.</p>`; }
}
function preparaClassifica() {
  $("#m-prec").onclick = () => { CL.mese = spostaMese(CL.mese, -1); mostraClassifica(); };
  $("#m-succ").onclick = () => { CL.mese = spostaMese(CL.mese, 1); mostraClassifica(); };
  document.querySelectorAll("#cl-filtro .int").forEach(b => b.onclick = () => { CL.filtro = b.dataset.filtro; mostraClassifica(); });
}

// ================================================================ AVVIO
function schede() {
  document.querySelectorAll(".scheda").forEach(b => b.onclick = () => {
    document.querySelectorAll(".scheda").forEach(x => x.classList.toggle("attiva", x === b));
    document.querySelectorAll(".vista").forEach(v => v.classList.toggle("attiva", v.id === "vista-" + b.dataset.vai));
    if (b.dataset.vai === "quiz" && $("#quiz-gioco").hidden) quizHome();
    if (b.dataset.vai === "classifica") mostraClassifica();
    window.scrollTo({ top: 0 });
  });
}
function pubblicita() {
  const p = CFG.pubblicita || {};
  if (p.attiva && p.html && !(CFG.pro && CFG.pro.attiva && mem.get("pro", false))) {
    const s = $("#spazio-pubblicita"); s.innerHTML = p.html; s.hidden = false;
  }
}

async function avvia() {
  schede(); pubblicita(); controllaQuizInterrotto(); preparaClassifica();
  try {
    const [pa, ro, me, ind, rig] = await Promise.all([carica("data/partite.json"), carica("data/rose.json").catch(() => ({})), carica("data/meta.json").catch(() => ({})),
      carica("data/indisponibili.json").catch(() => ({})), carica("data/rigoristi.json").catch(() => ({}))]);
    for (const [sq, nomi] of Object.entries(ind.giocatori || {})) nomi.forEach(n => INDISP.add(sq + "|" + n));
    RIGORISTI = rig.rigoristi || {};
    const oggi = oggiRoma();
    PARTITE = (pa.partite || []).filter(p => !p.data || p.data >= oggi);
    ROSE = ro.rose || {}; META = me;
    const agg = pa.aggiornato ? new Date(pa.aggiornato).toLocaleDateString("it-IT") : "";
    $("#info-agg").textContent = (agg ? `Ultimo aggiornamento partite: ${agg}. ` : "") + (INDISP.size ? `Indisponibili esclusi dall'Oracolo: ${INDISP.size} (aggiornati al ${new Date(ind.aggiornato).toLocaleDateString("it-IT")}).` : "");
  } catch (e) {
    $("#lista-partite").innerHTML = `<div class="nessuno">Non riesco a leggere le partite. Riprova tra poco.</div>`;
  }
  preparaOracolo(); aggiornaBottone();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}
avvia();
})();
