import { z } from 'zod';

export const serverConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  API_ORIGIN: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  AUTH_ISSUER: z.string().url(),
  AUTH_AUDIENCE: z.string().min(1),
  AUTH_JWKS_URL: z.string().url(),
  PAYMENT_PROVIDER: z.enum(['disabled', 'hubtel', 'paystack', 'flutterwave']).default('disabled'),
  PAYMENT_PUBLIC_KEY: z.string().optional(),
  PAYMENT_SECRET_KEY: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
}).superRefine((v, ctx) => {
  if (v.PAYMENT_PROVIDER !== 'disabled') {
    for (const key of ['PAYMENT_PUBLIC_KEY', 'PAYMENT_SECRET_KEY', 'PAYMENT_WEBHOOK_SECRET'] as const) {
      if (!v[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Required when payments are enabled. Merchant eligibility must also be verified.' });
    }
  }
  if (v.NODE_ENV === 'production') {
    for (const key of ['API_ORIGIN', 'WEB_ORIGIN', 'AUTH_ISSUER', 'AUTH_JWKS_URL'] as const) {
      if (!v[key].startsWith('https://')) ctx.addIssue({ code: 'custom', path: [key], message: 'HTTPS required in production' });
    }
  }
});
export function parseServerConfig(env: Record<string, string | undefined>) {
  const result = serverConfigSchema.safeParse(env);
  if (!result.success) throw new Error(`Invalid server configuration: ${result.error.issues.map(i => i.path.join('.')).join(', ')}`);
  return result.data;
}
export const DEMO_TENANT = '00000000-0000-4000-8000-000000000001';
export const DEMO_PROPERTY = '10000000-0000-4000-8000-000000000001';
