import { type Page, expect } from '@playwright/test';
import { DEMO_OWNER } from './env';

/** Signs in as the seeded clinic owner and waits for the dashboard shell.
 *  Through the login form, not a cookie shortcut: the session cookie is part
 *  of what these tests are here to prove. */
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail').fill(DEMO_OWNER.email);
  await page.getByLabel('Mot de passe').fill(DEMO_OWNER.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  // The sidebar only renders behind RequireAuth, so it is the honest signal.
  await expect(page.getByRole('link', { name: 'Messages' })).toBeVisible();
}
