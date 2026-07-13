insert into public.product_aliases (
  product_id,
  alias,
  normalized_alias,
  confidence
)
select
  id,
  canonical_name,
  normalized_name,
  80
from public.products
where normalized_name = 'dailymoisturizinglotion'
  and normalized_brand = 'cerave'
on conflict (product_id, normalized_alias) do nothing;

update public.products
set
  canonical_name = 'Lait Hydratant',
  normalized_name = 'laithydratant',
  updated_at = now()
where normalized_name = 'dailymoisturizinglotion'
  and normalized_brand = 'cerave';
