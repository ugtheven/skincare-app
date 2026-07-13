alter table public.product_images
  add column source_page_url text;

insert into public.brand_source_domains (
  domain,
  brand,
  normalized_brand,
  source_kind,
  license,
  license_url
)
values
  (
    'images.openbeautyfacts.org',
    'Open Beauty Facts',
    'open beauty facts',
    'licensed_catalogue',
    'CC BY-SA',
    'https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/'
  ),
  (
    'images.openfoodfacts.org',
    'Open Food Facts',
    'open food facts',
    'licensed_catalogue',
    'CC BY-SA',
    'https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/'
  )
on conflict (domain) do update
set
  source_kind = excluded.source_kind,
  license = excluded.license,
  license_url = excluded.license_url,
  approved_at = now();

create table public.product_discoveries (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  proposed_name text not null,
  normalized_name text not null,
  proposed_brand text,
  normalized_brand text,
  proposed_category text,
  source_provider text not null,
  source_page_url text,
  product_image_id uuid references public.product_images(id) on delete set null,
  normalized_image_url text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  sightings_count integer not null default 1 check (sightings_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.product_discoveries enable row level security;
revoke all on public.product_discoveries from anon, authenticated;

create index product_discoveries_status_last_seen_idx
  on public.product_discoveries(status, last_seen_at desc);

update public.products
set image_url = null
where image_url like 'https://images.open%facts.org/%';
