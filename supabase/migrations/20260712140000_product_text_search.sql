create extension if not exists unaccent;

update public.products
set
  normalized_name = regexp_replace(
    lower(unaccent(canonical_name)),
    '[^a-z0-9]+',
    '',
    'g'
  ),
  normalized_brand = case
    when brand is null then null
    else regexp_replace(lower(unaccent(brand)), '[^a-z0-9]+', '', 'g')
  end;

update public.product_aliases
set normalized_alias = regexp_replace(
  lower(unaccent(alias)),
  '[^a-z0-9]+',
  '',
  'g'
);

update public.product_localizations
set normalized_display_name = regexp_replace(
  lower(unaccent(display_name)),
  '[^a-z0-9]+',
  '',
  'g'
);
