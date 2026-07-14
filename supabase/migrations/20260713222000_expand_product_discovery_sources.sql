create table public.product_discovery_domains (
  domain text primary key,
  source_kind text not null check (source_kind in ('retailer', 'pharmacy')),
  enabled boolean not null default true,
  approved_at timestamptz not null default now()
);

alter table public.product_discovery_domains enable row level security;
revoke all on public.product_discovery_domains from anon, authenticated;

insert into public.product_discovery_domains (domain, source_kind)
values
  ('amazon.fr', 'retailer'),
  ('sephora.fr', 'retailer'),
  ('nocibe.fr', 'retailer'),
  ('lookfantastic.fr', 'retailer'),
  ('easypara.fr', 'pharmacy')
on conflict (domain) do update
set source_kind = excluded.source_kind,
    enabled = true,
    approved_at = now();

insert into public.brand_source_domains (
  domain,
  brand,
  normalized_brand,
  source_kind,
  license,
  license_url
)
values ('cerave.com', 'CeraVe', 'cerave', 'manufacturer', null, null)
on conflict (domain) do update
set brand = excluded.brand,
    normalized_brand = excluded.normalized_brand,
    source_kind = excluded.source_kind,
    license = excluded.license,
    license_url = excluded.license_url,
    approved_at = now();

insert into public.products (
  canonical_name,
  normalized_name,
  brand,
  normalized_brand,
  category,
  confidence
)
select
  'Crème Hydratante Visage',
  'cremehydratantevisage',
  'CeraVe',
  'cerave',
  'Hydratant',
  95
where not exists (
  select 1
  from public.products
  where normalized_brand = 'cerave'
    and normalized_name = 'cremehydratantevisage'
);

with target as (
  select id
  from public.products
  where normalized_brand = 'cerave'
    and normalized_name = 'cremehydratantevisage'
  order by confidence desc, created_at
  limit 1
)
insert into public.product_aliases (
  product_id,
  alias,
  normalized_alias,
  confidence
)
select
  id,
  'Crème Hydratante Visage PM',
  'cremehydratantevisagepm',
  95
from target
on conflict (product_id, normalized_alias) do update
set alias = excluded.alias,
    confidence = excluded.confidence;

with target as (
  select id
  from public.products
  where normalized_brand = 'cerave'
    and normalized_name = 'cremehydratantevisage'
  order by confidence desc, created_at
  limit 1
)
insert into public.product_sources (
  product_id,
  provider,
  provider_product_id,
  source_url,
  fetched_at
)
select
  id,
  'manufacturer_sitemap',
  'https://www.cerave.fr/nos-produits/hydratants/creme-hydratante-visage',
  'https://www.cerave.fr/nos-produits/hydratants/creme-hydratante-visage',
  now()
from target
on conflict (provider, provider_product_id) do update
set product_id = excluded.product_id,
    source_url = excluded.source_url,
    fetched_at = excluded.fetched_at;

with target as (
  select id
  from public.products
  where normalized_brand = 'cerave'
    and normalized_name = 'cremehydratantevisage'
  order by confidence desc, created_at
  limit 1
)
update public.product_images image
set product_id = target.id
from target
where image.source_page_url =
      'https://www.cerave.fr/nos-produits/hydratants/creme-hydratante-visage';
