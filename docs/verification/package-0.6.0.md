# 0.6.0 local tarball smoke check

Qualified the `forma-diagrams@0.6.0` local test tarball on Linux with Node `v24.19.0` and npm `11.9.0`. The README and release notes require Node 22 or newer; Node 22 was unavailable, so this does not independently qualify Node 22. No npm publish or global install was used.

From `/workspace/forma`, the documented one-command local test was run with an isolated library directory and port:

```sh
NPM_CONFIG_CACHE=/tmp/forma-npm-cache npx --yes \
  --package /workspace/forma-review/local-test/forma-diagrams-0.6.0.tgz \
  forma serve --directory /tmp/forma-060-npx-check/diagrams --port 35073
```

The same cached npx install was first checked with `forma --help`; it reported version `0.6.0`. The npx cache contained `forma-diagrams@0.6.0`. `serve` started successfully and printed `http://127.0.0.1:35073`. `GET /` returned HTTP 200 with the packaged editor HTML. The packaged `layout.worker-B22imDT9.js` and `elk-worker.min-C9JGDOE-.js` assets each returned HTTP 200 with `text/javascript` content. The npx server, wrapper, and npm exec processes were stopped after the checks, and both test ports were confirmed closed.

This verifies the local tarball install and editor asset serving on Node 24. It is a smoke check, not a full test suite, and makes no Node 22 or other-OS runtime claim.
