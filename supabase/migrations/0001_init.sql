-- x5group platformasi: asosiy baza sxemasi
-- Supabase -> SQL Editor ga qo'yib ishga tushiring (bir marta).
-- Barcha jadvallarda RLS yoqilgan va siyosat yo'q: brauzerdan (anon kalit bilan) hech narsa o'qib/yozib bo'lmaydi.
-- Ma'lumotga faqat server (service role) tegadi va u har so'rovda foydalanuvchi ruxsatini tekshiradi.

create extension if not exists pgcrypto;

-- ============ A'ZOLAR ============
create table if not exists public.members (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null default 'account' check (kind in ('account', 'freelance')),
  name              text not null check (length(btrim(name)) > 0),
  email             text,
  role              text not null default 'member' check (role in ('admin', 'member')),
  position          text,                              -- lavozim (PM, Kontent Maker, Targetolog) yoki frilans kasbi
  phone             text,
  telegram_username text,
  telegram_chat_id  bigint unique,
  password_hash     text,                              -- scrypt (frilanslarda yo'q)
  totp_secret       text,                              -- Admin 2 bosqichli kirish uchun
  totp_enabled      boolean not null default false,
  telegram_status   text not null default 'none' check (telegram_status in ('none', 'pending', 'approved', 'blocked')),
  color             text,
  permissions       text[] not null default '{}',
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);
create unique index if not exists members_name_uq on public.members (lower(name));
create unique index if not exists members_email_uq on public.members (lower(email)) where email is not null;

-- ============ LOYIHALAR ============
create table if not exists public.projects (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(btrim(name)) > 0),
  status           text not null default 'Faol' check (status in ('Faol', 'Muzlatilgan', 'Tugagan')),
  contract_start   date,
  contract_months  int check (contract_months is null or contract_months > 0),
  plan_total       int check (plan_total is null or plan_total >= 0),   -- oylik kontent rejasi
  target_plan      int check (target_plan is null or target_plan >= 0), -- targetga kontentlar soni
  owner_name       text,
  owner_phone      text,
  owner_telegram   text,
  owner_instagram  text,
  ig_link          text,
  tg_link          text,
  yt_link          text,
  ig_start         int,
  ig_now           int,
  tg_start         int,
  tg_now           int,
  yt_start         int,
  yt_now           int,
  reach_start      bigint,
  reach_now        bigint,
  ads_source       text,
  ad_account       text,
  portfolio        text,
  archived_at      timestamptz,
  created_at       timestamptz not null default now()
);
create unique index if not exists projects_name_uq on public.projects (lower(name));

