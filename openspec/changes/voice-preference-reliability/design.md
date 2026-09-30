## Context
The voice dropdown previously served as both effective playback choice and persisted preference. A missing preferred option caused default fallback to overwrite storage during boot and ordinary changes.

## Goals / Non-Goals
Preserve the user's preferred voice and emotion without a settings schema migration. Explain fallback, respect explicit changes/removal, reject stale list responses. No automatic synthesis, saved-key use, real-mode activation, cross-origin storage transfer or page redirect.

## Decisions
Keep existing persisted voice/emotion fields as preferred values and use the dropdown as effective selection. A temporary missing voice selects an available local neural fallback without changing preferred values. Restore availability on explicit refresh/ordinary list update. Direct selection replaces preference; existing confirmed deletion metadata cancels the removed preference and stores the valid replacement. Restoring a registration does not revert a later selection. Failed deletion metadata reads cannot assert removal. Guard asynchronous list publication so older responses cannot overwrite newer choices. Origin explanation is a static settings hint and documentation.

## Risks / Trade-offs
Deleted-registration detection adds a read of existing nonsecret deletion metadata to voice refresh. Unavailable metadata retains preference conservatively until a later successful refresh. First available local neural voice remains the default when no preference exists. Browser/system voice identities remain intentionally nonpersistent. Live production dist is untouched until review authorizes deployment.
