-- ============================================================
-- Classifica del Quiz dell'Oracolo — da incollare UNA volta in
-- Supabase > SQL Editor > New query > Run
-- ============================================================
-- Le tabelle non sono leggibili né scrivibili direttamente dal sito:
-- si passa SOLO dalle due funzioni qui sotto, che fanno i controlli.

create table if not exists public.giocatori (
  nick    text primary key,                 -- nome in minuscolo (chiave)
  nome    text not null,                    -- nome come l'ha scritto
  device  uuid not null,                    -- il telefono che ha "preso" il nome
  lega    text,                             -- codice lega facoltativo
  creato  timestamptz not null default now()
);

create table if not exists public.risultati (
  id      bigserial primary key,
  nick    text not null references public.giocatori(nick),
  numero  int  not null,                    -- numero del quiz del giorno
  giorno  date not null,
  giuste  int  not null check (giuste between 0 and 5),
  punti   int  not null check (punti between 0 and 1250),
  secondi int  not null check (secondi between 0 and 300),
  creato  timestamptz not null default now(),
  unique (nick, numero)                     -- un solo risultato al giorno a testa
);
create index if not exists risultati_giorno on public.risultati (giorno);

alter table public.giocatori enable row level security;
alter table public.risultati enable row level security;
-- (nessuna policy: accesso diretto alle tabelle negato a tutti)

-- ------------------------------------------------------------
-- Invio del risultato a fine quiz
-- ------------------------------------------------------------
create or replace function public.invia_risultato(
  p_nick text, p_device uuid, p_lega text,
  p_numero int, p_giuste int, p_punti int, p_secondi int
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_num int  := (v_oggi - date '2026-11-01') + 1;
  v_nome text := regexp_replace(trim(coalesce(p_nick, '')), '\s+', ' ', 'g');
  v_chiave text := lower(v_nome);
  v_lega text := nullif(upper(regexp_replace(trim(coalesce(p_lega, '')), '\s+', '', 'g')), '');
  g record;
  inseriti int;
begin
  if p_numero is distinct from v_num then return 'quiz_scaduto'; end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 20 then return 'nome_non_valido'; end if;
  if v_lega is not null and (char_length(v_lega) < 2 or char_length(v_lega) > 20) then return 'lega_non_valida'; end if;
  -- punteggio coerente: ogni risposta giusta vale da 100 a 250 punti
  if p_giuste < 0 or p_giuste > 5 or p_punti < 100 * p_giuste or p_punti > 250 * p_giuste then return 'punteggio_non_valido'; end if;
  if p_secondi < 0 or p_secondi > 300 then return 'punteggio_non_valido'; end if;

  select * into g from giocatori where giocatori.nick = v_chiave;
  if not found then
    insert into giocatori (nick, nome, device, lega) values (v_chiave, v_nome, p_device, v_lega);
  elsif g.device <> p_device then
    return 'nome_occupato';
  else
    update giocatori set lega = v_lega where giocatori.nick = v_chiave;
  end if;

  insert into risultati (nick, numero, giorno, giuste, punti, secondi)
  values (v_chiave, p_numero, v_oggi, p_giuste, p_punti, p_secondi)
  on conflict (nick, numero) do nothing;
  get diagnostics inseriti = row_count;
  if inseriti = 0 then return 'gia_giocato'; end if;
  return 'ok';
end $$;

-- ------------------------------------------------------------
-- Classifica di un mese ('2026-11'; vuoto = mese in corso),
-- di tutti o di una sola lega
-- ------------------------------------------------------------
create or replace function public.classifica(p_mese text default null, p_lega text default null)
returns table (pos bigint, nome text, lega text, punti bigint, giocati bigint, giuste bigint, record int)
language sql stable security definer set search_path = public as $$
  with m as (
    select coalesce(to_date(nullif(p_mese, ''), 'YYYY-MM'),
                    date_trunc('month', now() at time zone 'Europe/Rome')::date) as inizio
  )
  select rank() over (order by sum(r.punti) desc, sum(r.giuste) desc, sum(r.secondi) asc) as pos,
         g.nome, g.lega, sum(r.punti) as punti, count(*) as giocati, sum(r.giuste) as giuste, max(r.punti) as record
  from risultati r
  join giocatori g on g.nick = r.nick
  cross join m
  where r.giorno >= m.inizio and r.giorno < (m.inizio + interval '1 month')
    and (nullif(p_lega, '') is null or g.lega = upper(trim(p_lega)))
  group by g.nome, g.lega
  order by pos
  limit 100;
$$;

revoke all on function public.invia_risultato(text, uuid, text, int, int, int, int) from public;
revoke all on function public.classifica(text, text) from public;
grant execute on function public.invia_risultato(text, uuid, text, int, int, int, int) to anon, authenticated;
grant execute on function public.classifica(text, text) to anon, authenticated;
