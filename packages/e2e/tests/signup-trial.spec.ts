import { expect, test } from '@playwright/test';
import { API_BASE_PATH } from '@zenvy/shared';
import { createEmailVerificationToken } from 'better-auth/api';
import { BETTER_AUTH_SECRET } from '../support/env';

// S1-2: an empty browser to a live 14-day trial (docs/api/auth.md).
test('a dentist signs up, verifies, creates a clinic and lands on a trial', async ({ page }) => {
  const email = `e2e-signup-${Date.now()}@zenvy.test`;

  await page.goto('/register');
  await page.getByLabel('Nom complet').fill('Dr Camille Roussel');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill('MotDePasse123!');
  await page.getByRole('button', { name: "S'inscrire" }).click();
  await expect(page).toHaveURL(/\/verify-email$/);

  // v1 has no mail provider — mail/mailer.ts logs the message (docs/12) — so
  // the suite mints the token that e-mail would carry and follows the same
  // link. Same function, same secret as apps/api/src/auth/auth.ts.
  const token = await createEmailVerificationToken(BETTER_AUTH_SECRET, email);
  await page.goto(`${API_BASE_PATH}/auth/verify-email?token=${token}&callbackURL=/`);

  // Verified but clinic-less: RequireAuth routes to the onboarding wizard (S3-5).
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel('Nom du cabinet').fill('Cabinet Dentaire E2E');
  await page.getByLabel('Numéro de téléphone').fill('+33145887799');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page).toHaveURL(/\/onboarding\/whatsapp$/);

  // The trial that clinic creation started: 14 days, no card.
  await page.goto('/settings/subscription');
  await expect(page.getByText(/Il vous reste 14 jours d['’]essai gratuit/)).toBeVisible();
});
