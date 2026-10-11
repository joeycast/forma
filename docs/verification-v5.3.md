# 0.5.3 distribution verification

Forma 0.5.3 is a distribution and dependency-security release. It makes the published `forma-diagrams` package the documented installation path, changes the GitHub release workflow to npm trusted publishing with stage-only permissions, updates `@modelcontextprotocol/sdk` to 1.32.1, and resolves the current `source-map-js` advisory through the lockfile. Engine and document behavior are unchanged from 0.5.2.

The release is validated with the full automated suite, production build, formatting check, zero reported npm audit vulnerabilities, package dry run, and a clean installation of the packed artifact. The staged package must be reviewed and approved with two-factor authentication on npm before it becomes the public `latest` version.
