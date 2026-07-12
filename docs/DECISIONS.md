# Decision Log

Record only decisions that should guide future work.

## Template

### YYYY-MM-DD - Decision title

- **Status:** proposed | accepted | superseded
- **Context:** why a decision is needed
- **Decision:** what was chosen
- **Consequences:** important tradeoffs or follow-up work

## Decisions

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
