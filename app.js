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
const INFORTUNI_MEDI = 0.35;
const QUOTA_GOL_CON_ASSIST = 0.72;   // circa 7 gol su 10 hanno un assist
const PESI_ASSIST = { C: 3, A: 2, D: 1.3, P: 0.05 };         // infortuni a partita che costringono al cambio

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
    const marcatore = scegli(sq, PESI_GOL, m);
    let assist = null;
    if (!marcatore.generico && rnd() < QUOTA_GOL_CON_ASSIST) {
      const via = new Set(Object.keys(fuori).filter(n => fuori[n] <= valMin(m))); via.add(marcatore.n);
      const a = pescaGiocatore(sq, PESI_ASSIST, via);
      if (a && !a.generico && a.n !== marcatore.n) assist = a.n;
    }
    gol.push({ sq, n: marcatore.n, m, assist });
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
  if (p.gol.length) r.push("⚽ " + p.gol.map(g => `${g.n}${g.extra ? " (" + g.extra + ")" : ""}${g.assist ? " (👟 " + g.assist + ")" : ""} ${g.m}'`).join(", "));
  const gialli = p.cartellini.filter(c => c.tipo === "giallo"), rossi = p.cartellini.filter(c => c.tipo !== "giallo");
  if (gialli.length) r.push("🟨 " + gialli.map(c => c.n).join(", "));
  if (rossi.length) r.push("🟥 " + rossi.map(c => `${c.n} ${c.m}'`).join(", "));
  p.rigoriFalliti.forEach(x => r.push(x.esito === "parato" ? `🧤 ${x.portiere} para il rigore · ❌ ${x.n} lo sbaglia (${x.m}')` : `❌ ${x.n} sbaglia il rigore, ${x.esito} (${x.m}')`));
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
    $("#pannello-fanta").hidden = statoO.modo !== "fanta";
    if (statoO.modo === "fanta") disegnaPannelloFanta();
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
  } else if (statoO.modo === "fanta") {
    const ok = $("#fanta-a") && $("#fanta-a").value !== $("#fanta-b").value && statoO.giornate.length;
    b.disabled = !ok; b.textContent = !$("#fanta-a") ? "Carica prima le rose della lega" : ok ? "⚡ Interroga l'Oracolo" : "Scegli due squadre diverse";
  } else {
    const ok = $("#sel-casa").value && $("#sel-casa").value !== $("#sel-trasf").value;
    b.disabled = !ok; b.textContent = ok ? "🔮 Interroga l'Oracolo" : "Scegli due squadre diverse";
  }
}

let inCorso = false;
function interroga() {
  if (inCorso) return;
  let casa, trasf, lam;
  if (statoO.modo === "fanta") {
    const box = $("#responso"); box.hidden = false; inCorso = true;
    box.innerHTML = `<div class="sfera"></div><p class="attesa">L'Oracolo sta giocando tutta la giornata…</p>`;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => { const f = sfidaFanta(); if (f) mostraSfidaFanta(f); inCorso = false; }, 1800);
    return;
  }
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
  const fGol = g => ev(g.m, "⚽", esc(g.n) + (g.assist ? ` <span class="assist">(👟 ${esc(g.assist)})</span>` : "") + (g.extra ? ` <span class="tag">${g.extra === "rig." ? "su rigore" : "autogol"}</span>` : ""));
  const icona = { giallo: "🟨", rosso: "🟥", rosso2: "🟨🟥" };
  const fCart = c => ev(c.m, icona[c.tipo], esc(c.n) + (c.tipo === "rosso" ? ` <span class="tag rosso">rosso diretto</span>` : c.tipo === "rosso2" ? ` <span class="tag rosso">espulso</span>` : ""));
  // Come al fanta: il rigore parato vale per il portiere (colonna sua) e come errore per chi tira
  const rigoriVoci = [];
  p.rigoriFalliti.forEach(x => {
    rigoriVoci.push({ sq: x.sq, m: x.m, tipo: "sbagliato", n: x.n, esito: x.esito });
    if (x.esito === "parato") rigoriVoci.push({ sq: x.sqPortiere, m: x.m, tipo: "parato", n: x.portiere, tiratore: x.n });
  });
  const fRig = x => x.tipo === "parato"
    ? ev(x.m, "🧤", `${esc(x.n)} <b>para</b> il rigore <span class="tag">a ${esc(x.tiratore)}</span>`)
    : ev(x.m, "❌", `${esc(x.n)} sbaglia il rigore <span class="tag">${x.esito === "parato" ? "parato" : x.esito}</span>`);
  const fInf = x => ev(x.m, `<span class="croce">✚</span>`, `${esc(x.n)} <span class="tag">esce infortunato</span>`);
  const box = $("#responso");
  box.innerHTML = `
    <div class="tabellone"><div class="sq c">${esc(p.casa)}</div><div class="punteggio">${p.gh} - ${p.ga}</div><div class="sq">${esc(p.trasf)}</div></div>
    <p class="frase">"${esc(p.frase)}"</p>
    ${sezione("⚽ Marcatori", p.gol, fGol)}
    ${sezione("🟨 Cartellini", p.cartellini, fCart)}
    ${sezione("🎯 Rigori sbagliati e parati", rigoriVoci, fRig)}
    ${sezione("✚ Infortuni", p.infortuni, fInf)}
    ${!p.cartellini.length ? `<p class="nessuno centro">Partita correttissima: nessun cartellino.</p>` : ""}
    <div class="fila" style="margin-top:16px">
      <button class="bottone verde" id="cond-prof">📲 Condividi</button>
      <button class="bottone" id="di-nuovo">🔁 Chiedi di nuovo</button>
    </div>`;
  $("#cond-prof").onclick = () => condividi(testoCondivisione(p));
  $("#di-nuovo").onclick = interroga;
}


