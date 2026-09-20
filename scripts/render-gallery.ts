import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { parseDocument, layoutDiagram, renderSvg, inspectScene } from '../packages/core/src';
await mkdir('docs/images/gallery', { recursive: true });
await mkdir('output', { recursive: true });
const fontFiles = ['public/fonts/IBMPlexSans-Regular.ttf', 'public/fonts/IBMPlexSans-SemiBold.ttf'];
const fonts = await Promise.all(fontFiles.map((f) => readFile(f)));
for (const file of (await readdir('examples/gallery')).filter((f) => f.endsWith('.json'))) {
  const scene = await layoutDiagram(
    parseDocument(JSON.parse(await readFile(`examples/gallery/${file}`, 'utf8'))),
  );
  const svg = renderSvg(scene, {
    fontDataUri: `data:font/ttf;base64,${fonts[0].toString('base64')}`,
    boldFontDataUri: `data:font/ttf;base64,${fonts[1].toString('base64')}`,
  });
  const name = file.replace('.forma.json', '');
  await writeFile(`output/${name}.svg`, svg);
  await writeFile(
    `docs/images/gallery/${name}.png`,
    new Resvg(svg, {
      font: { fontFiles, loadSystemFonts: false },
      fitTo: { mode: 'width', value: 1400 },
    })
      .render()
      .asPng(),
  );
  console.log(name, JSON.stringify(inspectScene(scene)));
}
