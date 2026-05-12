# Security Specification - Fiber Design Project

## Data Invariants
- A Project MUST have a unique `ownerId` matching the authenticated user.
- A Project MUST contain `cables`, `networkEquipments`, `connections`, and `workZones` arrays.
- Projects are isolated by `ownerId`. No public access.

## The "Dirty Dozen" Payloads (Denial Expected)
1. **Identity Spoofing**: Create a project with someone else's `ownerId`.
2. **Identity Privilege Escalation**: Update a project to change `ownerId` to yourself (orphan snatching).
3. **Malicious Content**: Inject a 2MB string into `name` to cause resource exhaustion.
4. **Schema Violation**: Missing `cables` array during creation.
5. **Timestamp Fraud**: Setting `createdAt` to a future date instead of `request.time`.
6. **Immutable Breach**: Attempting to change `createdAt` during an update.
7. **Unauthorized Read**: Attempting to `get` a project document owned by another user.
8. **Unauthorized List**: Attempting to `list` all projects without filtering by `ownerId`.
9. **Invalid ID**: Using an ID with special characters like `/` or `..`.
10. **Resource Poisoning**: Adding a 1MB string as a key in a map.
11. **Type Mismatch**: Sending a string for `cables` instead of an array.
12. **Missing Invariant**: Creating a project without a name.

## Test Runner Logic
- `test('Deny projects with different ownerId on create', ...)`
- `test('Deny project update changing ownerId', ...)`
- `test('Deny project read if not owner', ...)`
- `test('Allow project CRUD if owner and schema valid', ...)`
