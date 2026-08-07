import { expect, test } from '@playwright/test';
import { login } from '../support/dashboard';
import { DEMO_PATIENT } from '../support/env';

/** `yyyy-MM-ddTHH:mm` for a datetime-local input, days from today at 10h00.
 *  Far enough ahead that both reminders are still in the future (S2-4). */
function inDays(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return `${date.toISOString().slice(0, 10)}T10:00`;
}

// S2-4/S3-2: booking is what writes the schedule — two ScheduledMessage rows
// per appointment, both pending until the sender sweeps them.
test('booking an appointment schedules its 24h and 2h reminders', async ({ page }) => {
  await login(page);
  await page.goto('/appointments/new');

  await page.getByLabel('Patient').selectOption({ label: DEMO_PATIENT });
  await page.getByLabel('Date et heure').fill(inDays(3));
  await page.getByLabel("Type d'acte").fill('Détartrage E2E');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page).toHaveURL(/\/appointments\/[^/]+$/);
  await expect(page.getByText('Détartrage E2E')).toBeVisible();
  await expect(page.getByText('Rappel 24h')).toBeVisible();
  await expect(page.getByText('Rappel 2h')).toBeVisible();
  // Both are waiting for the sender, neither has fired.
  await expect(page.getByText(/— En attente$/)).toHaveCount(2);
});
