create type public.product_identifier_kind as enum ('barcode', 'qr');
create type public.product_submission_status as enum ('pending', 'accepted', 'rejected');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null,
  brand text,
  normalized_brand text,
  category text,
  image_url text,
  confidence smallint not null default 0 check (confidence between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_identifiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  kind public.product_identifier_kind not null,
  raw_value text not null,
  normalized_value text not null unique,
  created_at timestamptz not null default now()
);

create table public.product_localizations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  locale text not null,
  display_name text not null,
  normalized_display_name text not null,
  source text not null check (source in ('manufacturer', 'community', 'machine_translation')),
  unique (product_id, locale)
);

create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  confidence smallint not null default 50 check (confidence between 0 and 100),
  unique (product_id, normalized_alias)
);

create table public.product_sources (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  provider text not null,
  provider_product_id text,
  source_url text,
  license text,
  fetched_at timestamptz not null default now(),
  unique (provider, provider_product_id)
);

create table public.lookup_cache (
  lookup_key text primary key,
  product_id uuid references public.products(id) on delete set null,
  result_kind text not null check (result_kind in ('match', 'miss')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.product_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  proposed_product_id uuid references public.products(id) on delete set null,
  identifier_value text,
  proposed_name text,
  proposed_brand text,
  proposed_category text,
  reason text not null check (reason in ('new_product', 'wrong_guess', 'correction')),
  status public.product_submission_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index products_normalized_name_idx on public.products(normalized_name);
create index product_aliases_normalized_alias_idx on public.product_aliases(normalized_alias);
create index lookup_cache_expires_at_idx on public.lookup_cache(expires_at);

alter table public.products enable row level security;
alter table public.product_identifiers enable row level security;
alter table public.product_localizations enable row level security;
alter table public.product_aliases enable row level security;
alter table public.product_sources enable row level security;
alter table public.lookup_cache enable row level security;
alter table public.product_submissions enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
