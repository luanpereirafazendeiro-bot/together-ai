-- Together AI — esquema do banco (Supabase / PostgreSQL)
-- Cole tudo isto em: Supabase > SQL Editor > New query > Run

create extension if not exists pgcrypto;

-- SALAS ---------------------------------------------------------------
create table if not exists public.rooms (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default 'Nova conversa' check (char_length(name) between 1 and 80),
  created_at    timestamptz not null default now(),
  -- configurações
  ai_mode       text not null default 'always' check (ai_mode in ('always','mention','off')),
  ai_persona    text not null default '' check (char_length(ai_persona) <= 500),
  -- trava para evitar duas respostas de IA simultâneas na mesma sala
  ai_lock_until timestamptz not null default 'epoch'
);

-- CONVITES (revogáveis) ------------------------------------------------
create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists invites_room_idx on public.invites(room_id);

-- PARTICIPANTES -------------------------------------------------------
-- O navegador guarda "id.segredo". Aqui guardamos só o hash do segredo.
create table if not exists public.participants (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  nickname    text not null check (char_length(nickname) between 1 and 30),
  secret_hash text not null,
  role        text not null default 'member' check (role in ('owner','member')),
  user_id     uuid,  -- reservado para contas no futuro (Supabase Auth)
  joined_at   timestamptz not null default now(),
  removed_at  timestamptz
);
create index if not exists participants_room_idx on public.participants(room_id);

-- MENSAGENS -----------------------------------------------------------
create table if not exists public.messages (
  seq            bigint generated always as identity,  -- ordem global e estável
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  author_name    text not null,
  author_type    text not null check (author_type in ('human','ai','system')),
  content        text not null default '',
  status         text not null default 'done' check (status in ('streaming','done','error')),
  reply_to       uuid references public.messages(id) on delete set null,
  client_id      uuid,  -- gerado no navegador: evita duplicar ao reenviar
  created_at     timestamptz not null default now()
);
create index if not exists messages_room_seq_idx on public.messages(room_id, seq);
-- Mesma mensagem reenviada = ignorada
create unique index if not exists messages_client_uidx
  on public.messages(room_id, client_id) where client_id is not null;
-- No máximo UMA resposta de IA por mensagem (evita respostas duplicadas)
create unique index if not exists messages_one_ai_reply_uidx
  on public.messages(reply_to) where author_type = 'ai' and reply_to is not null;

-- SEGURANÇA (RLS) -----------------------------------------------------
-- Todas as escritas passam pelo servidor (service role, ignora RLS).
-- O navegador só LÊ mensagens via Realtime, com um token curto emitido
-- pelo servidor que contém o room_id da sala do participante.
alter table public.rooms        enable row level security;
alter table public.invites      enable row level security;
alter table public.participants enable row level security;
alter table public.messages     enable row level security;

drop policy if exists "ler mensagens da propria sala" on public.messages;
create policy "ler mensagens da propria sala"
  on public.messages for select to authenticated
  using (room_id::text = (auth.jwt() ->> 'room_id'));

drop policy if exists "ler propria sala" on public.rooms;
create policy "ler propria sala"
  on public.rooms for select to authenticated
  using (id::text = (auth.jwt() ->> 'room_id'));

drop policy if exists "ler participantes da propria sala" on public.participants;
create policy "ler participantes da propria sala"
  on public.participants for select to authenticated
  using (room_id::text = (auth.jwt() ->> 'room_id'));
-- (secret_hash nunca deve ser lido pelo navegador: revogamos a coluna abaixo)
revoke select on public.participants from authenticated, anon;
grant select (id, room_id, nickname, role, joined_at, removed_at) on public.participants to authenticated;

-- invites: nenhuma policy => ninguém no navegador lê.

-- REALTIME ------------------------------------------------------------
alter table public.messages replica identity full;
alter table public.participants replica identity full;
alter table public.rooms replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.messages;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.participants; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.rooms;        exception when duplicate_object then null; end;
end $$;
