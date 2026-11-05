"""Aggiorna i dati dell'Oracolo del Campionato.

1. PARTITE: legge le prossime partite di Serie A gia' calcolate dal
   simulatore-calcio-pro (file pubblico data/fixtures_processed.json) e ne
   tiene solo quello che serve all'Oracolo: squadre, data, giornata e i gol
   attesi (lambda) del modello. Nessuna chiave API necessaria.

2. ROSE: una volta a settimana (o se mancano) scarica le rose delle 20 squadre.
   - se nel repo c'e' il secret FDKEY prova prima Football-Data.org;
   - altrimenti (o se Football-Data non da' le rose) le legge da Wikipedia.
   Se una squadra esce con meno di 15 giocatori si tiene la rosa precedente:
   meglio una rosa vecchia di una vuota.

Uso: python scripts/aggiorna_dati.py [--forza-rose]
"""
import json, os, re, sys, time
from datetime import datetime, timezone, timedelta

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
FIXTURES_URL = ("https://raw.githubusercontent.com/MiguelTequila/"
                "simulatore-calcio-pro/main/data/fixtures_processed.json")
UA = {"User-Agent": "OracoloDelCampionato/1.0 (sito amatoriale; github.com/MiguelTequila)"}

# Nome Football-Data -> nome breve mostrato nel sito -> pagina Wikipedia (en)
SQUADRE = {
    "FC Internazionale Milano": ("Inter", "Inter Milan"),
    "AC Milan": ("Milan", "AC Milan"),
    "Juventus FC": ("Juventus", "Juventus FC"),
    "SSC Napoli": ("Napoli", "SSC Napoli"),
    "AS Roma": ("Roma", "AS Roma"),
    "SS Lazio": ("Lazio", "SS Lazio"),
    "Atalanta BC": ("Atalanta", "Atalanta BC"),
    "Bologna FC 1909": ("Bologna", "Bologna FC 1909"),
    "ACF Fiorentina": ("Fiorentina", "ACF Fiorentina"),
    "Torino FC": ("Torino", "Torino FC"),
    "Genoa CFC": ("Genoa", "Genoa CFC"),
    "Cagliari Calcio": ("Cagliari", "Cagliari Calcio"),
    "US Lecce": ("Lecce", "US Lecce"),
    "Udinese Calcio": ("Udinese", "Udinese Calcio"),
    "Parma Calcio 1913": ("Parma", "Parma Calcio 1913"),
    "Como 1907": ("Como", "Como 1907"),
    "US Sassuolo Calcio": ("Sassuolo", "US Sassuolo Calcio"),
    "Frosinone Calcio": ("Frosinone", "Frosinone Calcio"),
    "Venezia FC": ("Venezia", "Venezia FC"),
    "AC Monza": ("Monza", "AC Monza"),
}


def breve(nome_fd):
    if nome_fd in SQUADRE:
        return SQUADRE[nome_fd][0]
    # squadra nuova non in tabella: ripulisce il nome
    n = re.sub(r"\b(FC|AC|AS|SS|SSC|US|ACF|BC|CFC|Calcio|\d{4})\b", "", nome_fd)
    return re.sub(r"\s+", " ", n).strip() or nome_fd


def carica(nome, default):
    p = os.path.join(DATA, nome)
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def salva(nome, obj):
    p = os.path.join(DATA, nome)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


# ------------------------------------------------------------------ PARTITE
def aggiorna_partite():
    r = requests.get(FIXTURES_URL, headers=UA, timeout=30)
    r.raise_for_status()
    src = r.json()
    sa = (src.get("competitions") or {}).get("SA") or {}
    out = []
    for f in sa.get("fixtures", []):
        p = f.get("prediction") or {}
        lh, la = p.get("lambdaH"), p.get("lambdaA")
        if not lh or not la:
            continue
        hs, as_ = f.get("homeStats") or {}, f.get("awayStats") or {}
        out.append({
            "id": f.get("id"), "data": f.get("date"), "ora": f.get("time"),
            "giornata": f.get("matchday"),
            "casa": breve(f.get("homeTeam", "")), "trasferta": breve(f.get("awayTeam", "")),
            "lh": round(lh, 3), "la": round(la, 3), "rho": p.get("rho", 0) or 0,
            "statCasa": {"gf": hs.get("gf_pg"), "gs": hs.get("ga_pg"), "forma": hs.get("form")},
            "statTrasf": {"gf": as_.get("gf_pg"), "gs": as_.get("ga_pg"), "forma": as_.get("form")},
        })
    out.sort(key=lambda x: (x["data"] or "", x["ora"] or ""))
    if out:
        salva("partite.json", {"aggiornato": src.get("updated"), "partite": out})
    print(f"Partite: {len(out)}")
    return len(out)


