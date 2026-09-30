## Why
Temporary missing or failed voice lists overwrite persisted ordinary voice preferences with fallback values, requiring users to reconfigure. Explicit deletion must remain distinct from temporary absence.

## What Changes
- Persist preferred voice/emotion separately from the effective selection; recover on refresh without synthesis.
- Respect user changes, confirmed deletion, restoration, and latest asynchronous list results.
- Explain temporary fallback and origin-separated ordinary settings, without storage migration or navigation.

## Capabilities
### New Capabilities
- `voice-preference-reliability`: preserve ordinary voice preference through temporary service/list failures.

### Modified Capabilities

## Impact
Frontend settings, voice-list refresh and existing reference-management notifications only. No credential, paid-provider, production data, budget, or stage changes. Isolated fixtures; commit for review before deployment.
