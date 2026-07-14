insert into public.products (
  canonical_name,
  normalized_name,
  brand,
  normalized_brand,
  category,
  image_url,
  confidence
)
select
  'Sérum concentré Acide glycolique 10% & AHA',
  'serumconcentreacideglycolique10aha',
  'AROMA-ZONE',
  'aromazone',
  'Sérum',
  'https://cdn.aroma-zone.com/image/upload/f_auto%2Cq_auto%2Cw_1280%2Cc_fit/v1/ctcdn/e5f608cf-85e6-4db5-8d00-81b1960857bb/005-pack-aromazone-0-ykjprf0g.jpg',
  98
where not exists (
  select 1
  from public.products
  where normalized_brand = 'aromazone'
    and normalized_name = 'serumconcentreacideglycolique10aha'
);

with target as (
  select id
  from public.products
  where normalized_brand = 'aromazone'
    and normalized_name = 'serumconcentreacideglycolique10aha'
  order by confidence desc, created_at
  limit 1
)
update public.products product
set canonical_name = 'Sérum concentré Acide glycolique 10% & AHA',
    category = 'Sérum',
    image_url = 'https://cdn.aroma-zone.com/image/upload/f_auto%2Cq_auto%2Cw_1280%2Cc_fit/v1/ctcdn/e5f608cf-85e6-4db5-8d00-81b1960857bb/005-pack-aromazone-0-ykjprf0g.jpg',
    confidence = greatest(product.confidence, 98),
    updated_at = now()
from target
where product.id = target.id;

with target as (
  select id
  from public.products
  where normalized_brand = 'aromazone'
    and normalized_name = 'serumconcentreacideglycolique10aha'
  order by confidence desc, created_at
  limit 1
)
insert into public.product_aliases (
  product_id,
  alias,
  normalized_alias,
  confidence
)
select id, alias, normalized_alias, 98
from target
cross join (
  values
    ('Sérum acide glycolique 10% & AHA', 'serumacideglycolique10aha'),
    ('Glycolic acid 10% & AHA serum', 'glycolicacid10ahaserum'),
    ('0435801 Sérum Acide glycolique', '0435801serumacideglycolique')
) as aliases(alias, normalized_alias)
on conflict (product_id, normalized_alias) do update
set alias = excluded.alias,
    confidence = excluded.confidence;

with target as (
  select id
  from public.products
  where normalized_brand = 'aromazone'
    and normalized_name = 'serumconcentreacideglycolique10aha'
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
  'manufacturer_page',
  'aroma-zone:0435801',
  'https://www.aroma-zone.com/info/fiche-technique/serum-visage-concentre-acide-glycolique-10-aha-aroma-zone',
  now()
from target
on conflict (provider, provider_product_id) do update
set product_id = excluded.product_id,
    source_url = excluded.source_url,
    fetched_at = excluded.fetched_at;
