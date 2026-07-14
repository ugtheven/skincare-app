# Visual product fallback

## Runtime flow

1. Keep barcode detection active while Apple Vision probes compressed stills locally. Accept centered, high-confidence checksum-valid GTIN digits even when no bars are printed; keep a two-frame lock for weaker readings.
2. Require three consistent recognized identities, then lock automatically with progressive haptics. No shutter button is shown.
3. Query the local, shared, and Open Facts catalogues. Reject candidates before scoring when SPF levels or written percentages differ or are missing on only one side.
4. Show a reliable, display-ready catalogue candidate immediately. Otherwise explain the cloud fallback and wait for explicit consent for this scan.
5. After consent, center-crop, resize, re-encode, and send that single JPEG to `product-visual-lookup`. A visible cancel action aborts the client request and invalidates the recognition session.
6. When OCR contains an approved brand, try its reviewed local and international manufacturer sitemaps first and normalize the exact result without spending a paid request. Otherwise cross-match Google Vision results, then query SerpApi Google Images with normalized OCR text only; never send the captured photo to SerpApi. Reviewed retailer and pharmacy titles may refine a manufacturer query, but cannot become a result by themselves.
7. Normalize retained packshots and fetch a manufacturer formula when available.
8. Return at most three results and require confirmation. First-seen web candidates stay pending until confirmation and are never inserted into the canonical catalogue by lookup alone.

An offline device, a disabled feature, or a provider failure leads to editable manual entry. The captured photo is never stored remotely.

## Edge Function configuration

Required secrets:

- `GOOGLE_CLOUD_VISION_API_KEY`
- `SERPAPI_API_KEY` (server-only Google Images text fallback)
- `GOOGLE_VISUAL_LOOKUP_ENABLED` (`false` until rollout)
- `VISUAL_LOOKUP_DAILY_USER_LIMIT` (positive production limit; `0` blocks Vision unless the development override is explicit)
- `VISUAL_LOOKUP_GLOBAL_DAILY_LIMIT` (positive hard ceiling shared by all users)
- `VISUAL_LOOKUP_MINUTE_USER_LIMIT` (short-window abuse ceiling)
- `SERPAPI_VISUAL_LOOKUP_ENABLED` (independent SerpApi kill switch)
- `SERPAPI_DAILY_USER_LIMIT` and `SERPAPI_GLOBAL_DAILY_LIMIT`
- `VISUAL_LOOKUP_RUNTIME_ENV=production`
- `ALLOW_UNMETERED_VISUAL_LOOKUP` (`true` only for explicit single-user development)
- `PRODUCT_IMAGE_NORMALIZER_URL`
- `NORMALIZER_JOB_SECRET`

Restrict the Google key to Cloud Vision. Configure provider-side quotas and billing alerts as the final backstop. Each paid provider has an independent kill switch, atomic per-user/global/day and per-minute limits, and idempotent request IDs. A zero limit blocks the provider unless both `VISUAL_LOOKUP_RUNTIME_ENV=development` and `ALLOW_UNMETERED_VISUAL_LOOKUP=true`; never enable that override for a multi-user environment. Approved manufacturer discovery runs before paid providers; barcode lookup never invokes a paid image provider before confirmation.

The function accepts JPEG base64 only, capped at 1.5 million encoded characters. It does not log the image or recognized text. Provider calls time out after eight seconds and are never retried automatically. SerpApi receives only the compact OCR query. A SerpApi result is retained only when its page and original image resolve to the same approved manufacturer and at least two non-generic identity tokens match.

## Approved sources

Populate `brand_source_domains` through an administrative review. A domain needs:

- canonical brand;
- manufacturer or licensed-catalogue classification;
- licence name and URL when applicable;
- review date.

Subdomains are accepted. HTTP, lookalike suffixes, blogs, and unknown image hosts are rejected. Domains in `product_discovery_domains` may contribute brand-bound identity text only. Retailer images, ingredient lists, and standalone candidates are rejected; every displayed web result must still resolve to an approved manufacturer or licensed catalogue source.

Open Facts selected product images are licensed under CC BY-SA. They are a licensed-catalogue fallback, are normalized before display, and keep visible attribution. A raw camera photo is never reused as a suggestion image.

## Image normalizer

`services/product-image-normalizer` is a small Cloud Run-compatible Node service. It:

- accepts only signed jobs referencing a pending `product_images` row;
- checks the approved source domain and rejects private network addresses;
- rejects redirects, unsupported MIME types, files over 5 MB, and images over 50 MP;
- removes uniform white margins;
- centers the product on a 1024 × 1024 white canvas;
- outputs WebP and records SHA-256, dimensions, storage path, and verification time.

It never generates or redraws packaging. Non-uniform or misleading source images must be rejected during moderation.

Required worker environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NORMALIZER_JOB_SECRET`

## Ingredients

Store the original INCI list in `product_formulas` with provider, source URL, language, market, confidence, and review status. Never merge differing lists automatically. A formula may vary by market or change over time.

Parse every accepted formula into:

- one canonical `ingredients` record per normalized INCI name;
- optional aliases for later curation;
- ordered `product_formula_ingredients` rows preserving the raw source name;
- `pending` review status for every first-seen ingredient.

Priority:

1. matched manufacturer page;
2. exact-barcode Open Beauty Facts formula;
3. no formula rather than an unverified transcription.

The interface shows the ordered parsed list and its source. Ingredient photography and raw formula editing are not part of the V1 scan flow. It must not infer medical safety or diagnose from ingredients.

## Rollout checks

- Begin with the feature flag disabled.
- Validate against the private local corpus.
- Before multi-user rollout, enable low per-user and global limits, provider-side quotas, billing alerts, and Supabase abuse protection/CAPTCHA.
- Track request count, latency, error class, result count, top-1/top-3 confirmation, and cost without logging content.
- Enable progressively only after privacy, licensing, and billing review.
