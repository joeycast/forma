# Package installation qualification

Qualified the packed `forma-diagrams@0.5.3` tarball from the current production build on Linux with Node `v24.19.0` and npm `11.9.0`. The README requires Node.js 22 or newer; Node 22 itself was not available in this environment, so this run does not independently qualify that exact runtime. No publish was performed.

The following commands packed without lifecycle scripts, installed into an isolated prefix, and placed npm's cache under `/tmp`:

```sh
mkdir -p /tmp/forma-package-qualification/tarballs /tmp/forma-package-qualification/prefix
NPM_CONFIG_CACHE=/tmp/forma-npm-cache npm pack --ignore-scripts \
  --pack-destination /tmp/forma-package-qualification/tarballs .
NPM_CONFIG_CACHE=/tmp/forma-npm-cache npm install \
  --prefix /tmp/forma-package-qualification/prefix \
  --cache /tmp/forma-npm-cache --ignore-scripts \
  /tmp/forma-package-qualification/tarballs/forma-diagrams-0.5.3.tgz
```

The tarball contained 125 files (3.5 MB compressed). Installation added 172 packages and succeeded. `NPM_CONFIG_CACHE` was set in addition to `--cache` so npm did not fall back to the unavailable default cache directory in this environment.

From the repository root, installed CLI smoke checks passed:

```sh
/tmp/forma-package-qualification/prefix/node_modules/.bin/forma --help
/tmp/forma-package-qualification/prefix/node_modules/.bin/forma validate examples/gallery/development.forma.json
/tmp/forma-package-qualification/prefix/node_modules/.bin/forma render \
  examples/gallery/development.forma.json --output /tmp/forma-package-qualification/installed.svg
/tmp/forma-package-qualification/prefix/node_modules/.bin/forma export \
  examples/gallery/development.forma.json --output /tmp/forma-package-qualification/installed.png
```

Help listed the documented command set. Validation returned `ok: true`, version 2, 10 nodes, 10 edges, and 2 groups. Both exports returned `ok: true` with zero inspection errors or warnings. The SVG opened as XML/SVG (1210 × 929); the PNG opened as 8-bit RGBA PNG (2420 × 1858), consistent with the documented 2× export scale.

The package-root TypeScript API imported with the documented Node `--import tsx` loader from the isolated install prefix:

```sh
cd /tmp/forma-package-qualification/prefix
node --import tsx --input-type=module -e '
  import { parseDocument, layoutDiagram, renderSvg } from "forma-diagrams";
  const doc = parseDocument({version:1,title:"package-api",nodes:[{id:"a",label:"A"}],edges:[]});
  const scene = await layoutDiagram(doc);
  console.log(JSON.stringify({nodes:scene.nodes.length,svg:renderSvg(scene).startsWith("<svg")}));
'
```

It returned `{"nodes":1,"svg":true}`.

The installed `forma serve --directory /tmp/forma-package-qualification/library --port 42887` started and served the editor over loopback. `GET /` returned HTTP 200 with the packaged HTML. Its script loaded the built editor bundle, which references the layout worker; requests for both `assets/layout.worker-B22imDT9.js` and `assets/elk-worker.min-C9JGDOE-.js` returned HTTP 200 with JavaScript content. The temporary server was stopped after these checks.

This was a package/CLI/editor-asset smoke qualification, not a full test suite or a Node 22 run. Node 22+ is the declared supported runtime; behavior on other operating systems was not tested.
