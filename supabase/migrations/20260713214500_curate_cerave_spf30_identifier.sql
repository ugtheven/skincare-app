insert into public.products (
  canonical_name,
  normalized_name,
  brand,
  normalized_brand,
  category,
  confidence
)
select
  'Crème Hydratante Visage SPF30',
  'cremehydratantevisagespf30',
  'CeraVe',
  'cerave',
  'Protection solaire',
  95
where not exists (
  select 1
  from public.products
  where normalized_brand = 'cerave'
    and normalized_name in (
      'cremehydratantevisagespf30',
      'cremehydratantevisageamspf30'
    )
);

with target as (
  select id
  from public.products
  where normalized_brand = 'cerave'
    and normalized_name in (
      'cremehydratantevisagespf30',
      'cremehydratantevisageamspf30'
    )
  order by
    (normalized_name = 'cremehydratantevisagespf30') desc,
    confidence desc,
    created_at
  limit 1
)
update public.products product
set canonical_name = 'Crème Hydratante Visage SPF30',
    normalized_name = 'cremehydratantevisagespf30',
    brand = 'CeraVe',
    normalized_brand = 'cerave',
    category = 'Protection solaire',
    confidence = greatest(product.confidence, 95),
    updated_at = now()
from target
where product.id = target.id;

with target as (
  select id
  from public.products
  where normalized_brand = 'cerave'
    and normalized_name = 'cremehydratantevisagespf30'
  order by confidence desc, created_at
  limit 1
)
insert into public.product_identifiers (
  product_id,
  kind,
  raw_value,
  normalized_value
)
select id, 'barcode', '3612623961421', '3612623961421'
from target
on conflict (normalized_value) do update
set product_id = excluded.product_id,
    kind = excluded.kind,
    raw_value = excluded.raw_value;

with target as (
  select id
  from public.products
  where normalized_brand = 'cerave'
    and normalized_name = 'cremehydratantevisagespf30'
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
  'Crème Hydratante Visage AM SPF30',
  'cremehydratantevisageamspf30',
  95
from target
on conflict (product_id, normalized_alias) do update
set alias = excluded.alias,
    confidence = excluded.confidence;

with target as (
  select id
  from public.products
  where normalized_brand = 'cerave'
    and normalized_name = 'cremehydratantevisagespf30'
  order by confidence desc, created_at
  limit 1
)
insert into public.product_sources (
  product_id,
  provider,
  provider_product_id,
  fetched_at
)
select
  id,
  'verified_packaging_corpus',
  'cerave:3612623961421',
  now()
from target
on conflict (provider, provider_product_id) do update
set product_id = excluded.product_id,
    fetched_at = excluded.fetched_at;

with target as (
  select id
  from public.products
  where normalized_brand = 'cerave'
    and normalized_name = 'cremehydratantevisagespf30'
  order by confidence desc, created_at
  limit 1
)
insert into public.lookup_cache (
  lookup_key,
  product_id,
  result_kind,
  expires_at
)
select
  'identifier:3612623961421',
  id,
  'match',
  now() + interval '365 days'
from target
on conflict (lookup_key) do update
set product_id = excluded.product_id,
    result_kind = excluded.result_kind,
    expires_at = excluded.expires_at;
