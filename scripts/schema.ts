import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import { documentSchema } from '../packages/core/src/document';
writeFileSync(
  new URL('../schema/forma.v1.schema.json', import.meta.url),
  JSON.stringify(z.toJSONSchema(documentSchema), null, 2) + '\n',
);