// ================================================================ SFIDA FANTA
// Rose importate dal file Excel di Leghe Fantacalcio (Rose -> Esporta). Restano
// salvate solo su questo telefono. Il file ha una colonna per squadra con
// accanto "costo"; i giocatori sono in ordine P, D, C, A; l'ultima riga e' "totale".
const FANTA_DEF = { soglia: 66, passo: 6, imbattuto: false };
const MODULI = ["3-4-3", "4-3-3", "3-5-2", "4-4-2", "4-5-1", "5-3-2", "5-4-1"];
const PROB_GIOCA = { 1: 0.2, 2: 0.45, 3: 0.7, 4: 0.88, 5: 0.95 };

function caricaLibreriaExcel() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((ok, ko) => {
    const sc = document.createElement("script");
    sc.src = "lib/xlsx.mini.min.js"; // SheetJS 0.18.5, licenza Apache-2.0
    sc.onload = ok; sc.onerror = () => ko(new Error("libreria"));
    document.head.appendChild(sc);
  });
}
function indiceListone() { // nome -> {sq, r, p} dal listone di Serie A
  const idx = {};
  for (const [sq, gioc] of Object.entries(ROSE)) for (const g of gioc) idx[g.n] = { sq, r: g.r, p: g.p || 2, n: g.n };
  return idx;
}
const normNome = x => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’'`]/g, "'").toLowerCase().trim();

async function importaRoseFanta(file) {
  await caricaLibreriaExcel();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const righe = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  // riga di intestazione: quella con piu' celle "costo"
  let hi = 0, best = 0;
  righe.slice(0, 10).forEach((r, i) => { const n = r.filter(c => normNome(c) === "costo").length; if (n > best) { best = n; hi = i; } });
  const testa = righe[hi] || [], colonne = [];
  testa.forEach((c, j) => { if (c && normNome(c) !== "costo" && (best === 0 || normNome(testa[j + 1]) === "costo")) colonne.push(j); });
  const idx = indiceListone(), perNorm = {};
  for (const n of Object.keys(idx)) perNorm[normNome(n)] = n;
  const squadre = {}; let trovati = 0, totali = 0; const mancanti = [];
  for (const j of colonne) {
    const nome = String(testa[j]).trim(), gioc = [];
    for (let i = hi + 1; i < righe.length; i++) {
      const v = righe[i][j]; if (v == null || v === "") continue;
      if (normNome(v) === "totale") break;
      totali++;
      const vero = perNorm[normNome(v)];
      if (vero) { trovati++; gioc.push(vero); } else { mancanti.push(`${v} (${nome})`); gioc.push("?" + String(v).trim()); }
    }
    if (gioc.length) squadre[nome] = gioc;
  }
  if (Object.keys(squadre).length < 2) throw new Error("formato");
  const lega = (file.name.match(/^(.+?)-rosters/i) || [, ""])[1].replace(/-/g, " ").trim();
  const dati = { lega: lega ? lega.replace(/\b\w/g, c => c.toUpperCase()) : "La mia lega", squadre, importato: new Date().toISOString(), trovati, totali, mancanti };
  mem.set("fanta", dati);
  return dati;
}

