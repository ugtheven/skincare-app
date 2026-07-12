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
- Use subtle interaction feedback to make completion satisfying.
- Prefer clarity and consistency over decoration.

## Accessibility & Inclusion

V1 uses a single light appearance, sufficient contrast, iOS-sized touch targets, and no meaning conveyed by color alone. Reduced Motion must be respected. Dynamic iOS text sizing and independently disabling haptics are deferred for now.

## V1 Scope

- Product addition through barcode, product photo, OCR, text search, or manual entry.
- Clear product composition explanations without arbitrary universal scores.
- Morning, evening, weekly, or selected-day routines with one-tap completion and undo.
- A Today screen showing the current routine, progress, relevant sun protection, and next useful action.
- UV index and recommended sunscreen reapplication tracking without claiming exact protection duration.
- Weekly skin check-ins with optional photos, simple ratings, and notes.

## Outside V1

Automatic face analysis, dermatological diagnosis, a full conversational assistant, community, marketplace, commercial recommendations, water or broader wellness tracking, complex causal statistics, and heavy gamification.

## Navigation

The primary sections are Today, Products, and Progress. Settings, profile, and advanced routine management remain secondary.

## Relationship To Repository Docs

The fuller product scope and roadmap remain documented in `docs/PRODUCT.md`. This root file exists so Impeccable and other design-aware tools can load the confirmed product context directly.