# ------------------------------------------------------------------ ROSE
def ruolo_fd(pos):
    p = (pos or "").lower()
    if "goal" in p:
        return "P"
    if "def" in p or "back" in p:
        return "D"
    if "mid" in p:
        return "C"
    if any(k in p for k in ("off", "forw", "wing", "strik", "attack")):
        return "A"
    return None


def rose_football_data():
    key = os.environ.get("FDKEY", "").strip()
    if not key:
        return {}
    try:
        r = requests.get("https://api.football-data.org/v4/competitions/SA/teams",
                         headers={"X-Auth-Token": key}, timeout=30)
        r.raise_for_status()
    except Exception as e:
        print(f"Football-Data non disponibile: {e}")
        return {}
    rose = {}
    for t in r.json().get("teams", []):
        gioc = []
        for p in t.get("squad") or []:
            ru = ruolo_fd(p.get("position"))
            if ru and p.get("name"):
                gioc.append({"n": p["name"], "r": ru})
        if gioc:
            rose[breve(t.get("name", ""))] = gioc
    print(f"Football-Data: rose per {len(rose)} squadre")
    return rose


def _template_dopo(testo, inizio):
    """Restituisce il template {{...}} che parte da 'inizio' (graffe bilanciate)."""
    depth, i = 0, inizio
    while i < len(testo) - 1:
        if testo[i:i + 2] == "{{":
            depth += 1; i += 2; continue
        if testo[i:i + 2] == "}}":
            depth -= 1; i += 2
            if depth == 0:
                return testo[inizio:i]
            continue
        i += 1
    return testo[inizio:]


def _dividi_parametri(corpo):
    """Divide 'a=1|b=[[x|y]]|c={{t|z}}' sui | di primo livello."""
    parti, cur, d_br, d_cu, i = [], "", 0, 0, 0
    while i < len(corpo):
        two = corpo[i:i + 2]
        if two == "[[": d_br += 1; cur += two; i += 2; continue
        if two == "]]": d_br -= 1; cur += two; i += 2; continue
        if two == "{{": d_cu += 1; cur += two; i += 2; continue
        if two == "}}": d_cu -= 1; cur += two; i += 2; continue
        if corpo[i] == "|" and d_br == 0 and d_cu == 0:
            parti.append(cur); cur = ""
        else:
            cur += corpo[i]
        i += 1
    parti.append(cur)
    return parti


def _pulisci_nome(v):
    v = v.strip()
    m = re.match(r"\{\{\s*sortname\s*\|([^|}]*)\|([^|}]*)", v, re.I)
    if m:
        return f"{m.group(1).strip()} {m.group(2).strip()}".strip()
    m = re.search(r"\[\[([^\]]+)\]\]", v)
    if m:
        v = m.group(1).split("|")[-1]
    v = re.sub(r"\{\{.*?\}\}", "", v)
    v = re.sub(r"<[^>]+>|'''?|\(footballer.*?\)", "", v)
    return re.sub(r"\s+", " ", v).strip()


RUOLO_WIKI = {"GK": "P", "DF": "D", "MF": "C", "FW": "A"}


