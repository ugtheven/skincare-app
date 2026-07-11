---
name: Skincare App
description: A calm, clear iOS-first companion for understanding and tracking skincare routines.
colors:
  petroleum: 'oklch(0.420 0.105 220)'
  petroleum-deep: 'oklch(0.300 0.080 220)'
  sun-amber: 'oklch(0.720 0.145 60)'
  background-light: 'oklch(1.000 0.000 0)'
  surface-light: 'oklch(0.965 0.012 220)'
  ink-light: 'oklch(0.205 0.025 220)'
  muted-light: 'oklch(0.455 0.025 220)'
  background-dark: 'oklch(0.145 0.020 220)'
  surface-dark: 'oklch(0.220 0.025 220)'
  ink-dark: 'oklch(0.955 0.010 220)'
  muted-dark: 'oklch(0.730 0.020 220)'
typography:
  display:
    fontFamily: 'SF Pro Display, system-ui, sans-serif'
    fontSize: '34px'
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: '-0.02em'
  headline:
    fontFamily: 'SF Pro Display, system-ui, sans-serif'
    fontSize: '28px'
    fontWeight: 700
    lineHeight: 1.18
  title:
    fontFamily: 'SF Pro Text, system-ui, sans-serif'
    fontSize: '20px'
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: 'SF Pro Text, system-ui, sans-serif'
    fontSize: '17px'
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: 'SF Pro Text, system-ui, sans-serif'
    fontSize: '13px'
    fontWeight: 600
    lineHeight: 1.25
rounded:
  sm: '8px'
  md: '12px'
  lg: '16px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '32px'
components:
  button-primary:
    backgroundColor: '{colors.petroleum}'
    textColor: '{colors.ink-dark}'
    rounded: '{rounded.md}'
    padding: '12px 16px'
    height: '48px'
  button-secondary:
    backgroundColor: '{colors.surface-light}'
    textColor: '{colors.ink-light}'
    rounded: '{rounded.md}'
    padding: '12px 16px'
    height: '48px'
  routine-row:
    backgroundColor: '{colors.surface-light}'
    textColor: '{colors.ink-light}'
    rounded: '{rounded.md}'
    padding: '12px 16px'
  tab-bar:
    backgroundColor: '{colors.background-light}'
    textColor: '{colors.muted-light}'
    rounded: '{rounded.lg}'
    height: '80px'
---

# Design System: Skincare App

## 1. Overview

**Creative North Star: "The Minimal Bathroom Counter"**

This product should feel like a quiet, well-organized bathroom counter in soft morning light: familiar, useful, and carefully arranged without looking precious. It is a tracking and todo experience first. The visual system earns warmth through clear hierarchy, tactile completion feedback, and restrained color rather than through beauty advertising or decorative illustration.

The system is iOS-first and follows native expectations: safe areas, tab navigation, Dynamic Island and home-indicator clearance, SF Pro typography, semantic system behavior, and familiar touch targets. The petroleum blue carries the product identity; white and cool neutral surfaces keep the interface legible in both light and dark mode.

It explicitly rejects strongly gendered beauty styling, stereotypical masculine grooming, medical anxiety, overloaded dashboards, and visual decoration that does not clarify the next action.

**Key Characteristics:**

- Calm and task-oriented.
- Warm through interaction quality, not ornament.
- Familiar to iOS users.
- Progressive detail for beginners and speed for experienced users.
- Satisfying, restrained feedback on completion.

## 2. Colors

The palette is restrained: petroleum blue is reserved for action and selected states, while cool neutral surfaces provide calm structure. Light and dark modes share roles, not raw values.

### Primary

- **Soft Petroleum** (`oklch(0.420 0.105 220)`): Primary actions, active navigation, progress emphasis, and selected controls.

### Secondary

- **Deep Petroleum** (`oklch(0.300 0.080 220)`): Pressed states, high-emphasis text on tinted surfaces, and dark-mode action treatment.

### Tertiary

- **Sun Amber** (`oklch(0.720 0.145 60)`): UV context, gentle attention states, and small progress accents. Never use it as the main navigation color.

### Neutral

- **Light Background** (`oklch(1.000 0.000 0)`): Main light-mode background.
- **Light Surface** (`oklch(0.965 0.012 220)`): Routine rows, grouped surfaces, and secondary controls.
- **Light Ink** (`oklch(0.205 0.025 220)`): Primary text and icons in light mode.
- **Light Muted** (`oklch(0.455 0.025 220)`): Supporting labels and secondary metadata.
- **Dark Background** (`oklch(0.145 0.020 220)`): Main dark-mode background.
- **Dark Surface** (`oklch(0.220 0.025 220)`): Grouped surfaces and raised content in dark mode.
- **Dark Ink** (`oklch(0.955 0.010 220)`): Primary text and icons in dark mode.
- **Dark Muted** (`oklch(0.730 0.020 220)`): Supporting labels and secondary metadata.

