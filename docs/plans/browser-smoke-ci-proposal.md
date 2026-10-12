# Browser smoke test CI proposal

Implemented for 0.6.0 in the `browser` job of `.github/workflows/check.yml`. This document retains the rationale; the workflow and `playwright.config.ts` are authoritative for the current setup.

The Playwright smoke suite belongs in a separate CI job so routing and real-worker startup failures are visible without slowing the existing unit-test job. `tests/browser/routing.spec.ts` should run against a production preview (`npm run build` followed by the `preview` web server in `playwright.config.ts`), not Vite HMR. CI should use Playwright's pinned Chromium; local configuration may use `/usr/bin/chromium` when present.

Proposed job steps for `.github/workflows/check.yml`:

```yaml
browser-smoke:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: npm
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: npm run build
    - run: npm run test:browser
```

The Playwright config should own preview startup and teardown with a bounded startup timeout. The suite verifies the real layout and nested ELK workers load successfully, then exercises no-op segment clicks, return-to-origin drags, Escape, and pointer cancellation in isolated pages. Keep browser retries at zero or one and retain traces only on failure to avoid hiding nondeterministic gesture regressions.