// Regole note per lega (si applicano da sole quando si carica il file di quella lega)
const REGOLE_LEGHE = { "serie f orco": { soglia: 66, passo: 5, imbattuto: true } };
function chiaveLega() { const d = mem.get("fanta", null); return d ? normNome(d.lega) : ""; }
function regoleFanta() {
  const k = chiaveLega();
  return Object.assign({}, FANTA_DEF, REGOLE_LEGHE[k] || {}, mem.get("fantaRegole:" + k, {}));
}
function testoRegole(r) {
  const g = [0, 1, 2, 3].map(i => r.soglia + i * r.passo).join(" · ");
  return `Gol a ${g}…${r.imbattuto ? " · portiere imbattuto +1" : ""}`;
}

function disegnaPannelloFanta() {
  const box = $("#pannello-fanta"), dati = mem.get("fanta", null), reg = regoleFanta();
  if (!dati) {
    box.innerHTML = `<div class="fanta-box">
      <b>Sfida la tua lega</b>
      <p class="piccolo">L'Oracolo simula la prossima giornata di Serie A e calcola i fantapunti di due squadre della tua lega.</p>
      <ol>
        <li>Da browser apri la tua lega su <b>leghe.fantacalcio.it</b></li>
        <li>Vai su <b>Rose</b> e scarica il file <b>Excel</b></li>
        <li>Torna qui e caricalo</li>
      </ol>
      <label class="bottone oro file-btn">📂 Carica il file delle rose<input type="file" id="file-fanta" accept=".xlsx,.xls"></label>
      <p class="piccolo">Il file resta solo sul tuo telefono: non viene inviato a nessuno.</p>
    </div>`;
  } else {
    const nomi = Object.keys(dati.squadre);
    const opz = sel => nomi.map((n, i) => `<option ${i === sel ? "selected" : ""}>${esc(n)}</option>`).join("");
    box.innerHTML = `<div class="fanta-box">
      <div class="piccolo">🏆 <b>${esc(dati.lega)}</b> · ${nomi.length} squadre ·
        <button class="link" id="fanta-cambia">carica un file nuovo</button></div>
      <div class="sfida" style="padding:10px 0 0;background:none">
        <label>Casa<select id="fanta-a">${opz(0)}</select></label><span class="vs">VS</span>
        <label>Trasferta<select id="fanta-b">${opz(1)}</select></label>
      </div>
      <details style="margin-top:8px"><summary class="piccolo">⚙️ Regole: <b id="riassunto-regole">${esc(testoRegole(reg))}</b> · cambia</summary>
        <div class="regole">
          <label>Primo gol a<input type="number" id="r-soglia" min="50" max="80" step="1" value="${reg.soglia}"></label>
          <label>Ogni gol in più<input type="number" id="r-passo" min="2" max="10" step="0.5" value="${reg.passo}"></label>
          <label class="spunta"><input type="checkbox" id="r-imb" ${reg.imbattuto ? "checked" : ""}> Portiere imbattuto +1</label>
        </div>
      </details>
      <button class="bottone" id="prof-stagione" style="width:100%;margin-top:10px">🔮 Profezie della stagione</button>
      ${dati.mancanti && dati.mancanti.length ? `<p class="piccolo">⚠️ ${dati.mancanti.length} giocatori non sono nel listone (ceduti o fuori lista) e non giocano: ${esc(dati.mancanti.slice(0, 6).join(", "))}${dati.mancanti.length > 6 ? "…" : ""}</p>` : ""}
    </div>`;
    $("#fanta-a").onchange = $("#fanta-b").onchange = aggiornaBottone;
    $("#prof-stagione").onclick = mostraProfezieStagione;
    $("#fanta-cambia").onclick = () => { mem.set("fanta", null); disegnaPannelloFanta(); aggiornaBottone(); };
    const salvaReg = () => { mem.set("fantaRegole:" + chiaveLega(), { soglia: +$("#r-soglia").value || 66, passo: +$("#r-passo").value || 6, imbattuto: $("#r-imb").checked }); $("#riassunto-regole").textContent = testoRegole(regoleFanta()); };
    ["#r-soglia", "#r-passo", "#r-imb"].forEach(id => $(id).onchange = salvaReg);
  }
  const f = $("#file-fanta");
  if (f) f.onchange = async () => {
    if (!f.files[0]) return;
    toast("Leggo il file…");
    try { const d = await importaRoseFanta(f.files[0]); toast(`Caricate ${Object.keys(d.squadre).length} squadre`); }
    catch (e) { toast(e.message === "libreria" ? "Serve la connessione per leggere il file" : "File non riconosciuto: usa l'Excel delle rose di Leghe Fantacalcio"); }
    disegnaPannelloFanta(); aggiornaBottone();
  };
}

