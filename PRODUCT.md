# Skincare App Product Context

## Register

product

## Platform

ios

## Users

The app serves both skincare beginners who want to discover and build a routine, and experienced users who mainly want to track what they do quickly. Progressive disclosure should support both without forcing either audience into the other's level of detail.

## Product Purpose

Help people understand their products, build a coherent routine, know what is done, what remains, and what is planned, then observe what appears to work over time.

## Positioning

An uncomplicated skincare app that turns a sometimes complex routine into clear, planned, understandable tracking.

## Brand Personality

Clear, warm, reliable. The beauty of the product should come from clarity, efficiency, and the satisfaction of using it well.

## Anti-references

Avoid strongly masculine or gendered styling, beauty apps centered on "glow", medical or anxiety-inducing interfaces, and overloaded dashboards. This is a tracking and todo product, not a medical product.

## Design Principles

- Make the next action obvious.
- Turn a routine into a calm, reliable checklist.
- Explain progressively without slowing experienced users down.
- Surface authoritative ingredient alerts without inventing universal product verdicts.
- Use subtle interaction feedback to make completion satisfying.
- Prefer clarity and consistency over decoration.

## Accessibility & Inclusion

V1 uses a single light appearance, sufficient contrast, iOS-sized touch targets, and no meaning conveyed by color alone. Reduced Motion and Dynamic Type must be respected. Independently disabling haptics is deferred for now.

## V1 Scope

- Product addition through barcode, product photo, OCR, text search, or manual entry.
- A shared product catalogue, local cache, and personal collection treated as distinct concepts.
- An essential product page covering purpose, available key ingredients, verified precautions, provenance, and confidence without arbitrary universal scores.
- One active morning routine and one active evening routine.
- Ordered product or category-placeholder steps scheduled every day, on selected weekdays, or temporarily disabled.
- One-tap completion, undo, or deliberate skip while preserving past routine snapshots.
- A Today screen showing the current routine, progress, relevant sun protection, and next useful action.
- UV index and recommended sunscreen reapplication tracking without claiming exact protection duration.
- Weekly skin check-ins with optional photos, simple ratings, and notes.

## Long-term Product Direction

The product should progressively turn verified ingredient lists into evidence-based, contextual alerts. It may surface documented allergens, prohibitions, restrictions, and health-authority opinions, but must show provenance and uncertainty and must not infer danger or non-compliance when essential context such as concentration, formula version, or product use is missing. Personal allergy and ingredient watchlists remain local-first by default. The app informs; it does not diagnose, prescribe, or replace professional advice.

## Outside V1

Automatic face analysis, dermatological diagnosis, a full conversational assistant, community, marketplace, commercial recommendations, water or broader wellness tracking, complex causal statistics, and heavy gamification.

## Navigation

The primary sections are Today, Products, and Progress. Settings, profile, and advanced routine management remain secondary.

## Relationship To Repository Docs

The broader product intent remains documented in `docs/PRODUCT.md`. The detailed scope, order, and acceptance criteria for routines and catalogue work live in `docs/ROUTINES_CATALOG_ROADMAP.md` and take precedence over this summary on that perimeter. This root file exists so Impeccable and other design-aware tools can load the confirmed product context directly.
