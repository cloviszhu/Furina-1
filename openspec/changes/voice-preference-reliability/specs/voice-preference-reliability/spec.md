## ADDED Requirements

### Requirement: Preferred and effective voice separation
The application SHALL preserve the persisted preferred voice and emotion during temporary list absence or service failure and SHALL show a temporary fallback separately. A successful refresh SHALL restore an available preferred voice without synthesizing audio.

#### Scenario: Temporary absence and recovery
- **WHEN** the selected profile is missing or the service temporarily fails and then recovers
- **THEN** storage retains preference and the next successful refresh restores it

#### Scenario: User selects a replacement while waiting
- **WHEN** a user explicitly selects another voice during an outstanding list request
- **THEN** the new selection becomes preferred and delayed responses do not restore the old preference

### Requirement: Confirmed deletion boundary
The application SHALL distinguish confirmed profile or emotion deletion from temporary unavailability using existing deletion metadata/notifications. Restoring a registration SHALL NOT overwrite the user's later preferred selection.

#### Scenario: Remove and restore a profile
- **WHEN** a user confirms removal and later restores a profile
- **THEN** the removed preference is cancelled and an intervening preferred choice remains selected

### Requirement: Origin explanation without automatic actions
The application SHALL explain ordinary preferences are separated by host/profile and recommend a fixed entry. It SHALL NOT migrate user storage, navigate automatically, read a key, enable real mode or synthesize audio for this repair.

#### Scenario: Different localhost origin
- **WHEN** a user reads settings on localhost or 127.0.0.1
- **THEN** the hint explains independent preferences without changing origin or credential source