// Simula tutta la giornata e raccoglie cosa fa ogni giocatore
function simulaGiornata() {
  const g = statoO.giornate[0], partite = PARTITE.filter(p => p.giornata === g);
  const ev = {}, squadraReale = {};
  const E = n => (ev[n] = ev[n] || { gol: 0, rig: 0, ass: 0, amm: 0, esp: 0, aut: 0, rigSb: 0, rigPar: 0, evento: false });
  for (const p of partite) {
    const pr = profezia(p.casa, p.trasferta, { lh: p.lh, la: p.la, rho: p.rho || 0 });
    squadraReale[p.casa] = { fatti: pr.gh, subiti: pr.ga, esito: Math.sign(pr.gh - pr.ga), partita: `${p.casa} ${pr.gh}-${pr.ga} ${p.trasferta}` };
    squadraReale[p.trasferta] = { fatti: pr.ga, subiti: pr.gh, esito: Math.sign(pr.ga - pr.gh), partita: squadraReale[p.casa].partita };
    pr.gol.forEach(x => {
      if (x.extra === "aut.") { E(x.n).aut++; E(x.n).evento = true; return; }
      const e = E(x.n); e.gol++; e.evento = true; if (x.extra === "rig.") e.rig++;
      if (x.assist) { E(x.assist).ass++; E(x.assist).evento = true; }
    });
    pr.cartellini.forEach(c => { const e = E(c.n); e.evento = true; if (c.tipo === "giallo") e.amm++; else { e.esp++; if (c.tipo === "rosso2") e.amm = 0; } });
    pr.rigoriFalliti.forEach(x => { E(x.n).rigSb++; E(x.n).evento = true; if (x.portiere) { E(x.portiere).rigPar++; E(x.portiere).evento = true; } });
    pr.infortuni.forEach(x => { E(x.n).evento = true; });
  }
  return { giornata: g, ev, squadraReale };
}

function arrotonda05(x) { return Math.round(x * 2) / 2; }
function fantaVoto(info, sim, reg) {
  const r = sim.squadraReale[info.sq]; if (!r) return null; // la sua squadra non gioca
  const e = sim.ev[info.n] || { gol: 0, rig: 0, ass: 0, amm: 0, esp: 0, aut: 0, rigSb: 0, rigPar: 0, evento: false };
  // gioca? chi ha fatto qualcosa nella simulazione gioca di sicuro; il portiere titolare e' il piu' quotato disponibile
  let gioca = e.evento;
  if (!gioca) {
    if (info.r === "P") { const tit = portiereDi(info.sq); gioca = tit.n === info.n; }
    else gioca = rnd() < (PROB_GIOCA[info.p] || 0.5);
  }
  if (!gioca) return null;
  let v = 6 + r.esito * 0.25 + pesca([-1, -0.5, 0, 0.5, 1], [1, 3, 4, 3, 1]);
  if (info.r === "P") v = 6.5 - 0.5 * r.subiti + pesca([-0.5, 0, 0.5], [1, 2, 1]);
  v += Math.min(1, e.gol * 0.5) + (e.ass ? 0.25 : 0) - (e.esp ? 1 : 0);
  v = Math.min(9, Math.max(3.5, arrotonda05(v)));
  const bonus = [], add = (pt, testo) => { if (pt) bonus.push({ pt, testo }); };
  add(3 * e.gol, e.gol ? `⚽×${e.gol}` : ""); add(e.ass, e.ass ? `👟×${e.ass}` : "");
  add(-0.5 * e.amm, e.amm ? "🟨" : ""); add(-1 * e.esp, e.esp ? "🟥" : "");
  add(-2 * e.aut, e.aut ? "autogol" : ""); add(-3 * e.rigSb, e.rigSb ? "❌ rig." : ""); add(3 * e.rigPar, e.rigPar ? "🧤 rig." : "");
  if (info.r === "P") { add(-r.subiti, r.subiti ? `-${r.subiti} gol subiti` : ""); if (reg.imbattuto && r.subiti === 0) add(1, "imbattuto"); }
  const fv = v + bonus.reduce((a, b) => a + b.pt, 0);
  return { voto: v, fv, bonus };
}

