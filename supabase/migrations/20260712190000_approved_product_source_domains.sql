insert into public.brand_source_domains (
  domain,
  brand,
  normalized_brand,
  source_kind,
  license,
  license_url
)
values
  ('aroma-zone.com', 'AROMA-ZONE', 'aroma zone', 'manufacturer', null, null),
  ('cerave.fr', 'CeraVe', 'cerave', 'manufacturer', null, null),
  ('eucerin.fr', 'Eucerin', 'eucerin', 'manufacturer', null, null),
  ('eucerin.com', 'Eucerin', 'eucerin', 'manufacturer', null, null),
  (
    'herbalessences.com',
    'Herbal Essences',
    'herbal essences',
    'manufacturer',
    null,
    null
  ),
  (
    'schwarzkopf.fr',
    'Schwarzkopf',
    'schwarzkopf',
    'manufacturer',
    null,
    null
  )
on conflict (domain) do update
set
  brand = excluded.brand,
  normalized_brand = excluded.normalized_brand,
  source_kind = excluded.source_kind,
  license = excluded.license,
  license_url = excluded.license_url,
  approved_at = now();
