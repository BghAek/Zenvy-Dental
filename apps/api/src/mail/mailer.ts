import { Logger } from '@nestjs/common';

// The single email seam: verification, password-reset, and staff-invite mails
// all go through here. No provider is decided yet (docs/12 has no email
// decision), so dev/v1 logs the full mail — the founder copies links from the
// API logs, and tests capture them by mocking this module.
// ponytail: log-only transport; plug a real provider (SMTP/Resend) into this
// one function before the first real clinic signs up.

const logger = new Logger('Mailer');

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  // Fail loud rather than leak live reset/invite links into production logs.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('No mail provider configured — sendMail must not log in production.');
  }
  logger.log(`[MAIL] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
}