function schieraFanta(nomi, idx) {
  // giocatori disponibili (nel listone e non indisponibili), con i loro dati
  const disp = nomi.map(n => idx[n]).filter(x => x && !INDISP.has(x.sq + "|" + x.n));
  const per = { P: [], D: [], C: [], A: [] };
  disp.forEach(x => per[x.r] && per[x.r].push(x));
  Object.values(per).forEach(l => l.sort((a, b) => b.p - a.p));
  let meglio = null;
  for (const m of MODULI) {
    const [d, c, a] = m.split("-").map(Number);
    if (per.P.length < 1 || per.D.length < d || per.C.length < c || per.A.length < a) continue;
    const tit = [per.P[0], ...per.D.slice(0, d), ...per.C.slice(0, c), ...per.A.slice(0, a)];
    const forza = tit.reduce((s, x) => s + x.p, 0);
    if (!meglio || forza > meglio.forza) meglio = { modulo: m, tit, forza };
  }
  if (!meglio) return null;
  const panchina = disp.filter(x => !meglio.tit.includes(x));
  return { modulo: meglio.modulo, titolari: meglio.tit, panchina };
}

function giocaSquadraFanta(nome, nomi, sim, idx, reg) {
  const sch = schieraFanta(nomi, idx);
  if (!sch) return { nome, errore: true };
  const panca = sch.panchina.map(x => ({ x, usato: false }));
  let cambi = 0;
  const righe = sch.titolari.map(x => {
    const res = fantaVoto(x, sim, reg);
    if (res) return { x, res };
    // senza voto: entra il primo della panchina dello stesso ruolo che ha giocato (massimo 3 cambi)
    if (cambi < 3) for (const b of panca) {
      if (b.usato || b.x.r !== x.r) continue;
      const rb = fantaVoto(b.x, sim, reg); b.usato = true;
      if (rb) { cambi++; return { x: b.x, res: rb, entra: true, perChi: x.n }; }
    }
    return { x, res: null };
  });
  const tot = righe.reduce((s, r) => s + (r.res ? r.res.fv : 0), 0);
  const golFanta = tot < reg.soglia ? 0 : 1 + Math.floor((tot - reg.soglia) / reg.passo);
  return { nome, modulo: sch.modulo, righe, tot: Math.round(tot * 2) / 2, gol: golFanta };
}

function sfidaFanta() {
  const dati = mem.get("fanta", null); if (!dati) return;
  const a = $("#fanta-a").value, b = $("#fanta-b").value, reg = regoleFanta();
  const idx = indiceListone(), sim = simulaGiornata();
  const A = giocaSquadraFanta(a, dati.squadre[a], sim, idx, reg), B = giocaSquadraFanta(b, dati.squadre[b], sim, idx, reg);
  return { A, B, giornata: sim.giornata, lega: dati.lega, regole: reg };
}

