# Shared product catalogue

## Purpose

The shared catalogue prevents every device from repeating the same external lookup. SQLite remains the local cache and the owner of private routines and products.

## Lookup order

1. Local product identifiers.
2. For a barcode or QR miss, shared `product-lookup`, then the universal Open Facts endpoint across product types.
3. For a packaging photo, on-device OCR followed by a local SQLite text match.
4. Shared and public text lookup in parallel if the local cache has no reliable match.
5. With explicit consent, Web Detection receives a centered re-encoded copy only when no reliable match exists.
6. Merge approved web results with weak catalogue candidates and ask the user to confirm.
7. Enrich the confirmed product with a sourced packshot and INCI list. Missing enrichment never blocks saving.

## Safety rules

- The mobile app has no direct access to shared tables.
- The Edge Function is the only path into shared tables. A best-effort Open Facts fallback may be queried directly with compact product text or a barcode.
- Anonymous Supabase sessions identify an installation without asking for personal information. Enable CAPTCHA before production.
- User corrections become pending submissions; they never overwrite a canonical product automatically.
- Product photos are not uploaded before explicit fallback consent.
- The fallback sends a centered JPEG capped at 1024 px. It is not stored by the app backend.
- Ingredient-label OCR remains entirely on-device.
- Web images are accepted only from `brand_source_domains` and enter the catalogue through a pending, sourced record.
- Never store raw photos, base64 payloads, or OCR text in logs.

## Deploy

1. Create or link a Supabase project.
2. Enable anonymous sign-ins and configure CAPTCHA for production.
3. Set `OPEN_BEAUTY_FACTS_USER_AGENT` as an Edge Function secret.
4. Apply `supabase db push` and deploy `product-lookup` plus `product-submission`.
5. Set `GOOGLE_CLOUD_VISION_API_KEY`, `GOOGLE_VISUAL_LOOKUP_ENABLED`, and `VISUAL_LOOKUP_DAILY_USER_LIMIT` as Edge Function secrets.
6. Deploy `product-visual-lookup`. Keep it single-user while the per-user quota is `0`; set a positive limit before public rollout.
7. Deploy the optional Cloud Run image normalizer from `services/product-image-normalizer` and configure its signed-job secret.
8. Copy the project URL and publishable key into `.env.local` from `.env.example`.

## Licensing

Open Beauty Facts data must retain source attribution and its ODbL obligations must be reviewed before production release. The API stores the provider and license with each imported product; legal review is still required before combining it with other shared datasets.

Open Facts images have separate reuse terms. Do not move an image into the normalized packshot bucket unless its source and license are recorded. Google Web Detection discovers sources but grants no reuse right.

Text-only facts confirmed from the local packaging regression corpus use the
`curated_packaging_corpus` provider. Source photos remain local and are never
inserted into migrations or the shared catalogue.

## Correction flow

`product-submission` accepts a signed-in anonymous or permanent user and writes a `pending` submission. It never modifies a shared product directly. The scan confirmation screen offers “Ce n’est pas le bon produit”, submits `reason: wrong_guess`, and removes the suggestion immediately.

Confirmed web-only products are also submitted as `pending`. Their proposed image and formula provenance remain review data until accepted.