### Named Rules

**The One Useful Accent Rule.** Petroleum blue marks an action, a selected state, or meaningful progress. It is not background decoration.

## 3. Typography

**Display Font:** SF Pro Display (with `system-ui` fallback)
**Body Font:** SF Pro Text (with `system-ui` fallback)
**Label/Mono Font:** System monospace only for technical values such as debug or raw ingredient data.

**Character:** One native iOS type family keeps the app familiar and quiet. Hierarchy comes from weight, size, and spacing rather than a decorative display face.

### Hierarchy

- **Display** (700, 34px, 1.12): Top-level Today title and major progress moments.
- **Headline** (700, 28px, 1.18): Section titles and meaningful routine states.
- **Title** (600, 20px, 1.25): Routine names, product names, and navigation titles.
- **Body** (400, 17px, 1.4): Main content and instructions.
- **Label** (600, 13px, 1.25): Metadata, status labels, and compact controls. Never use all-caps tracking as a default.

### Named Rules

**The Native Reading Rule.** Use iOS text styles and allow the system to remain the dominant typographic voice. Do not use a display font in buttons, tabs, or routine labels.

## 4. Elevation

Use a hybrid of tonal layering and restrained shadows. Most content should sit flat on a background or inside a lightly contrasting surface. Shadows are structural and state-based, never decorative atmosphere. In dark mode, prefer surface contrast before shadow.

### Shadow Vocabulary

- **Raised control:** `0 2px 8px rgba(10, 34, 42, 0.10)`, used only when a control needs separation from its surface.
- **Focused sheet:** `0 8px 24px rgba(0, 0, 0, 0.18)`, used for a focused sheet or transient surface, not routine rows.

### Named Rules

**The Quiet Surface Rule.** A routine row should be easy to scan at rest. Elevation appears only to clarify layering or a state change.

## 5. Components

### Buttons

- **Shape:** 12px radius for standard buttons; pills are reserved for compact status tags.
- **Primary:** Soft Petroleum background, high-contrast light text, 48px minimum height, and at least 44px touch target.
- **Hover / Focus:** Native pressed feedback, a short 150–250ms state transition, and a visible focus treatment on non-touch platforms.
- **Secondary / Ghost:** Light or dark surface with ink text. Ghost actions remain visually quieter than primary completion actions.

### Chips

- **Style:** Compact status tags with a semantic surface tint and readable text. Use for UV context or product attributes, not as decorative badges.
- **State:** Selected chips use petroleum blue only when selection changes the current view or filter.

### Cards / Containers

- **Corner Style:** 12px for grouped content, 16px for a larger focused section, never oversized rounded rectangles.
- **Background:** Surface tokens only; avoid nested cards.
- **Shadow Strategy:** Use the Quiet Surface Rule.
- **Border:** Prefer tonal contrast or a 1px separator over a colored accent stripe.
- **Internal Padding:** 16px standard, 24px for primary sections.

### Inputs / Fields

- **Style:** Native-feeling filled or inset fields with 12px radius, clear label, and minimum 44px height.
- **Focus:** Petroleum tint or border shift with a clear non-color indicator.
- **Error / Disabled:** Inline error copy and reduced emphasis; do not rely on red alone.

### Navigation

- **Style:** Native iOS tab bar with three top-level sections: Today, Products, Progress.
- **States:** Petroleum tint for the active tab; muted semantic color for inactive tabs; labels remain visible.
- **Mobile treatment:** Respect safe-area insets and the home indicator. Keep settings and advanced routine editing secondary.

### Routine Row

The signature component is a fast, one-tap todo row. It should show the product or step, its completion state, and any small contextual detail. Completion uses a short scale-and-check feedback, then settles without rearranging the whole screen.

## 6. Do's and Don'ts

### Do:

- **Do** make the next action obvious and keep routine completion within a few taps.
- **Do** use petroleum blue for actions, selection, and meaningful progress only.
- **Do** use native iOS structure, safe areas, semantic colors, and familiar controls.
- **Do** provide light and dark mode with equivalent hierarchy and contrast.
- **Do** make default content visible before any reveal animation and honor Reduce Motion.
- **Do** use subtle tactile feedback to make completion feel satisfying.
- **Do** support beginners with progressive disclosure and experienced users with fast scanning.

### Don't:

- **Don't** make the app strongly masculine, strongly feminine, or beauty-coded around "glow".
- **Don't** make it look medical, clinical in the cold sense, or anxiety-inducing.
- **Don't** build an overloaded dashboard of cards, statistics, promotions, or feeds.
- **Don't** use decorative motion that does not communicate state.
- **Don't** use gradient text, glassmorphism as a default, colored side stripes, or excessive corner rounding.
- **Don't** use arbitrary product scores or language that implies medical certainty.
- **Don't** communicate status through color alone.
