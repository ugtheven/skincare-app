create table public.brand_source_domains (
  domain text primary key,
  brand text not null,
  normalized_brand text not null,
  source_kind text not null check (source_kind in ('manufacturer', 'licensed_catalogue')),
  license text,
  license_url text,
  approved_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  storage_path text,
  source_url text not null,
  source_domain text not null references public.brand_source_domains(domain),
  source_kind text not null check (source_kind in ('manufacturer', 'licensed_catalogue')),
  license text,
  license_url text,
  sha256 text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (source_url)
);

create table public.product_formulas (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  ingredients_text text not null,
  normalized_ingredients text not null,
  source_provider text not null,
  source_url text,
  language text,
  market text,
  confidence smallint not null default 0 check (confidence between 0 and 100),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  fetched_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (product_id, source_provider, language, market)
);

create table public.visual_lookup_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_day)
);

alter table public.product_submissions
  add column proposed_image_url text,
  add column proposed_image_source_url text,
  add column proposed_ingredients_text text,
  add column proposed_ingredients_source text,
  add column proposed_ingredients_source_url text;

create or replace function public.consume_visual_lookup_quota(
  target_user_id uuid,
  daily_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  if daily_limit < 1 then
    return false;
  end if;

  insert into public.visual_lookup_usage (user_id, usage_day, request_count)
  values (target_user_id, current_date, 1)
  on conflict (user_id, usage_day) do update
    set request_count = public.visual_lookup_usage.request_count + 1,
        updated_at = now()
  returning request_count into next_count;

  return next_count <= daily_limit;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-packshots',
  'product-packshots',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

alter table public.brand_source_domains enable row level security;
alter table public.product_images enable row level security;
alter table public.product_formulas enable row level security;
alter table public.visual_lookup_usage enable row level security;

revoke all on public.brand_source_domains from anon, authenticated;
revoke all on public.product_images from anon, authenticated;
revoke all on public.product_formulas from anon, authenticated;
revoke all on public.visual_lookup_usage from anon, authenticated;
revoke all on function public.consume_visual_lookup_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_visual_lookup_quota(uuid, integer) to service_role;

create index product_images_product_status_idx
  on public.product_images(product_id, status);
create index product_formulas_product_status_idx
  on public.product_formulas(product_id, status);
