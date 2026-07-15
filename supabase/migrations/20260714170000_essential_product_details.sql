alter table public.products
  add column usage_text text,
  add column usage_source text,
  add column usage_source_url text,
  add column precautions_text text,
  add column precautions_source text,
  add column precautions_source_url text,
  add column confidence_source text,
  add column confidence_source_url text,
  add column confidence_note text;

comment on column public.products.usage_text is
  'Optional sourced product role or usage summary. Absence must remain unknown.';
comment on column public.products.precautions_text is
  'Optional verified precaution text. Requires its source fields before display.';
comment on column public.products.confidence is
  'Identity-information confidence only; never a product quality or safety score.';
