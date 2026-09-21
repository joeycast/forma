# Hosted-mode verification

Verified during the 0.4.0 implementation on 2026-09-21.

## Automated checks

`npm run check` passes all 25 tests, TypeScript, and the production build. Formatting and schema-regeneration checks also pass. The suite runs the existing engine/CLI/local-library coverage and new hosted coverage. The hosted tests exercise:

- Google authorization URL identity scopes, callback, S256 challenge, state, and nonce.
- Browser-bound, single-use, expiring login attempts; provider failures and nonce mismatches fail closed.
- Verified email and explicit admission allowlists; Workspace admission uses the `hd` claim.
- Independent Alice/Bob libraries, denied cross-user reads/writes, and no absolute server paths in responses.
- Native saves, optimistic revision conflicts, external agent edits, and preserved server files.
- File and byte quotas; rejected writes do not create empty directories; simultaneous conflicting saves have only one winner.
- Logout, session expiry, unauthenticated API rejection, canonical Host enforcement, required Origin and custom mutation headers, secure production cookie attributes, and data-directory process locking.

The cryptographic ID-token verifier is Google's maintained library, not a custom implementation. Deterministic application tests inject an identity-provider boundary; they do not constitute a live Google consent exchange.

## Browser checks

A real browser used the compiled static editor and real hosted HTTP/file service through `tests/fixtures/hosted-preview.ts`. This fixture is visibly labeled **TEST PREVIEW · simulated identity provider**, alternates Alice and Bob, and is not included in release packages or reachable through `forma host`.

Alice signed in, saved `engineering/alice.forma.json`, edited its title, saved again, and exported a PNG successfully under the hosted content policy. The file was confirmed on disk. Restarting the server required sign-in again, then Alice's saved diagram could be reopened from Library. Signing out also returned another open workspace tab to the sign-in page. Bob's subsequent sign-in opened an empty library with the default example, without recovering Alice's private diagram. Signing back in as Alice restored access to Alice's file.

The sign-in page and hosted UI were inspected visually. Hosted mode uses server libraries and session-only design presets rather than local browser recovery. Existing local/static modes continue to use their previous storage behavior.

## Deployment boundary

The Docker build/start/restart/unauthenticated-API check passed in GitHub CI, alongside the Linux test/build checks. The npm release tarball was installed to an isolated prefix outside the repository; its hosted server served the editor and rejected unauthenticated library access, and its local CLI rendered a diagram with zero inspection errors/warnings. Compose and Caddy configuration validation are also included in CI. Docker is not installed on the development Mac, so local Node tests and isolated npm installs provide the local runtime verification.

A live deployment still needs the operator's Google Web OAuth client, consent configuration, allowlist, domain, TLS, and durable disk. No such credentials or host were supplied in this phase; live Google sign-in and public TLS issuance are not claimed as verified. The supplied Compose/Caddy configuration and [operator guide](self-hosting.md) document the steps.
