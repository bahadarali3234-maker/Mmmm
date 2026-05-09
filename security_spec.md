# Security Specification for Humsafar AI

## Data Invariants
1. Chat history belongs to the user who created it.
2. Users can only read and write their own chat history.
3. User profiles can only be managed by the owner.
4. Timestamps must be valid and text fields must be size-constrained.

## The Dirty Dozen Payloads

1. **Identity Spoofing**: Attempt to create a chat turn with someone else's `userId`.
2. **Access Violation**: Attempt to read another user's chat history.
3. **Ghost Field**: Attempt to add a `isVerified: true` field to a user profile.
4. **Huge Payload**: Attempt to send a 2MB string in the `text` field.
5. **Timestamp Fraud**: Attempt to send a future timestamp instead of `serverTimestamp()`.
6. **Role Escalation**: Attempt to set `role: 'admin'` (not in enum).
7. **Invalid ID**: Attempt to use `.../chat_history/../../../secrets` as an ID.
8. **Shadow Update**: Attempt to change `userId` of an existing turn.
9. **Blanket Query**: Attempt to query `chat_history` without a `userId` filter.
10. **Terminal State Break**: Attempt to modify a turn after it's been saved (turns should be immutable).
11. **PII Leak**: Attempt to list all user profiles.
12. **Malicious ID**: Attempt to create a document with a 2KB ID string.

## Test Runner (Logic)
The following rules enforce that all above payloads are blocked.