function mostraSfidaFanta(f) {
  const col = S => S.errore ? `<div class="colonna"><h4>${esc(S.nome)}</h4><div class="nessuno">Rosa incompleta</div></div>` :
    `<div class="colonna formazione"><h4>${esc(S.nome)} · ${S.modulo}</h4>${S.righe.map(r => r.res
      ? `<div class="gioc ${r.entra ? "entra" : ""}"><span class="r">${r.x.r}</span><span>${esc(r.x.n)}</span><span class="fv">${r.res.fv}</span>
         <span class="det">${r.entra ? "↑ per " + esc(r.perChi) + " · " : ""}voto ${r.res.voto}${r.res.bonus.length ? " · " + r.res.bonus.map(b => b.testo).join(" ") : ""}</span></div>`
      : `<div class="gioc sv"><span class="r">${r.x.r}</span><span>${esc(r.x.n)}</span><span class="fv">s.v.</span></div>`).join("")}</div>`;
  const frase = f.A.gol === f.B.gol ? "Pareggio annunciato: nessuno esulta, tutti recriminano." :
    `${f.A.gol > f.B.gol ? f.A.nome : f.B.nome}: la sfera ha scelto te.`;
  const box = $("#responso");
  box.innerHTML = `
    <div class="piccolo centro">⚡ ${esc(f.lega)} · ${f.giornata}ª giornata simulata<br>${esc(testoRegole(f.regole))}</div>
    <div class="tabellone"><div class="sq c">${esc(f.A.nome)}</div><div class="punteggio">${f.A.gol ?? "-"} - ${f.B.gol ?? "-"}</div><div class="sq">${esc(f.B.nome)}</div></div>
    <div class="fanta-tot"><span><b>${f.A.tot ?? "-"}</b> punti</span><span></span><span><b>${f.B.tot ?? "-"}</b> punti</span></div>
    <p class="frase">"${esc(frase)}"</p>
    <div class="eventi">${col(f.A)}${col(f.B)}</div>
    <div class="fila" style="margin-top:16px">
      <button class="bottone verde" id="cond-prof">📲 Condividi</button>
      <button class="bottone" id="di-nuovo">🔁 Chiedi di nuovo</button>
    </div>`;
  $("#cond-prof").onclick = () => condividi(testoFanta(f));
  $("#di-nuovo").onclick = interroga;
}
function testoFanta(f) {
  const top = S => (S.righe || []).filter(r => r.res).sort((a, b) => b.res.fv - a.res.fv).slice(0, 3).map(r => `${r.x.n} ${r.res.fv}`).join(", ");
  return [`🔮 L'Oracolo di ErCaciotta90 – ${f.lega}, ${f.giornata}ª giornata:`, `${f.A.nome} ${f.A.gol}-${f.B.gol} ${f.B.nome}`,
    `(${f.A.tot} a ${f.B.tot})`, `⭐ ${f.A.nome}: ${top(f.A)}`, `⭐ ${f.B.nome}: ${top(f.B)}`, "", "Interroga anche tu l'Oracolo: " + urlSito()].join("\n");
}