create table if not exists public.project_pms (
  project_id uuid not null references public.projects(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  primary key (project_id, member_id)
);

create table if not exists public.member_projects (
  member_id  uuid not null references public.members(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  primary key (member_id, project_id)
);

-- Loyihalar sahifasidagi bosqich sonlari (qo'lda kiritiladi)
create table if not exists public.project_stages (
  project_id uuid primary key references public.projects(id) on delete cascade,
  ideas      int not null default 0 check (ideas >= 0),
  scripts    int not null default 0 check (scripts >= 0),
  editing    int not null default 0 check (editing >= 0),
  posted     int not null default 0 check (posted >= 0),
  rekda      int not null default 0 check (rekda >= 0)
);

-- ============ KONTENTLAR ============
create table if not exists public.contents (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  position       int not null default 0,
  title          text not null check (length(btrim(title)) > 0),
  author_id      uuid references public.members(id) on delete set null,   -- tayyorladi
  editor_id      uuid references public.members(id) on delete set null,   -- montajor
  stage          text not null default 'G''oya'
                 check (stage in ('G''oya', 'Ijobiy', 'Skript Tayyor', 'Syomka Qilindi', 'TZ Berildi', 'Montaj Tayyor', 'Tasdiqlandi', 'Post Joylandi')),
  rekda          boolean not null default false,
  target         boolean not null default false,
  shoot_date     date,
  post_date      date,
  post_time      text,
  platforms      text[] not null default '{}',
  auto_post      boolean not null default false,       -- Telegramga avtomatik joylanadi
  category       text,                                  -- rubrika
  hook           text,
  main_body      text,
  cta            text,
  reference_url  text,
  caption        text,
  material_url   text,
  posted_on      text[] not null default '{}',
  link_instagram text,
  link_youtube   text,
  note_instagram text,
  note_telegram  text,
  note_youtube   text,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists contents_project_idx on public.contents (project_id, position);
create index if not exists contents_post_date_idx on public.contents (post_date) where archived_at is null;

-- ============ VAZIFALAR ============
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  assignee_id   uuid not null references public.members(id) on delete cascade,
  title         text not null check (length(btrim(title)) > 0),
  note          text,
  assigned_on   date not null default current_date,    -- topshirilgan sana
  duration_days int not null default 3 check (duration_days >= 0),
  status        text not null default 'Boshlanmagan' check (status in ('Boshlanmagan', 'Jarayonda', 'Tayyor', 'Tugatildi')),
  done_at       timestamptz,                            -- samaradorlik statistikasi uchun
  created_by    uuid references public.members(id) on delete set null,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id) where archived_at is null;

-- ============ SYOMKALAR ============
create table if not exists public.shoots (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  place        text not null,
  shoot_date   date not null,
  shoot_time   text not null,
  operator_id  uuid references public.members(id) on delete set null,
  brandface_id uuid references public.members(id) on delete set null,
  status       text not null default 'Rejada' check (status in ('Rejada', 'Tugatildi', 'Bekor bo''ldi', 'Ko''chirildi')),
  note         text,
  created_by   uuid references public.members(id) on delete set null,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists shoots_date_idx on public.shoots (shoot_date) where archived_at is null;

-- ============ TARGET ============
create table if not exists public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  name          text not null,
  started_on    date,
  status        text,
  goal          text,
  daily_budget  numeric,
  spent         numeric not null default 0,
  result        numeric not null default 0,
  result_type   text,
  leads         int not null default 0,
  views         bigint not null default 0,
  reach         bigint not null default 0,
  video_3s      bigint not null default 0,
  thruplay      bigint not null default 0,
  followers     int not null default 0,
  source        text,
  link          text,
  link_suite    text,
  external_id   text,                                   -- Meta kampaniya ID
  updated_at    timestamptz not null default now()
);

create table if not exists public.daily_results (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  day        date not null,
  leads      int not null default 0,
  spend      numeric not null default 0,
  complete   boolean not null default false,
  unique (project_id, day)
);

-- ============ AUDIT LOG, ARXIV ============
create table if not exists public.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid references public.members(id) on delete set null,
  actor_name  text,
  action      text not null check (action in ('create', 'update', 'delete', 'restore', 'revert', 'login', 'system')),
  entity      text not null,
  entity_id   text,
  summary     text not null,
  before_data jsonb,
  after_data  jsonb,
  reverted_at timestamptz
);
create index if not exists audit_at_idx on public.audit_log (at desc);

-- ============ TELEGRAM BOT ============
create table if not exists public.telegram_requests (
  id          bigserial primary key,
  chat_id     bigint not null,
  tg_username text,
  tg_name     text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  member_id   uuid references public.members(id) on delete set null,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create unique index if not exists telegram_requests_pending_uq on public.telegram_requests (chat_id) where status = 'pending';

-- Har eslatma faqat bir marta yuborilishi uchun
create table if not exists public.reminder_log (
  kind    text not null,
  ref     text not null,
  chat_id bigint not null,
  sent_at timestamptz not null default now(),
  primary key (kind, ref, chat_id)
);

-- Bot suhbati holati (masalan, qaysi so'rovga javob kutilmoqda)
create table if not exists public.bot_state (
  chat_id bigint primary key,
  state   jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ============ SOZLAMALAR, ZAXIRA ============
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);

create table if not exists public.backups (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  kind       text not null default 'daily',
  row_counts jsonb not null default '{}',
  data       jsonb not null
);

-- ============ KIRISH SESSIYALARI ============
create table if not exists public.sessions (
  token_hash text primary key,                      -- cookie'dagi tokenning sha256 qiymati
  member_id  uuid not null references public.members(id) on delete cascade,
  mfa_ok     boolean not null default false,        -- 2 bosqichli kod tasdiqlanganmi
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);
create index if not exists sessions_member_idx on public.sessions (member_id);

create table if not exists public.login_attempts (
  id     bigserial primary key,
  email  text not null,
  ip     text,
  at     timestamptz not null default now(),
  ok     boolean not null default false
);
create index if not exists login_attempts_idx on public.login_attempts (lower(email), at desc);

-- ============ XAVFSIZLIK: RLS yoqilgan, siyosat yo'q ============
alter table public.members           enable row level security;
alter table public.projects          enable row level security;
alter table public.project_pms       enable row level security;
alter table public.member_projects   enable row level security;
alter table public.project_stages    enable row level security;
alter table public.contents          enable row level security;
alter table public.tasks             enable row level security;
alter table public.shoots            enable row level security;
alter table public.campaigns         enable row level security;
alter table public.daily_results     enable row level security;
alter table public.audit_log         enable row level security;
alter table public.telegram_requests enable row level security;
alter table public.reminder_log      enable row level security;
alter table public.bot_state         enable row level security;
alter table public.settings          enable row level security;
alter table public.backups           enable row level security;
alter table public.sessions          enable row level security;
alter table public.login_attempts    enable row level security;

-- ============ FUNKSIYALAR ============
-- Birinchi Admin: faqat hali birorta hisob bo'lmaganda yaratiladi (poyga holatidan himoyalangan)
create or replace function public.create_first_admin(p_name text, p_email text, p_hash text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(727001);
  if exists (select 1 from public.members where kind = 'account') then
    raise exception 'setup_done';
  end if;
  insert into public.members (kind, name, email, role, position, color, password_hash)
  values ('account', btrim(p_name), lower(btrim(p_email)), 'admin', 'PM', '#0a84ff', p_hash)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_first_admin(text, text, text) from public, anon, authenticated;
