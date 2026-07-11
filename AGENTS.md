# Skincare App - Codex Instructions

## Scope

These instructions apply only to this repository.

## Product source of truth

Read `docs/PRODUCT.md` before product, UX, architecture, or implementation work.
Read `docs/WORKFLOW.md` before starting a substantial task.
Record durable technical or product decisions in `docs/DECISIONS.md`.

## Working principles

- Keep the V1 focused. Do not add features outside the documented scope without approval.
- Prefer simple, maintainable solutions over speculative abstractions.
- Follow existing project patterns once the technical stack exists.
- Keep changes small enough to review and verify.
- Preserve user changes and avoid unrelated refactors.
- Never commit secrets, credentials, personal data, or real user photos.
- Treat skin data and photos as sensitive data.
- Avoid medical diagnosis, certainty, or unsupported health claims.

## UX principles

- Build for a mixed, inclusive audience without gender stereotypes.
- Keep interfaces calm, warm, clear, and practical.
- Each screen should have one primary purpose.
- Daily actions should require as few taps as possible.
- Use subtle motion and haptics as feedback, never as friction.
- Do not use guilt-based messages or aggressive gamification.
- Include accessibility, reduced-motion support, and dynamic text from the start.

## Development workflow

Use the loop defined in `docs/WORKFLOW.md`:

`PLAN -> STEP -> REVIEW -> FIX -> NEXT`

Before editing:

- inspect the relevant files and current git state;
- state assumptions when requirements are ambiguous;
- define a narrow acceptance criterion.

After editing:

- run the narrowest useful checks;
- inspect the diff;
- report what changed, what was verified, and any remaining risk;
- do not commit or push unless explicitly requested.

## Project commands

- Install dependencies: `npm install`
- Start development: `npm run dev`
- Open the iOS simulator: `npm run ios`
- Format files: `npm run format`
- Run lint: `npm run lint`
- Check TypeScript: `npm run typecheck`
- Run tests: `npm run test`
- Validate Expo dependencies: `npm run doctor`
- Run the complete local gate: `npm run check`

Run `npm run check` before considering an implementation complete. Run `npm run doctor` after dependency or Expo configuration changes.

## Documentation

- Keep `docs/PRODUCT.md` focused on stable product intent.
- Keep implementation details out of product documentation.
- Add decisions to `docs/DECISIONS.md` only when they should guide future work.
- Update commands and verification steps here once the stack is selected.
