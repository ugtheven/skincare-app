create temporary table recognition_seed (
  seed_key text primary key,
  canonical_name text not null,
  normalized_name text not null,
  brand text not null,
  normalized_brand text not null,
  category text not null,
  barcode text
) on commit drop;

insert into recognition_seed (
  seed_key,
  canonical_name,
  normalized_name,
  brand,
  normalized_brand,
  category,
  barcode
)
values
  (
    'cerave-pm-face-moisturizer',
    'Crème Hydratante Visage PM',
    'cremehydratantevisagepm',
    'CeraVe',
    'cerave',
    'Hydratant',
    '3612623028162'
  ),
  (
    'aroma-zone-hair-serum-peptides-pea',
    'Sérum cheveux - Peptides & extrait de Pois',
    'serumcheveuxpeptidesextraitdepois',
    'AROMA-ZONE',
    'aromazone',
    'Soin capillaire',
    null
  ),
  (
    'aroma-zone-eye-contour-cream',
    'Crème contour des yeux',
    'cremecontourdesyeux',
    'AROMA-ZONE',
    'aromazone',
    'Soin contour des yeux',
    null
  ),
  (
    'schwarzkopf-taft-matt-clay-paste',
    'Pâte argileuse matifiante',
    'pateargileusematifiante',
    'Schwarzkopf',
    'schwarzkopf',
    'Coiffant',
    '3178041330411'
  ),
  (
    'eucerin-urea-repair-10-body-lotion',
    'Lotion hydratante intensive 10% urée',
    'lotionhydratanteintensive10uree',
    'Eucerin',
    'eucerin',
    'Hydratant',
    '4005800164361'
  ),
  (
    'cerave-am-face-moisturizer-spf30',
    'Crème Hydratante Visage AM SPF30',
    'cremehydratantevisageamspf30',
    'CeraVe',
    'cerave',
    'Protection solaire',
    '3612623961421'
  ),
  (
    'cerave-moisturizing-lotion',
    'Lait hydratant',
    'laithydratant',
    'CeraVe',
    'cerave',
    'Hydratant',
    '3337875597210'
  ),
  (
    'aroma-zone-niacinamide-copper-zinc-serum',
    'Sérum Niacinamide 10% Cuivre & Zinc',
    'serumniacinamide10cuivrezinc',
    'AROMA-ZONE',
    'aromazone',
    'Sérum',
    null
  );

insert into public.products (
  canonical_name,
  normalized_name,
  brand,
  normalized_brand,
  category,
  confidence
)
select
  seed.canonical_name,
  seed.normalized_name,
  seed.brand,
  seed.normalized_brand,
  seed.category,
  90
from recognition_seed seed
where not exists (
  select 1
  from public.products product
  where product.normalized_name = seed.normalized_name
    and product.normalized_brand = seed.normalized_brand
);

insert into public.product_identifiers (
  product_id,
  kind,
  raw_value,
  normalized_value
)
select
  product.id,
  'barcode'::public.product_identifier_kind,
  seed.barcode,
  seed.barcode
from recognition_seed seed
join lateral (
  select id
  from public.products
  where normalized_name = seed.normalized_name
    and normalized_brand = seed.normalized_brand
  order by confidence desc, created_at
  limit 1
) product on true
where seed.barcode is not null
on conflict (normalized_value) do update
set product_id = excluded.product_id,
    raw_value = excluded.raw_value,
    kind = excluded.kind;

insert into public.product_sources (
  product_id,
  provider,
  provider_product_id
)
select
  product.id,
  'curated_packaging_corpus',
  seed.seed_key
from recognition_seed seed
join lateral (
  select id
  from public.products
  where normalized_name = seed.normalized_name
    and normalized_brand = seed.normalized_brand
  order by confidence desc, created_at
  limit 1
) product on true
on conflict (provider, provider_product_id) do update
set product_id = excluded.product_id,
    fetched_at = now();

insert into public.lookup_cache (
  lookup_key,
  product_id,
  result_kind,
  expires_at
)
select
  'identifier:' || seed.barcode,
  product.id,
  'match',
  now() + interval '365 days'
from recognition_seed seed
join lateral (
  select id
  from public.products
  where normalized_name = seed.normalized_name
    and normalized_brand = seed.normalized_brand
  order by confidence desc, created_at
  limit 1
) product on true
where seed.barcode is not null
on conflict (lookup_key) do update
set product_id = excluded.product_id,
    result_kind = excluded.result_kind,
    expires_at = excluded.expires_at;
