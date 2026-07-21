import { test, expect } from '@playwright/test';

/**
 * The deeper happy path: a patient books an appointment end-to-end. Uses the
 * manual doctor/specialty picker rather than the AI recommender, since the
 * AI path depends on AI_API_KEY being configured — the manual path always
 * works, keeping this test deterministic in CI.
 */
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

  const openSlot = page.locator('.slot:not(.slot--taken)').first();
  await expect(openSlot).toBeVisible({ timeout: 10_000 });
  await openSlot.click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Confirm booking' }).click();

  await expect(page.getByRole('heading', { name: 'Appointment booked' })).toBeVisible({ timeout: 10_000 });
});
