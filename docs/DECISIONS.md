# Decision Log

Record only decisions that should guide future work.

## Template

### YYYY-MM-DD - Decision title

- **Status:** proposed | accepted | superseded
- **Context:** why a decision is needed
- **Decision:** what was chosen
- **Consequences:** important tradeoffs or follow-up work

## Decisions

### 2026-07-14 - Evidence-linked scanner highlights

- **Status:** accepted
- **Context:** A generic scan frame confirms that the camera is active, but it does not show which code or packaging text drives product recognition.
- **Decision:** On compatible iOS 16+ devices, use an Expo native view around VisionKit `DataScannerViewController` with high-frame-rate tracking. Draw code and selected-text geometry inside the native overlay container so it follows camera movement without waiting for the React Native bridge. Send throttled stable item identifiers and recognized values to JavaScript only for product-evidence selection and lock decisions. After front-label confirmation, briefly hand off to `expo-camera` for the still image required by visual lookup. Retain the existing `expo-camera` plus still-image OCR path as the fallback for iOS 15, unsupported hardware, and temporary VisionKit unavailability. Keep all recognition and geometry local until the existing explicit cloud-consent step.
- **Consequences:** Code and text highlights now track continuously on supported devices while preserving the existing visual-lookup image quality and fallback coverage. The live scanner and photo camera cannot own the camera simultaneously, so confirmed front-label scans include a short native-to-camera handoff before lookup. Native module changes require rebuilding the iOS app; JavaScript refresh alone is insufficient.

### 2026-07-13 - Retailers are discovery hints, not product authorities

- **Status:** accepted
- **Context:** Some regional packaging names are absent from a local manufacturer sitemap even though retailer search results expose the exact variant. Treating marketplace listings as authoritative would introduce seller errors, stale formulas, and image-rights risk.
- **Decision:** Search approved manufacturer domains first, including reviewed international brand domains. Allow a reviewed list of retailers and pharmacies, including Amazon and Sephora, to contribute brand-bound identity text only after the free manufacturer lookup misses. Use that text solely to retry an approved manufacturer lookup. Never persist a retailer image, formula, or standalone candidate.
- **Consequences:** Regional names and variants become easier to resolve without weakening ingredient or packshot provenance. Paid providers remain bounded fallbacks, and products with no corroborating manufacturer or licensed catalogue source still require manual confirmation.

### 2026-07-13 - Critical variant attributes are hard constraints

- **Status:** accepted
- **Context:** Fuzzy text scoring can rank a same-brand base product above the scanned variant, especially when the only difference is SPF30, SPF50, no SPF, or an active concentration.
- **Decision:** Extract SPF levels and written percentages as critical variant attributes. SPF is symmetric: a missing value, a different value, or an extra value rejects the candidate before scoring. A percentage becomes mandatory when OCR retained its `%` sign; a bare number remains supporting evidence because OCR often drops that sign. Apply the rule in local/shared ranking, Google results, SerpApi results, and server catalogue search. Keep AM/PM as aliases rather than hard attributes because official localized names may omit them. Prefer an exact verified identifier binding whenever packaging provides a checksum-valid GTIN.
- **Consequences:** The scanner may return no automatic candidate when OCR misses a critical value, but it cannot confidently substitute SPF50, an unprotected base cream, or a different concentration. Exact barcode bindings remain deterministic. A scanned local barcode is revalidated against the free shared catalogue so even a previously saved complete but incorrect variant can be corrected; offline use still falls back to the local record.

### 2026-07-13 - In-place completion of a first barcode result

- **Status:** accepted
- **Context:** A first barcode lookup could return the basic Open Beauty Facts identity while free manufacturer and image normalization work continued in the Edge Runtime. The completed photo and formula were therefore visible only on the next scan.
- **Decision:** Keep the first response fast, but refresh the open confirmation form for a bounded period when a shared barcode result lacks a photo or formula. Refresh requests read only already-completed catalogue data and never restart normalization or invoke a paid provider. Merge only the missing image and ingredient provenance so user edits to identity fields are preserved, and never block saving while completion continues.
- **Consequences:** Most first scans update in place as soon as background enrichment finishes, without extra paid calls or a forced rescan. Very slow or unavailable sources still fail quietly after the bounded refresh window, while manual verification and saving remain available.

