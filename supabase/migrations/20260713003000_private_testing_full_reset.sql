-- Private V1 testing reset. Keep approved source domains and schema, while
-- removing every generated catalogue, image, formula, quota, and anonymous
-- test identity so the recognition flow can be exercised from a clean state.
delete from public.product_submissions;
delete from public.lookup_cache;
delete from public.product_discoveries;
delete from public.products;
delete from public.product_images;
delete from public.ingredient_aliases;
delete from public.ingredients;
delete from public.visual_lookup_usage;
delete from auth.users where is_anonymous = true;
