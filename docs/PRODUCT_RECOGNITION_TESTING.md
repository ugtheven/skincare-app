# Product recognition quality corpus

Product recognition is evaluated with unit tests, mocked provider tests, and a
local photo corpus. Real user photos must never be committed.

## What to provide

Start with 20 products. For each product, provide:

- the exact brand;
- the exact product name, including concentration or variant;
- the expected broad category;
- the barcode digits when present;
- two or three original photos: clear front, angled or reflective, and a harder
  crop or lighting condition.

Include French, English, and bilingual packaging; tubes, pumps, jars, and curved
bottles; common products and known failures. Photos must contain no face,
personal document, address, or other identifying information.

## Local storage

Store photos under `.local/product-recognition/<case-id>/`. This directory is
ignored by Git. Keep the expected result in a local `expected.json` file:

```json
{
  "brand": "AROMA-ZONE",
  "name": "Sérum acide glycolique 10% & AHA",
  "category": "Exfoliant",
  "barcode": null
}
```

Run the macOS Vision harness against local images, then execute the local corpus
test:

```sh
OUTPUT_PATH=.local/product-recognition/recognized-structured.json \
  swift scripts/recognize-product-text.swift <photos...>
npm run test -- --runInBand \
  src/domain/product-recognition.local-corpus.test.ts
```

The committed text-only corpus protects the same reconstruction cases in CI.
It contains no real user photo.

## Quality gates

Track these separately:

- barcode decoding success;
- exact normalized brand;
- important product-name token recall;
- correct category;
- correct catalogue match in top 1 and top 3;
- false reliable-match rate;
- automatic suggestions without a normalized packshot (target: zero);
- editable fallback completeness;
- local OCR and total lookup latency at p50 and p95.

Initial targets should be set only after measuring the first corpus baseline.
No quality target can compensate for a product that is absent from every
catalogue, so catalogue coverage and extraction quality remain separate metrics.