### 2026-07-13 - Consent and hard budgets for paid product lookup

- **Status:** accepted
- **Context:** Automatic background enrichment could spend several paid requests for one scan, continue after the user left the flow, and publish first-seen web data before confirmation.
- **Decision:** Keep all local and catalogue lookups first. Ask for explicit consent before sending a transient packaging image to Google. Never retry a paid provider automatically and never run paid barcode enrichment before confirmation. Enforce independent kill switches plus atomic idempotent per-minute, per-user/day, and global/day ceilings for Google Vision and SerpApi. Record only provider, outcome, duration, and request identifier. Keep first-seen web candidates pending until the user confirms them; local product writes are transactional.
- **Consequences:** A network miss may require a deliberate retry or manual entry, but a single gesture cannot silently multiply cost. Production rollout requires positive global limits, provider-side quotas, billing alerts, and Supabase abuse protection. The UI must always offer cancellation and clearly distinguish local processing from the cloud fallback.

### 2026-07-13 - Barcode-first guided product scanning

- **Status:** accepted
- **Context:** OCR-first automatic capture can suggest a visually similar but incorrect variant. Real products also use printed GTINs without bars and small, rotated manufacturer codes that the initial EAN/UPC-only scanner ignored.
- **Decision:** Start every scan by asking for the product code and keep all common iOS barcode symbologies active, including Code 128. Use silent local OCR probes to guide rotation and detect printed GTIN digits without bars. A checksum-valid GTIN may be accepted in one frame when Apple Vision reports it with high confidence near the center; uncertain or off-center readings still need two consecutive frames. After repeated completed probes without a code, switch automatically to the front-face OCR stage and reveal “Saisir le produit”, even when the back label contains no usable product name. Start the three-step OCR lock and its progressive haptics immediately after that transition. Allow small OCR wording variations between lock frames, while still requiring two shared identity tokens. Keep manual entry visible throughout that fallback stage and prefill it from the latest front-face OCR when possible. When a short manufacturer code is unknown, never open an empty product form: keep the code, request the front face, and bind the code locally after product confirmation. Only checksum-valid GTINs may query a public Open Facts barcode endpoint.
- **Consequences:** Barcode and bound identifier matches remain the safest, fastest path. Product identification never starts during the barcode-seeking stage, but the user no longer needs to tap to enter the front-face fallback. A confirmed private product becomes deterministic for later scans of the same code. Manufacturer-internal codes still need an issuer-aware shared identifier model before first-confirmation bindings can be trusted globally. External search after manual text entry remains a separate implementation slice.

### 2026-07-13 - Text-only SerpApi fallback for front-face OCR

- **Status:** accepted
- **Context:** Google Vision can read a product label without returning an approved manufacturer page or packshot. Some manufacturer sitemaps are also inaccessible to the server, even when a normal text search finds the exact official product page.
- **Decision:** After a front-face OCR miss in the shared catalogue, first search the approved manufacturer sitemap when the brand is explicit. Try the canonical `www` endpoint before the bare domain and return a normalized exact manufacturer result without calling a paid provider. If that fails, use Google Vision, then SerpApi Google Images as a text-only fallback. Build the text query from the identity extracted from the current OCR frame; never seed it with previous candidate names and never send the captured product photo to SerpApi. Preserve nearby active or variant lines that distinguish products, such as “Peptides & extrait de Pois”. Accept a result only when both the result page and original image belong to the same approved manufacturer, the OCR contains that manufacturer, and at least two non-generic identity tokens match. Never display a catalogue candidate that fails the same identity-compatibility check merely because it has a packshot. Treat a result as decisive only when its OCR-derived score is high and clearly separated from the runner-up.
- **Consequences:** A readable front label can resolve products from an approved manufacturer without Google or SerpApi cost. Same-brand near-matches are rejected instead of being guessed. Google and the server-only `SERPAPI_API_KEY` remain bounded fallbacks when the manufacturer sitemap or image normalizer is unavailable.

### 2026-07-12 - Automatic capture and background product enrichment