def estrai_rosa_wikitext(testo):
    """Prende SOLO il primo blocco {{Fs start}}...{{Fs end}} (la prima squadra):
    i blocchi successivi sono prestiti, Primavera, Under 23, Next Gen."""
    low = re.sub(r"\{\{\s+", "{{", testo.lower())
    testo = re.sub(r"\{\{\s+", "{{", testo)
    inizi = [low.find(t) for t in ("{{fs start", "{{football squad start", "{{fs2 start")]
    inizi = [i for i in inizi if i >= 0]
    if not inizi:
        inizi = [i for i in (low.find(t) for t in ("{{fs player", "{{football squad player", "{{fs2 player")) if i >= 0]
    if not inizi:
        return []
    a = min(inizi)
    fini = [i for i in (low.find(t, a) for t in ("{{fs end", "{{football squad end", "{{fs2 end")) if i > 0]
    blocco = testo[a:min(fini) if fini else len(testo)]
    gioc = []
    for m in re.finditer(r"\{\{\s*(fs2? player|football squad player2?)\s*\|", blocco, re.I):
        tpl = _template_dopo(blocco, m.start())[2:-2]
        par = {}
        for p in _dividi_parametri(tpl)[1:]:
            if "=" in p:
                k, v = p.split("=", 1)
                par[k.strip().lower()] = v
        ru = RUOLO_WIKI.get((par.get("pos") or "").strip().upper())
        nome = _pulisci_nome(par.get("name", ""))
        if ru and nome:
            gioc.append({"n": nome, "r": ru})
    return gioc


DIAGNOSTICA = {}


def rose_wikipedia():
    rose = {}
    for _, (nome, pagina) in SQUADRE.items():
        try:
            r = requests.get("https://en.wikipedia.org/w/api.php", headers=UA, timeout=30, params={
                "action": "parse", "page": pagina, "prop": "wikitext",
                "format": "json", "formatversion": 2, "redirects": 1})
            r.raise_for_status()
            gioc = estrai_rosa_wikitext(r.json()["parse"]["wikitext"])
            rose[nome] = gioc
            DIAGNOSTICA[nome] = len(gioc)
            print(f"  Wikipedia {nome}: {len(gioc)} giocatori")
        except Exception as e:
            DIAGNOSTICA[nome] = f"errore: {e}"[:200]
            print(f"  Wikipedia {nome}: errore {e}")
        time.sleep(1)
    return rose


def aggiorna_rose(forza=False):
    vecchie = carica("rose.json", {"aggiornato": None, "fonte": None, "rose": {}})
    ultimo = vecchie.get("aggiornato")
    if not forza and ultimo and vecchie.get("rose"):
        try:
            if datetime.now(timezone.utc) - datetime.fromisoformat(ultimo) < timedelta(days=6):
                print("Rose aggiornate da meno di 6 giorni: salto.")
                return
        except ValueError:
            pass
    nuove, fonte = rose_football_data(), "Football-Data.org"
    if sum(1 for g in nuove.values() if len(g) >= 15) < 18:
        nuove, fonte = rose_wikipedia(), "Wikipedia"
    finali = dict(vecchie.get("rose") or {})
    for sq, gioc in nuove.items():
        if len(gioc) >= 15:
            finali[sq] = gioc
        else:
            print(f"  {sq}: rosa troppo corta ({len(gioc)}), tengo la precedente")
    # Rose inserite a mano (data/rose_manuali.json): vincono sempre su quelle scaricate
    manuali = carica("rose_manuali.json", {})
    for sq, gioc in manuali.items():
        if isinstance(gioc, list) and gioc:
            finali[sq] = gioc
            print(f"  {sq}: uso la rosa manuale ({len(gioc)} giocatori)")
    salva("rose.json", {"aggiornato": datetime.now(timezone.utc).isoformat(),
                        "fonte": fonte, "rose": finali})
    print(f"Rose salvate: {len(finali)} squadre (fonte {fonte})")


if __name__ == "__main__":
    ok = True
    try:
        aggiorna_partite()
    except Exception as e:
        print(f"[!] Partite non aggiornate: {e}"); ok = False
    try:
        aggiorna_rose(forza="--forza-rose" in sys.argv)
    except Exception as e:
        print(f"[!] Rose non aggiornate: {e}")
    salva("meta.json", {"ultimoGiro": datetime.now(timezone.utc).isoformat(), "roseLette": DIAGNOSTICA})
    sys.exit(0 if ok else 1)
