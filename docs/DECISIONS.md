# Decision Log

Record only decisions that should guide future work.

## Template

### YYYY-MM-DD - Decision title

- **Status:** proposed | accepted | superseded
- **Context:** why a decision is needed
- **Decision:** what was chosen
- **Consequences:** important tradeoffs or follow-up work

## Decisions

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