- **Status:** accepted
- **Context:** The first recognition implementation proved barcode, Apple Vision OCR, shared matching, Google Web Detection, image normalization, and formula extraction independently. Requiring a shutter action and waiting for every enrichment step made the combined flow slower and more visible than the intended scanner experience.
- **Decision:** Keep barcode detection continuously active and automatically probe packaging with compressed silent stills when on-device OCR is available. Require three consistent product identities before locking, with progressive haptic feedback and no shutter button. Show a reliable catalogue candidate immediately only when it already has a normalized packshot. Ingredients and other non-visual fields may continue enriching in the background, but a missing packshot keeps the scan in a retryable enrichment state and can never silently open a confirmable automatic result. Make every Google Vision path use the same feature flag and per-user quota; unmetered operation requires an explicit development override. Return first-seen barcode identity immediately and continue image and manufacturer enrichment through the Edge Runtime background task.
- **Consequences:** The scanner requires an iOS development build for automatic packaging capture; Expo Go remains barcode-only with manual fallback. Automatic probing increases local camera and OCR work, so capture cadence and battery impact must be measured on device. Formula completion is progressive, while the normalized packshot is a display gate. Quota and provider failures must remain explicit and retryable; manual entry is still available only as a deliberate user choice. Google cost and abuse protection become shared infrastructure rather than a visual-flow concern.

### 2026-07-13 - Unmetered visual lookup during private testing

- **Status:** accepted
- **Context:** The app is still used only by its owner. A daily limit interrupts repeated corpus testing before recognition quality can be evaluated end to end.
- **Decision:** Keep the Google visual-lookup kill switch enabled, but allow unmetered requests in the private development environment by setting the daily limit to zero and explicitly enabling the unmetered development override. Reset the shared catalogue, normalized packshots, formulas, discoveries, submissions, anonymous test identities, and usage counters once before the new validation pass.
- **Consequences:** Recognition tests are no longer blocked by a per-user quota, but Google cost is temporarily unbounded. A positive per-user limit, abuse protection, and billing alerts are mandatory before any external tester receives access.

### 2026-07-12 - Mandatory first-seen enrichment and structured formulas

- **Status:** superseded
- **Context:** OCR-only matches still produced products without consistent packshots. Ingredient-label photography was slow and unreliable on curved packaging, while raw INCI text could not support future ingredient alerts.
- **Decision:** Every newly recognized product must complete Google Web Detection before it can appear as a suggestion. The camera screen discloses the automatic transfer; the centered, re-encoded image remains transient. Only suggestions with a normalized image from an approved source are displayed, and first-seen manufacturer matches are persisted directly in the shared catalogue. Fetch the formula from the matched manufacturer page when available, preserve provenance, parse it into ordered ingredient entities, and add unknown names with pending review status. Remove ingredient photography and raw formula editing from the V1 scan flow. Reset the shared product catalogue once so existing test records re-enter through this pipeline.
- **Consequences:** The first lookup is slower and requires network access. Manual entry remains possible when enrichment fails, but it cannot create a trusted shared formula. Manufacturer-page extraction must fail closed. Formula versions and ingredient review remain necessary before alerts. The private local catalogue is not erased by the shared reset.

### 2026-07-12 - Display-ready product suggestions and controlled enrichment

- **Status:** superseded
- **Context:** Real packaging tests exposed full-label OCR pasted as ingredients, uncontrolled provider categories, suggestions without usable packshots, and unclear Google fallback execution.
- **Decision:** Extract ingredient text only from a labelled or strongly INCI-like block and fail closed otherwise. Map every product to a controlled broad category. Display a suggestion only when it has a normalized image from an approved manufacturer or licensed catalogue source, with visible provenance. Store first-seen Google candidates as pending discoveries; do not publish them as trusted catalogue products before confirmation and moderation. State explicitly whether Google was skipped, completed, unsuccessful, or unavailable.
- **Consequences:** Ingredient OCR may ask for a closer retake instead of returning noisy text. Manual product creation requires a category. First-time image enrichment can add latency, while later lookups reuse the normalized stored asset. Open Facts images require CC BY-SA attribution. Pending discoveries can grow the catalogue without silently contaminating it.

### 2026-07-12 - Evidence-based ingredient alerts without universal verdicts

