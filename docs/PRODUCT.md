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

V1 uses a single light appearance, sufficient contrast, touch targets suitable for iOS, and no meaning conveyed by color alone. Reduced Motion must be respected. Dynamic iOS text sizing and independently disabling haptics are deferred for now.

## Vision

Build a simple mobile skincare companion that helps people understand their products, follow a routine, manage sun protection, and observe changes over time.

The product is not just a cosmetic scanner. Its main value comes from connecting:

- products owned and used;
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

- Add by barcode, product photo, OCR, text search, or manual entry.
- Use a hybrid recognition flow and ask the user to confirm uncertain matches.
- Explain product purpose, key ingredients, precautions, and confidence.
- Provide a simple summary with optional detail.
- Avoid arbitrary universal scores such as "good" or "bad".

### Routines

- Morning, evening, weekly, or selected-day routines.
- Ordered product steps with simple scheduling and optional instructions.
- Complete or undo a step in one tap.

### Today

- Current routine and progress.
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

## Outside V1

- Automatic face analysis or dermatological diagnosis.
- Full conversational assistant.
- Community, marketplace, affiliation, or commercial recommendations.
- Water, nutrition, sleep, or stress tracking.
- Complex statistics or causal claims.
- Heavy gamification.

## Likely later additions

- Guided introduction of new products.
- Whole-routine compatibility checks.
- Stock and opening-date management.
- Carefully worded personalized observations.
- Shareable summary for a dermatology appointment.
