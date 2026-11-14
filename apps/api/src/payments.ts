import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentRequest } from '@king-david/contracts';

export interface VerifiedProviderEvent { id: string; provider: string; reference: string; providerReference: string; status: 'success' | 'failed' | 'expired' | 'pending'; amountPesewas: number; currency: string; verifiedAt: string }
export interface PaymentAdapter {
  name: string;
  initialize(payment: PaymentRequest, email: string): Promise<{ checkoutUrl: string; providerReference?: string }>;
  authenticate(raw: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parse(raw: Buffer): { id: string; reference: string; type: string } | null;
  verify(reference: string): Promise<VerifiedProviderEvent>;
}
export class UnverifiedProvider implements PaymentAdapter {
  constructor(public name: string) {}
  private blocked(): never { throw new Error(`${this.name} is intentionally disabled: confirm current merchant API credentials, signature scheme, supported Ghana networks, settlement and refund semantics before implementing and testing this adapter.`); }
  async initialize(): Promise<never> { return this.blocked(); }
  authenticate(): boolean { return false; }
  parse(): null { return null; }
  async verify(): Promise<never> { return this.blocked(); }
}
async function paystackRequest(path: string, secret: string, method = 'GET', body?: unknown) {
  const response = await fetch(`https://api.paystack.co${path}`, { method, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000), redirect: 'error' });
  const data = await response.json();
  if (!response.ok || !data.status) throw new Error(`Provider verification unavailable (${response.status})`);
  return data.data;
}
/** Reference adapter, not a claim of merchant activation. Live values/networks require sandbox + production acceptance tests. */
export class PaystackAdapter implements PaymentAdapter {
  name = 'paystack';
  constructor(private secret: string, private webhookSecret: string, private callbackUrl: string) {}
  async initialize(payment: PaymentRequest, email: string) {
    const data = await paystackRequest('/transaction/initialize', this.secret, 'POST', { email, amount: payment.amountPesewas, currency: 'GHS', reference: payment.reference, callback_url: this.callbackUrl, metadata: { internal_reference: payment.reference, purpose: payment.purpose } });
    if (typeof data.access_code !== 'string') throw new Error('Provider did not return a hosted checkout code.');
    // Never trust a provider-supplied arbitrary redirect host.
    return { checkoutUrl: `https://checkout.paystack.com/${encodeURIComponent(data.access_code)}`, providerReference: String(data.reference || payment.reference) };
  }
  authenticate(raw: Buffer, headers: Record<string, string | string[] | undefined>) {
    const signature = headers['x-paystack-signature'];
    if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature)) return false;
    const expected = createHmac('sha512', this.webhookSecret).update(raw).digest();
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  }
  parse(raw: Buffer) {
    const value = JSON.parse(raw.toString('utf8'));
    if (typeof value.event !== 'string' || typeof value.data?.reference !== 'string') return null;
    return { id: `${value.event}:${value.data.id ?? value.data.reference}`, reference: value.data.reference, type: value.event };
  }
  async verify(reference: string): Promise<VerifiedProviderEvent> {
    const data = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`, this.secret);
    if (data.reference !== reference || !Number.isSafeInteger(data.amount)) throw new Error('Provider verification reference/amount invalid.');
    return { id: `verified:${reference}`, provider: this.name, reference, providerReference: String(data.id ?? reference), status: data.status === 'success' ? 'success' : data.status === 'failed' ? 'failed' : data.status === 'abandoned' ? 'expired' : 'pending', amountPesewas: data.amount, currency: data.currency, verifiedAt: new Date().toISOString() };
  }
}
export function paymentAdapter(provider: string, secret?: string, webhookSecret?: string, callbackUrl?: string): PaymentAdapter {
  if (provider === 'paystack' && secret && webhookSecret && callbackUrl) return new PaystackAdapter(secret,webhookSecret,callbackUrl);
  return new UnverifiedProvider(provider);
}
