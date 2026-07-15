# Product Context

## Register

product

## Platform

ios

## Users

The primary audience includes both skincare beginners who want to discover and build a routine, and experienced users who mainly need a fast way to track what they do. The interface should support progressive disclosure so neither audience is forced into the other's level of detail.

## Product Purpose

Help people understand their products, build a coherent routine, know what is done, what remains, and what is planned, then observe what appears to work over time.

## Brand Personality

Clear, warm, reliable. The product should feel simple and effective, with satisfaction coming from the quality of use rather than decorative beauty codes.

## Anti-references

Avoid strongly masculine or gendered styling, beauty apps centered on "glow", medical or anxiety-inducing interfaces, and overloaded dashboards. This is a tracking and todo product, not a medical product.

## Design Principles

- Make the next action obvious.
- Turn a routine into a calm, reliable checklist.
- Explain progressively without slowing experienced users down.
- Use subtle interaction feedback to make completion satisfying.
- Prefer clarity and consistency over decoration.

## Accessibility & Inclusion

V1 uses a single light appearance, sufficient contrast, touch targets suitable for iOS, and no meaning conveyed by color alone. Reduced Motion and Dynamic Type must be respected. Independently disabling haptics is deferred for now.

## Vision

Build a simple mobile skincare companion that helps people understand their products, follow a routine, manage sun protection, and observe changes over time.

The product is not just a cosmetic scanner. Its main value comes from connecting:

- products owned and used;
- ingredient information and evidence-based alerts;
- routine frequency and consistency;
- product introduction dates;
- reported reactions;
- skin check-ins and optional photos.

## Positioning

The experience should feel modern, mixed, inclusive, calm, and warm. It should avoid both traditional feminine beauty codes and stereotypical masculine grooming codes.

Direction: **clinical warmth**.

- clear like a health app;
- welcoming like a lifestyle product;
- refined without feeling luxurious;
- practical enough for daily use.

Use language about care, comfort, routine, protection, reactions, and progress. Avoid promises of perfect skin, guaranteed transformation, or medical certainty.

## Ingredient information principles

- Do not invent a universal verdict or reduce a product to a "good" or "bad" score.
- Do surface documented allergens, prohibitions, restrictions, and health-authority opinions when the available product data supports them.
- Distinguish a confirmed rule, a conditional restriction, a known allergen, an official recommendation, and an ongoing assessment.
- Show the source, jurisdiction, publication date, relevant use conditions, and uncertainty behind an alert.
- Do not infer that a product is dangerous or non-compliant from an INCI name alone when concentration, formula version, product type, or exposure route is unknown.
- Keep user-declared allergies and personal ingredient watchlists local-first by default and treat them as sensitive data.
- Inform and help the user verify; do not diagnose, prescribe, forbid use, or replace professional advice.

## UX principles

- Few elements, few decisions, strong feedback.
- One primary intention per screen.
- Daily routine completion in a few seconds.
- Progressive disclosure for advanced information.
- Subtle, satisfying animations and haptics.
- No guilt-based streaks or excessive gamification.
- Accessible controls, dynamic text, sufficient contrast, and reduced motion.

## V1 scope

### Products

- Add by barcode, product photo, OCR, text search, or manual entry. V1 text search is a focused product-finding flow; browsing the full shared catalogue remains a later addition.
- Use a hybrid recognition flow and ask the user to confirm uncertain matches.
- Keep the shared product catalogue distinct from the user's personal collection.
- Let a scan open a product for consultation without implicitly marking it as owned.
- Add an owned product to the personal collection through an explicit action; adding it to a routine also marks it as owned.
- Use an essential product page to explain product purpose, available key ingredients, verified precautions, provenance, and confidence.
- Provide a simple summary with optional detail.
- Avoid arbitrary universal scores such as "good" or "bad" while preserving authoritative warnings.

### Routines

- One active morning routine and one active evening routine.
- Ordered steps containing either one product or a completable category placeholder.
- Per-step scheduling for every day, selected weekdays, or temporary deactivation.
- Category-based order suggestions that remain manually editable.
- Optional short instructions, with quantities and wait times deferred.
- Complete, undo, or skip a step for today in one tap.
- Preserve past routine snapshots when a routine or owned product changes.

### Today

- Open the routine relevant to the current moment while keeping the other routine accessible.
- Show only the steps planned for the current routine day and their progress.
- Relevant sun-protection status.
- Next routine or skin check-in when useful.
- No content feed, promotions, or overloaded dashboard.

### Sun protection

- Local UV index.
- Sunscreen used and last declared application.
- Recommended reapplication reminder.
- Context for sport, swimming, or perspiration.
- Never claim exact or guaranteed protection duration.

### Progress

- Weekly check-in with optional photo.
- Simple ratings for dryness, blemishes, redness, and irritation.
- Optional notes and comparison over time.
- Sensitive data and photos should be local-first by default.

## Main navigation

- Today
- Products
- Progress

Settings, profile, and advanced routine management remain secondary.
Scanning remains a reusable product action available from relevant flows, not a top-level tab.

## Outside V1

- Automatic face analysis or dermatological diagnosis.
- Full conversational assistant.
- Community, marketplace, affiliation, or commercial recommendations.
- Water, nutrition, sleep, or stress tracking.
- Complex statistics or causal claims.
- Heavy gamification.

## Likely later additions

- Browsable shared product catalogue with richer product pages.
- Personal "want" list distinct from owned products.
- Community ratings and reviews after account, moderation, privacy, and anti-abuse rules are defined.
- Guided introduction of new products.
- Whole-routine compatibility checks.
- Stock and opening-date management.
- Carefully worded personalized observations.
- Shareable summary for a dermatology appointment.

## Product evolution direction

Ingredient intelligence should grow in reviewable stages rather than arrive as an opaque score:

1. Reliable INCI capture, normalization, formula versioning, and provenance.
2. Versioned regulatory and scientific context from recognized authorities.
3. Clear product-level alerts with source, scope, confidence, and missing context.
4. Local-first personal allergen and ingredient watchlists.
5. Carefully bounded routine-level compatibility and cumulative-use observations.
