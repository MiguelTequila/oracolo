# 🔮 L'Oracolo del Campionato

Sito gratuito di intrattenimento: l'Oracolo "svela" risultato, marcatori e ammonizioni delle prossime partite di Serie A, più il Quiz del giorno da condividere con la lega.

## Come funziona

- **Partite e gol attesi** arrivano dal `simulatore-calcio-pro`, letti dal suo file pubblico `data/fixtures_processed.json`. A ogni clic l'Oracolo pesca un risultato dalla distribuzione di Poisson (con correzione Dixon-Coles) di quella partita. La favorita vince più spesso, ma le sorprese escono.
- **Rose**: le scarica il workflow una volta a settimana da Wikipedia (oppure da Football-Data.org, se nel repo aggiungi il secret `FDKEY`). Se una squadra esce con meno di 15 giocatori, si tiene la rosa precedente.
- **Marcatori**: pesati per ruolo (attaccanti 6, centrocampisti 2,4, difensori 0,7). **Gialli**: in media 4,3 a partita, più spesso a difensori e mediani. Il secondo giallo diventa rosso.
- **Quiz del giorno**: 5 domande uguali per tutti (una per livello), 15 secondi l'una, una sola partita al giorno. Il risultato si condivide a quadratini, stile Wordle. La **modalità Leggenda** si sblocca dopo 3 quiz.

## File

| File | Cosa contiene |
|---|---|
| `index.html`, `style.css`, `app.js` | il sito |
| `domande.js` | la banca domande del quiz: per aggiungerne una, copia una riga e cambiala |
| `config.js` | interruttori di pubblicità, Pro e timer (tutto spento di proposito) |
| `data/partite.json`, `data/rose.json` | dati, aggiornati dal workflow (non toccarli a mano) |
| `scripts/aggiorna_dati.py` | lo script che aggiorna i dati |
| `.github/workflows/aggiorna-dati.yml` | il workflow "Aggiorna dati Oracolo" |
| `manifest.webmanifest`, `sw.js`, `icons/` | servono a installare il sito sul telefono come un'app |

## Workflow "Aggiorna dati Oracolo"

- Parte da solo ogni giorno alle 18:40 ora di Roma, dopo il giro del simulatore-pro.
- **Non usa The Odds API: non consuma crediti.** Puoi lanciarlo a mano quando vuoi da Actions → Aggiorna dati Oracolo → Run workflow.
- Dopo il mercato di gennaio lancialo a mano con la spunta **"Riscarica subito le rose"**.

## Accendere la pubblicità (più avanti)

Prima servono un dominio tuo, un pubblico stabile e il via libera di commercialista e ufficio del personale. Poi in `config.js` imposti `pubblicita.attiva: true` e incolli il codice del banner in `html`. Un banner solo, in fondo: niente popup a tempo.

## Avvertenze

Sito amatoriale, non affiliato alla Lega Serie A, alla FIGC o ai club. Niente quote, niente link a bookmaker, niente loghi dei club.
