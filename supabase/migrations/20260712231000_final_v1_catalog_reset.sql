-- Final clean state after validating the bounded manufacturer INCI extractor.
delete from public.lookup_cache;
delete from public.product_discoveries;
delete from public.products;
delete from public.ingredient_aliases;
delete from public.ingredients;
