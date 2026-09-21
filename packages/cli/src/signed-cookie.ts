import { createHmac, timingSafeEqual } from 'node:crypto';
import { z, type ZodType } from 'zod';

export function signCookie(secret: string, payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyCookie<T>(secret: string, value: string | undefined, schema: ZodType<T>) {
  if (!value) return null;
  const split = value.lastIndexOf('.');
  if (split < 1) return null;
  const body = value.slice(0, split),
    mac = value.slice(split + 1);
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  if (expected.length !== mac.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(mac)))
    return null;
  try {
    return schema.parse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')));
  } catch {
    return null;
  }
}

export const sessionCookieSchema = z.object({
  identity: z.object({
    sub: z.string(),
    email: z.string().optional(),
    email_verified: z.boolean().optional(),
    name: z.string().optional(),
    hd: z.string().optional(),
  }),
  expires: z.number(),
});
export const loginCookieSchema = z.object({
  state: z.string(),
  verifier: z.string(),
  nonce: z.string(),
  challenge: z.string(),
  expires: z.number(),
});
