import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const routes = ['/', '/stay', '/events', '/book', '/guest', '/contact', '/location', '/experiences', '/policies', '/admin', '/admin/enquiries', '/admin/calendar', '/admin/quotes', '/admin/operations', '/admin/rooms', '/admin/finance', '/admin/tasks', '/admin/content', '/admin/audit', '/admin/settings'];
async function savedState(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('king-david-demo-v2') || '{}')); }
async function closeTopDialog(page: Page) { await page.getByRole('dialog').last().getByRole('button', { name: 'Close dialog', exact: true }).click(); }

test('public and staff routes hydrate without errors or horizontal overflow', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const route of routes) {
    await page.goto(route); await expect(page.locator('h1').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), route).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('WCAG A/AA automated checks on public and staff screens', async ({ page }) => {
  test.setTimeout(180000);
  for (const route of routes) {
    await page.goto(route); await expect(page.locator('h1').first()).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), route).toEqual([]);
  }
});

test('stay enquiry → hold → quote → approval → acceptance → deposit → confirmation → rooming', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`/book?start=${future(20)}&end=${future(22)}&guests=2`);
  await page.getByRole('button', { name: 'Continue to your details' }).click();
  await page.getByLabel('Full name', { exact: true }).fill('E2E Test Guest');
  await page.getByLabel('Email address', { exact: true }).fill('e2e@example.invalid');
  await page.getByLabel('Phone number', { exact: true }).fill('+233000000000');
  await page.getByRole('button', { name: 'Review your enquiry' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save demo enquiry' }).click();
  await expect(page.getByText('DEMO ENQUIRY SAVED · NOT A RESERVATION')).toBeVisible();
  let state = await savedState(page); const enquiry = state.enquiries.find((e: { name: string }) => e.name === 'E2E Test Guest');
  expect(enquiry.reference).toMatch(/^KD-DEMO-/); expect(state.allocations.filter((a: { requestId: string }) => a.requestId === enquiry.id)).toHaveLength(0);
  await page.getByRole('link', { name: 'Open staff workflow' }).click();
  await page.getByRole('button', { name: /Place a temporary hold/ }).click();
  await page.getByRole('button', { name: 'Create demo hold' }).click();
  await expect(page.getByRole('button', { name: /Temporary hold active/ })).toBeDisabled();
  await page.getByRole('button', { name: /Prepare an itemised quote/ }).click();
  await page.getByLabel('Line description').fill('Two room nights · E2E demo');
  await page.getByLabel('Qty', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save draft proposal' }).click();
  await closeTopDialog(page);
  await page.goto('/admin/quotes');
  const row = page.getByRole('row').filter({ hasText: 'E2E Test Guest' });
  await row.getByRole('button', { name: 'Submit', exact: true }).click();
  await row.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('button', { name: 'Approve this version' }).click();
  await expect(row.getByText('approved', { exact: true })).toBeVisible();
  await page.goto(`/guest?reference=${enquiry.reference}`);
  await page.getByRole('button', { name: 'Review & accept demo proposal' }).click();
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Accept demo version 1' }).click();
  await page.getByRole('button', { name: 'Create demo deposit request' }).click();
  await page.getByRole('button', { name: 'Create request · no charge' }).click();
  await expect(page.getByText('created · demo', { exact: true })).toBeVisible();
  state = await savedState(page); const payment = state.payments.find((p: { enquiryId: string }) => p.enquiryId === enquiry.id);
  expect(payment.status).toBe('created');
  await page.goto('/admin/finance');
  await page.getByLabel('Simulate staff role').selectOption('finance');
  await page.getByRole('row').filter({ hasText: 'E2E Test Guest' }).getByRole('button', { name: 'Inspect' }).click();
  await page.getByRole('button', { name: 'success', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('provider confirmed', { exact: true }).first()).toBeVisible();
  await closeTopDialog(page);
  await page.goto('/admin/quotes');
  await page.getByRole('row').filter({ hasText: 'E2E Test Guest' }).getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm demo inventory' }).click();
  await expect(page.getByText('Confirmed · commercial contract frozen')).toBeVisible();
  await page.goto(`/guest?reference=${enquiry.reference}`);
  await page.getByRole('button', { name: 'Add a named guest' }).click();
  await page.getByLabel('Guest’s full name').fill('Named E2E Guest');
  await page.getByLabel('Guest email', { exact: true }).fill('named@example.invalid');
  await page.getByRole('button', { name: 'Save named guest' }).click();
  await expect(page.getByText(/^Named E2E Guest/)).toBeVisible();
  state = await savedState(page);
  expect(state.enquiries.find((e: { id: string }) => e.id === enquiry.id).status).toBe('confirmed');
  expect(state.blocks.find((b: { enquiryId: string }) => b.enquiryId === enquiry.id).pickup).toBe(1);
  expect(state.payments.find((p: { id: string }) => p.id === payment.id).status).toBe('provider_confirmed');
  expect(errors).toEqual([]);
});

test('event enquiry validates capacity and remains unreserved', async ({ page }) => {
  await page.goto('/events#enquire');
  await page.getByLabel('Estimated attendance').fill('500');
  await page.getByLabel('Event start date').fill(future(25));
  await page.getByLabel('Event end date').fill(future(25));
  await page.getByLabel('Your full name').fill('E2E Event Guest');
  await page.getByLabel('Email address', { exact: true }).fill('event@example.invalid');
  await page.getByLabel(/Phone number/).fill('+233000000000');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Save preview enquiry|Save demo enquiry|Send preview enquiry/ }).click();
  await expect(page.locator('.form-error[role="alert"]')).toContainText(/capacity/i);
  await page.getByLabel('Estimated attendance').fill('40');
  await page.getByRole('button', { name: /Save preview enquiry|Save demo enquiry|Send preview enquiry/ }).click();
  await expect(page.getByText('YOUR PREVIEW ENQUIRY IS SAVED')).toBeVisible();
  const state = await savedState(page); const e = state.enquiries.find((x: { name: string }) => x.name === 'E2E Event Guest');
  expect(e.kind).toBe('event'); expect(state.allocations.filter((a: { requestId: string }) => a.requestId === e.id)).toHaveLength(0);
});

test('mobile navigation, keyboard dialog dismissal and reduced motion work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/'); await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Rooms & stays' }).click();
  await expect(page).toHaveURL(/\/stay$/);
  await page.goto('/admin'); await page.getByRole('button', { name: 'Toggle workspace navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Toggle workspace navigation' })).toHaveAttribute('aria-expanded', 'false');
  await page.goto('/admin/tasks'); await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
});

test('storage failure is visible and does not fabricate a saved enquiry', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Test quota failure', 'QuotaExceededError'); }; });
  await page.goto('/book'); await expect(page.locator('.storage-alert[role="alert"]')).toContainText(/storage/i);
  await expect(page.getByRole('button', { name: 'Continue to your details' })).toBeDisabled();
});

test('simulated read-only role cannot approve a quote', async ({ page }) => {
  await page.goto('/admin/quotes'); await page.getByLabel('Simulate staff role').selectOption('readonly');
  await page.getByRole('row').filter({ hasText: 'Yaw Owusu' }).getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review & approve' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirm demo inventory' })).toHaveCount(0);
  await closeTopDialog(page);
  await page.getByRole('button', { name: 'Prepare proposal' }).click();
  await page.getByRole('button', { name: 'Continue to proposal' }).click();
  await page.getByRole('button', { name: 'Save draft proposal' }).click();
  await expect(page.locator('.admin-feedback.error')).toContainText(/permission/i);
});