- **Status:** accepted
- **Context:** Neutral product explanations alone do not meet the long-term goal of helping users understand documented ingredient concerns, allergens, and official health guidance.
- **Decision:** Progressively add ingredient alerts grounded in recognized regulatory or health-authority sources. Distinguish prohibitions, conditional restrictions, labelled allergens, official recommendations, ongoing assessments, and matches against a user's private watchlist. Show provenance, jurisdiction, publication date, relevant use conditions, and uncertainty. Do not convert these signals into an opaque universal score or infer danger, non-compliance, diagnosis, or required treatment when concentration, formula version, product type, exposure route, or personal context is missing.
- **Consequences:** Ingredient records and rules must be versioned and source-backed. The interface must use calm, precise language and communicate severity without color alone. Recognition uncertainty must remain visible. User-declared allergies and watchlists are sensitive and local-first by default. Regulatory and scientific sources require ongoing review as guidance changes.

### 2026-07-12 - Consent-based visual fallback and sourced product enrichment

- **Status:** superseded
- **Context:** Local OCR and catalogue lookup cannot identify every product. Missing products also need a clean packshot and, when available, their original INCI list.
- **Decision:** Keep local OCR and catalogues first. After an unreliable result, offer an explicit one-time action for that scan that sends only a centered, re-encoded image capped at 1024 px to Google Cloud Vision Web Detection. Do not persist that upload or log its contents. Accept product images only from an approved manufacturer or licensed catalogue domain, preserve provenance, and normalize approved packshots in an isolated worker. Enrich ingredients only after product confirmation, preferring Open Beauty Facts, then confirmed manufacturer connectors, then local OCR of the packaging. Always preserve the original INCI text and its source.
- **Consequences:** The previous promise that every packaging photo stays on-device now applies only before consent and to ingredient-label OCR. The UI must disclose the Google transfer accurately. Anonymous-user and global quotas, a kill switch, billing alerts, source-domain moderation, formula versioning, and legal review are required before production rollout. Missing enrichment never blocks manual product entry.

### 2026-07-12 - Structured on-device OCR and private photo corpus

- **Status:** accepted
- **Context:** Plain OCR strings lose confidence, position, and text size, causing background labels and packaging claims to be mistaken for the product identity.
- **Decision:** Keep Apple Vision observations structured through the recognition pipeline, including confidence and normalized bounding boxes. Evaluate extraction against a local photo corpus ignored by Git, while committing only minimal text-only regression cases.
- **Consequences:** Brand and multi-line name reconstruction can use layout without uploading photos. Native OCR changes require a development-build rebuild. The corpus must grow across brands, packaging shapes, languages, lighting, and failure cases before accuracy targets are treated as stable.

### 2026-07-12 - Universal barcode lookup and confirmed OCR suggestions

- **Status:** accepted
- **Context:** Open Beauty Facts alone misses products stored in another Open Facts catalogue, while OCR against the small shared catalogue often returns no usable result.
- **Decision:** Use the Open Facts universal barcode endpoint across product types. For packaging photos, combine local OCR with local, shared, and public text matches, then ask the user to confirm. Infer only a broad skincare category when the provider leaves it empty.
- **Consequences:** Common barcode coverage and photo suggestions improve without uploading photos. Public text search is limited to one request per captured photo, remains best-effort, and inferred categories must stay editable.

### 2026-07-12 - On-device iOS packaging OCR with an Expo development build

- **Status:** accepted
- **Context:** Product recognition must fall back to visible packaging text without uploading sensitive photos. Expo Go cannot load custom native OCR code.
- **Decision:** Capture still images with `expo-camera` and recognize text locally through a small project-local Expo module backed by Apple Vision. Keep barcode detection active in parallel. Expo Go retains capture plus manual entry, while OCR requires an iOS development build. Only normalized text is sent to `product-lookup`; captured images remain transient and local.
- **Consequences:** iOS gains OCR without a third-party ML runtime or server photo processing. Native module changes require rebuilding the development app. Android OCR remains a later platform-specific slice, and recognition quality still depends on packaging legibility.

### 2026-07-12 - Shared product knowledge base with a local cache

