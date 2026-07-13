create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null unique,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingredient_aliases (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  alias text not null,
  normalized_alias text not null unique,
  created_at timestamptz not null default now()
);

create table public.product_formula_ingredients (
  formula_id uuid not null references public.product_formulas(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  position integer not null check (position >= 0),
  raw_name text not null,
  primary key (formula_id, position)
);

create index product_formula_ingredients_ingredient_idx
  on public.product_formula_ingredients(ingredient_id);

alter table public.ingredients enable row level security;
alter table public.ingredient_aliases enable row level security;
alter table public.product_formula_ingredients enable row level security;

revoke all on public.ingredients from anon, authenticated;
revoke all on public.ingredient_aliases from anon, authenticated;
revoke all on public.product_formula_ingredients from anon, authenticated;

-- V1 catalogue reset: every future displayed product must pass through the
-- normalized image and structured-formula enrichment pipeline.
delete from public.lookup_cache;
delete from public.product_discoveries;
delete from public.products;

create unique index products_normalized_identity_idx
  on public.products(normalized_name, coalesce(normalized_brand, ''));
