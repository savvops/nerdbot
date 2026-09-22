# Convex chat sync preview

The shared mobile/extension UI uses the Nerdbot Convex development deployment (`decisive-puma-800`, team `savvops-ai`). `VITE_CONVEX_URL` and deployment selection live in ignored `.env.local`. Never ship a Convex admin/deploy key to a client. The frontend receives only the public deployment URL.

## Using it

Choose **Sign in to sync**, create an email/password account, then sign into the same account on your other device. A Convex dashboard login is separate from a Nerdbot user account. Passwords require 12–128 characters. Signed-in History includes active conversations and project-folder metadata from every device; opening a conversation on one device does not force other devices to switch views.

**Import this device's chats and projects** copies existing device-only text conversations, project-folder metadata and pins to the signed-in account after confirmation. Chat-to-project assignments are retained. The original storage keys are preserved. Provider keys/settings, attachments, knowledge documents/vector chunks and personas remain local; only project names, emoji, descriptions and system prompts synchronize.

## Persistence and conflict handling

- Convex Auth supplies account sessions and scrypt password hashing; every sync query/mutation derives ownership from authentication, never a client-supplied user ID.
- Chat metadata and messages use separate documents; unchanged messages are not rewritten. Completed message text is queued locally. Streaming drafts remain local until complete.
- IndexedDB holds an account/deployment-scoped cache and durable outbox. A browser lock serializes cache operations across extension panels. Retrying an operation uses the same ID; mutation receipts prevent duplicate writes after a lost acknowledgement.
- A realtime per-account sequence triggers incremental paginated pulls (25 changes/page), including deletions and pins. Idle clients do not poll Convex. Pending changes retry every five seconds while the UI is open and on reconnect. Closing all UIs pauses syncing until one reopens.
- Revision conflicts create a separate conversation, preserving both edits. A stale deletion keeps the newer remote version and asks the user to delete again. Deleted local chats are archived in the account cache; cloud tombstones prevent stale devices from silently resurrecting them.
- Text sync is limited to 1,000 messages and a 500,000-character serialized chat payload (150,000 characters/message). Oversized chats remain local with a sync error. Local storage failures are surfaced rather than claiming a successful save.

## Validation

`npm run test:sync` exercises unauthenticated rejection, cross-account isolation, duplicate requests, simultaneous edits, stale deletions, pin tombstones, pagination beyond 30 chats, offline/reload outbox recovery, streaming exclusion and in-flight edits. `npm run test:integrations` and `node scripts/verify-mobile-startup.mjs` cover the existing app/bridge behavior. `npm run build` type-checks and builds the extension/mobile bundle.

September 22: real email/password registration and sign-in succeeded against Convex in isolated browser profiles. A synthetic local conversation was imported in a web session, read in a second independent web session and a loaded Chrome extension, and deletion propagated back from the extension. Mobile layout was inspected at 390×844. No user passwords, provider keys or real conversations were used in these checks.

## Before public release

This is a development preview, not a completed public account service. Add email verification and password reset (requires a transactional-email provider), account export/erasure, signup/usage quotas, production deployment and release monitoring. Google OAuth needs separate credentials if selected. Cloud chat storage is not end-to-end encrypted. Update Chrome Store privacy disclosures before publishing; current local preview does not publish a Store release. The mobile host and AI proxy still run on Legion; cloud chat sync itself connects directly to Convex.

## Deployment

Run `node scripts/configure-convex-auth.mjs` once per deployment to set signing keys without printing secrets. It preserves an existing complete key pair. Deploy backend changes with `npx convex dev --once` for this preview. Build frontend using the same deployment's URL.

Legion mobile serves `projects/personal/nerdbot/dist`; Brave actually loads `projects/extentions/nerdbot/dist`. Archive and update both paths and verify hashes. Keep old hashed assets for already-open tabs. A Brave extension reload is required after deploying files; mobile gets the new HTML on refresh. Do not replace these paths with the similarly named source folder without checking Brave's installed extension path.

September 22 preview deployment: both Legion build folders were backed up and updated; all 22 build files matched the local SHA-256 manifest. The running mobile server was confirmed to serve the final `mobile-CZNaaz3O.js` entry. The final build includes account-switch guards on queued chat/pin writes. Backend deployment, seven sync tests, production build, existing integrations and mobile startup checks passed. Reload Brave's extension and refresh mobile to activate the frontend update. Registration creates a separate Nerdbot user account; the Convex dashboard account is not automatically a Nerdbot sign-in.