- **Status:** accepted
- **Context:** Product recognition must improve for every user and avoid repeating external API calls for known identifiers.
- **Decision:** Use a Supabase/PostgreSQL catalogue behind server-side lookup functions. Keep private routines and owned products in SQLite, using it as the first cache. The shared catalogue stores canonical products, normalized identifiers, aliases, localizations, sources, cache entries, and pending corrections.
- **Consequences:** The app never accesses shared tables directly and external providers are called only from the server after a cache miss. Anonymous authentication can protect early usage without collecting account details; CAPTCHA and legal review of imported Open Beauty Facts data are required before production.

### 2026-07-12 - Product catalogue before routine linking

- **Status:** accepted
- **Context:** A routine needs a reusable list of products, while adding products must stay fast enough for first use.
- **Decision:** Store owned products locally in a dedicated SQLite catalogue. Scan EAN/UPC and QR-compatible codes with the device camera, look up basic fields through Open Beauty Facts, require confirmation, and fall back to manual entry. A saved product may then be added as an optional routine step; free-text routine steps remain supported.
- **Consequences:** The catalogue is the source of truth for products, while a routine keeps a product reference and a readable title snapshot. External lookup data is not treated as authoritative and is never shown without user confirmation; no ingredient analysis or score is included in this slice.

### 2026-07-12 - Local-first routine persistence

- **Status:** accepted
- **Context:** The first usable routine flow must survive an app restart, while the product will eventually support synchronisation.
- **Decision:** Store routines, their ordered free-text steps, and step completion states in a versioned local SQLite database. Access it only through a repository interface rather than from the interface layer.
- **Consequences:** The first release works offline and without an account. A future remote repository can implement the same domain contract for synchronisation; SQLite migrations must be maintained as the schema evolves.

### 2026-07-12 - Planned-day completion without a user-facing time

- **Status:** accepted
- **Context:** Users want to know whether a routine was done, not the exact completion time. Evening care may finish after midnight.
- **Decision:** Record each step as done or not done for its planned date. Do not treat a completion timestamp as product data. Until 04:00, an evening routine remains attached to the previous planned day; technical update timestamps remain internal only.
- **Consequences:** History measures consistency by routine day. Future synchronisation can use internal metadata without exposing it in the product.

### 2026-07-12 - Empty first-run onboarding

- **Status:** accepted
- **Context:** First-time users should begin with their own routine rather than sample skincare data.
- **Decision:** Start with an empty state and guide the user to create one morning or evening routine with free-text steps. Linking a step to a product is deferred.
- **Consequences:** The first useful loop is available without a product catalogue; routine editing and product linking become the next feature slices.

### 2026-07-12 - Single light appearance

- **Status:** accepted
- **Context:** The app is primarily used in a well-lit bathroom. Its dark interface undermined the calm, bright visual direction without improving the core routine flow.
- **Decision:** Ship V1 in a single light appearance and force the native interface style to light.
- **Consequences:** Future screens use the light palette only. Contrast, reduced motion, and non-color status cues remain mandatory; adding dark mode later requires a new product decision.

### 2026-07-11 - Repository-local AI workflow

- **Status:** accepted
- **Context:** Personal and professional Codex configurations must remain isolated.
- **Decision:** Keep project instructions and workflow documentation inside this repository. Do not install project-specific global skills unless explicitly requested.
- **Consequences:** `skincare-app` behavior is portable with the repository and does not modify the professional `damapp` configuration.

### 2026-07-11 - Expo with an iOS-first approach

- **Status:** accepted
- **Context:** The first release targets iOS while preserving a practical path to Android.
- **Decision:** Use Expo, React Native, TypeScript, and Expo Router. Develop and verify iOS first while avoiding unnecessary platform-specific assumptions.
- **Consequences:** The project can share most application code across iOS and Android. Native behavior and interface quality must still be verified independently on each supported platform.

### 2026-07-12 - Expo SDK 54 for physical-device development

- **Status:** accepted
- **Context:** The Expo Go version available on the primary iPhone supports SDK 54, while the initial SDK 57 template could not open on that device.
- **Decision:** Use Expo SDK 54 and its compatible React Native and Expo Router versions during the early development phase.
- **Consequences:** The project can be tested directly with Expo Go. Four moderate dependency audit findings remain in the SDK 54 toolchain and should be reassessed before release or when upgrading to a newer supported SDK.