// ---------- Profezie di stagione: una sola per lega, uguale per tutti
function hashTesto(t) { let h = 2166136261; for (const c of t) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function forzaStagione(nomi, idx) {
  const per = { P: [], D: [], C: [], A: [] };
  nomi.map(n => idx[n]).filter(Boolean).forEach(x => per[x.r] && per[x.r].push(x.p));
  Object.values(per).forEach(l => l.sort((a, b) => b - a));
  const somma = (l, k) => l.slice(0, k).reduce((a, b) => a + b, 0);
  const xi = somma(per.P, 1) + somma(per.D, 3) + somma(per.C, 4) + somma(per.A, 3); // 3-4-3
  const tutti = Object.values(per).flat().reduce((a, b) => a + b, 0);
  return xi + 0.15 * (tutti - xi); // conta anche la panchina, ma meno
}
const DOMANDE_STAGIONE = [
  { id: "scudetto", ico: "🏆", q: "Chi vincerà il campionato 2026/27?", tipo: "forte", T: 2.5 },
  { id: "coppa", ico: "🥇", q: "Chi alzerà la Coppa?", tipo: "forte", T: 6 },
  { id: "ultimo", ico: "🪣", q: "Chi arriverà ultimo?", tipo: "debole", T: 2.5 },
  { id: "fortuna", ico: "🍀", q: "Chi avrà più fortuna?", tipo: "caso" },
  { id: "sfortuna", ico: "🐈‍⬛", q: "Chi avrà più sfortuna?", tipo: "caso" },
  { id: "rimonta", ico: "🚀", q: "La rimonta più incredibile?", tipo: "debole", T: 8 },
  { id: "formazioni", ico: "😴", q: "Chi dimenticherà più formazioni?", tipo: "caso" },
  { id: "bomber", ico: "⚽", q: "Il bomber della lega?", tipo: "giocatore", ruoli: ["A"], pot: 2.5 },
  { id: "flop", ico: "💸", q: "Il flop della stagione?", tipo: "giocatore", ruoli: ["A", "C"], pot: 1.5, soloBig: true },
  { id: "sorpresa", ico: "✨", q: "La sorpresa dell'anno?", tipo: "giocatore", ruoli: ["C", "A", "D"], pot: -1, soloPiccoli: true },
];
function profezieStagione(dati) {
  const idx = indiceListone(), nomi = Object.keys(dati.squadre).sort();
  const seme = hashTesto(dati.lega + "|" + nomi.join("|") + "|2026-27");
  const r = rngSeed(seme), forze = nomi.map(n => forzaStagione(dati.squadre[n], idx));
  const media = forze.reduce((a, b) => a + b, 0) / forze.length, usati = new Set();
  const out = [];
  for (const d of DOMANDE_STAGIONE) {
    let risposta, dettaglio = "";
    if (d.tipo === "giocatore") {
      const cand = [];
      nomi.forEach(sq => dati.squadre[sq].forEach(n => { const x = idx[n]; if (x && d.ruoli.includes(x.r) && (!d.soloBig || x.p >= 4) && (!d.soloPiccoli || x.p <= 2)) cand.push({ x, sq }); }));
      if (!cand.length) continue;
      const scelto = pesca(cand, cand.map(c => Math.pow(c.x.p, d.pot)), r);
      risposta = scelto.x.n; dettaglio = scelto.sq;
    } else {
      // ogni squadra riceve una sola profezia (la Coppa puo' andare anche a chi vince lo scudetto)
      let libere = nomi.map((n, i) => ({ n, f: forze[i] })).filter(c => d.id === "coppa" || !usati.has(c.n));
      if (!libere.length) libere = nomi.map((n, i) => ({ n, f: forze[i] }));
      const pesi = libere.map(c => d.tipo === "caso" ? 1 : Math.exp((d.tipo === "forte" ? 1 : -1) * (c.f - media) / d.T));
      risposta = pesca(libere, pesi, r).n;
      if (d.id !== "coppa") usati.add(risposta);
    }
    out.push({ ...d, risposta, dettaglio });
  }
  return out;
}
function mostraProfezieStagione() {
  const dati = mem.get("fanta", null); if (!dati) return;
  const lista = profezieStagione(dati), box = $("#responso"), svelate = new Set(mem.get("svelate:" + dati.lega, []));
  box.hidden = false;
  const voce = (p, i) => `<div class="profezia ${svelate.has(p.id) ? "aperta" : ""}" data-i="${i}">
      <div class="pq">${p.ico} ${esc(p.q)}</div>
      <div class="pr">${svelate.has(p.id) ? `<b>${esc(p.risposta)}</b>${p.dettaglio ? ` <span class="tag">${esc(p.dettaglio)}</span>` : ""}` : `<button class="bottone svela" data-i="${i}">🔮 Svela</button>`}</div></div>`;
  box.innerHTML = `<div class="piccolo centro">⚡ ${esc(dati.lega)} · profezie ufficiali 2026/27</div>
    <p class="frase">"Il destino della lega è scritto una volta sola. Uguale per tutti, senza appello."</p>
    <div class="profezie">${lista.map(voce).join("")}</div>
    <div class="fila" style="margin-top:14px">
      <button class="bottone oro" id="svela-tutto">✨ Svela tutto</button>
      <button class="bottone verde" id="cond-stag">📲 Condividi</button>
    </div>`;
  const salva = () => mem.set("svelate:" + dati.lega, [...svelate]);
  box.querySelectorAll(".svela").forEach(b => b.onclick = () => { svelate.add(lista[+b.dataset.i].id); salva(); mostraProfezieStagione(); });
  $("#svela-tutto").onclick = () => { lista.forEach(p => svelate.add(p.id)); salva(); mostraProfezieStagione(); };
  $("#cond-stag").onclick = () => {
    const vis = lista.filter(p => svelate.has(p.id));
    if (!vis.length) { toast("Svela almeno una profezia"); return; }
    condividi([`🔮 L'Oracolo di ErCaciotta90 ha parlato – ${dati.lega} 2026/27:`, ...vis.map(p => `${p.ico} ${p.q} ${p.risposta}${p.dettaglio ? " (" + p.dettaglio + ")" : ""}`), "", "Scopri il destino della tua lega: " + urlSito()].join("\n"));
  };
  box.scrollIntoView({ behavior: "smooth", block: "start" });
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
