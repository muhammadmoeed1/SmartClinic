import { test, expect } from '@playwright/test';

/**
 * One happy-path smoke test per role: log in with the seeded demo account
 * and confirm landing on that role's own dashboard. Uses label/role/text
 * selectors throughout (the app has no data-testid attributes).
 */
const ACCOUNTS = [
  {
    role: 'Patient',
    email: 'patient@smartclinic.test',
    heading: 'Upcoming appointments',
    portalLabel: 'Patient portal',
  },
  {
    role: 'Doctor',
    email: 'dr.khan@smartclinic.test',
    heading: "Today's appointments",
    portalLabel: 'Doctor portal',
  },
  {
    role: 'Receptionist',
    email: 'reception@smartclinic.test',
    heading: 'Booking board',
    portalLabel: 'Receptionist portal',
  },
  {
    role: 'Admin',
    email: 'admin@smartclinic.test',
    heading: 'Clinic analytics',
    portalLabel: 'Administrator portal',
  },
];

for (const account of ACCOUNTS) {
  test(`${account.role} can log in and lands on their own dashboard`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password').fill('Password1!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('heading', { name: account.heading })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(account.portalLabel)).toBeVisible();
  });
}
