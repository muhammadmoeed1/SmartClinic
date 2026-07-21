import { test, expect } from '@playwright/test';

/**
 * The deeper happy path: a patient books an appointment end-to-end. Uses the
 * manual doctor/specialty picker rather than the AI recommender, since the
 * AI path depends on AI_API_KEY being configured — the manual path always
 * works, keeping this test deterministic in CI.
 *
 * Picks a near-future date rather than relying on "today": the backend only
 * treats a slot as available when its start time is strictly in the future
 * (`start > new Date()`), and the clinic's last slot starts at 16:30 — so
 * "today" legitimately has zero available slots whenever the suite happens
 * to run after 16:30 server-local time. That's correct app behavior (no
 * booking into the past), not something to work around in the app; the test
 * just needs a date where availability doesn't depend on the current clock.
 */
function futureDateStr(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('patient can book an appointment via the manual picker', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('patient@smartclinic.test');
  await page.getByLabel('Password').fill('Password1!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.getByRole('button', { name: 'Book an appointment' }).click();
  await expect(page).toHaveURL(/\/patient\/book/);

  await page.getByRole('button', { name: 'Choose manually instead' }).click();
  await page.getByLabel('Specialty').selectOption({ label: 'General Practice' });

  const firstDoctorCard = page.locator('.doctor-card').first();
  await expect(firstDoctorCard).toBeVisible({ timeout: 10_000 });
  await firstDoctorCard.getByRole('button', { name: 'Select' }).click();

  await page.getByLabel('Date').fill(futureDateStr(2));

  const openSlot = page.locator('.slot:not(.slot--taken)').first();
  await expect(openSlot).toBeVisible({ timeout: 10_000 });
  await openSlot.click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Confirm booking' }).click();

  await expect(page.getByRole('heading', { name: 'Appointment booked' })).toBeVisible({ timeout: 10_000 });
});
