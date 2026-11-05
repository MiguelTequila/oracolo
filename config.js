// Impostazioni del sito. Tutto spento di proposito: si accende piu' avanti.
window.CONFIG = {
  // Pubblicita': lasciare false finche' non c'e' un dominio proprio e un
  // pubblico stabile. Quando si attiva, in "html" va il codice del banner
  // (uno solo, discreto, in fondo alla pagina: niente popup a tempo).
  pubblicita: { attiva: false, html: "" },

  // Versione Pro (senza pubblicita', statistiche personali): lasciare false
  // fino al via libera di commercialista e ufficio del personale.
  pro: { attiva: false },

  // Classifica live (Supabase). Si riempie dopo aver creato il progetto:
  // url = "Project URL", chiave = "anon public" oppure "publishable" key.
  // La chiave e' pubblica per natura: puo' stare qui.
  classifica: { url: "https://ccesmmlpjpcdeamhrebs.supabase.co", chiave: "sb_publishable_Nm5W7mUvB9WZQvzlvAMpLA_5poPg2ws" },

  // Secondi a disposizione per ogni domanda
  secondiQuiz: 15,
  secondiLeggenda: 12,
  // Quiz del giorno da completare per sbloccare la modalita' Leggenda
  sbloccoLeggenda: 3,
};
