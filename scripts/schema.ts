import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import { documentSchema } from '../packages/core/src/document';
writeFileSync(
  new URL('../schema/forma.v2.schema.json', import.meta.url),
  JSON.stringify(z.toJSONSchema(documentSchema.extend({ version: z.literal(2) })), null, 2) + '\n',
);

import { designSystemSchema } from '../packages/core/src/styles';
writeFileSync(
  new URL('../schema/design-system.v1.schema.json', import.meta.url),
  JSON.stringify(z.toJSONSchema(designSystemSchema), null, 2) + '\n',
);
