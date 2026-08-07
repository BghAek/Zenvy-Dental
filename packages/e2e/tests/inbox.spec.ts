import { expect, test } from '@playwright/test';
import { login } from '../support/dashboard';
import { receiveWhatsAppMessage } from '../support/whatsapp';

// S2-2/S2-5: a patient writes on WhatsApp, the thread reaches the inbox, the
// secretary takes the conversation off the assistant and answers. The reply
// only renders once the API has accepted it from Meta's send endpoint, so this
// covers the full round trip.
test('an inbound WhatsApp message is taken over and answered', async ({ page }) => {
  const run = Date.now();
  // Unique per run: the thread is found by what the patient wrote, which holds
  // even when the hourly patient-creation cap leaves the contact unlinked.
  const question = `Bonjour, avez-vous une disponibilité cette semaine ? (E2E ${run})`;
  const answer = `Bonjour, nous avons un créneau jeudi à 14h30. (E2E ${run})`;

  await login(page);
  await receiveWhatsAppMessage({
    from: `3361${String(run).slice(-8)}`,
    name: 'Camille Testeur',
    text: question,
  });

  await page.goto('/inbox');
  // The list polls every 5s; the message travels through Redis on the way.
  const thread = page.getByRole('button').filter({ hasText: `E2E ${run}` });
  await expect(thread).toBeVisible({ timeout: 30_000 });
  await thread.click();
  // Scoped to the thread: the same text also sits in the list's preview line.
  const messages = page.getByTestId('message-list');
  await expect(messages.getByText(question)).toBeVisible();

  // With no OPENAI_API_KEY the assistant stays silent, so the thread is still
  // on AI when the secretary decides to answer herself.
  await page.getByRole('button', { name: 'Prendre la main' }).click();
  await expect(page.getByRole('button', { name: "Rendre la main à l'IA" })).toBeVisible();

  await page.getByPlaceholder('Écrivez votre message...').fill(answer);
  await page.getByRole('button', { name: 'Envoyer' }).click();
  // Rendered only once the API accepted it from Meta's send endpoint.
  await expect(messages.getByText(answer)).toBeVisible();
});
