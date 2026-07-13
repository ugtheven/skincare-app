-- Remove the integration records created before the commercial-background
-- quality gate was deployed. Private on-device products are unaffected.
delete from public.lookup_cache;
delete from public.product_discoveries;
delete from public.products;
delete from public.ingredient_aliases;
delete from public.ingredients;
