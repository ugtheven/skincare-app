with aliases(barcode, alias, normalized_alias, confidence) as (
  values
    (
      '3337875597333',
      'CeraVe Hydrating Cleanser',
      'ceravehydratingcleanser',
      95
    ),
    (
      '3337875597333',
      'CeraVe Nettoyant Hydratant',
      'ceravenettoyanthydratant',
      95
    ),
    (
      '3337875597333',
      'CeraVe Crème Lavante Hydratante',
      'ceravecremelavantehydratante',
      95
    ),
    (
      '4005800164361',
      'Eucerin UreaRepair PLUS 10% Urea Lotion',
      'eucerinurearepairplus10urealotion',
      95
    ),
    (
      '4005800164361',
      'Eucerin UreaRepair PLUS Lotion 10% Urée',
      'eucerinurearepairpluslotion10uree',
      95
    ),
    (
      '4005800164361',
      'Eucerin Intensive Lotion 10% Urea',
      'eucerinintensivelotion10urea',
      90
    )
)
insert into public.product_aliases (
  product_id,
  alias,
  normalized_alias,
  confidence
)
select
  identifier.product_id,
  aliases.alias,
  aliases.normalized_alias,
  aliases.confidence
from aliases
join public.product_identifiers identifier
  on identifier.normalized_value = aliases.barcode
on conflict (product_id, normalized_alias) do update
set
  alias = excluded.alias,
  confidence = excluded.confidence;
