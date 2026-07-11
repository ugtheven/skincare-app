# AI-Assisted Development Workflow

Use this loop for each meaningful feature or change.

## 1. PLAN

- Restate the user outcome.
- Read the relevant product and code context.
- Define the smallest useful scope.
- List acceptance criteria and meaningful risks.
- Ask only for decisions that materially change the result.

## 2. STEP

- Implement one coherent slice.
- Follow existing conventions.
- Keep the diff focused.
- Add or update tests in proportion to risk.

## 3. REVIEW

- Inspect the complete diff.
- Check behavior, edge cases, privacy, accessibility, and V1 scope.
- Run the relevant formatter, type checks, tests, and build.
- For UI work, verify representative mobile sizes visually.

## 4. FIX

- Resolve review findings.
- Re-run affected checks.
- Avoid unrelated cleanup.

## 5. NEXT

- Summarize the completed outcome.
- State verification and remaining risks.
- Update durable documentation when needed.
- Identify the next smallest useful slice.

## Prompt template

Use this structure when starting a feature:

```text
Goal:
User outcome:
In scope:
Out of scope:
Acceptance criteria:
Constraints or references:
```

## Definition of done

A change is done when:

- acceptance criteria are met;
- relevant automated checks pass;
- the diff has been reviewed;
- privacy and accessibility implications were considered;
- documentation reflects any durable decision;
- known limitations are stated clearly.
