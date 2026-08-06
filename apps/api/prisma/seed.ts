import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import { priceMicroEur } from '../src/ai/llm';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import type {
  ClinicOnboardingStatus,
  OnboardingRequestStatus,
  ScheduledMessageStatus,
  SubscriptionStatus,
} from '../src/generated/prisma/enums';
import { TEMPLATES } from '../src/whatsapp/templates';

// S4-4 demo seed: one command builds the whole sales demo. « Cabinet Dentaire
// Lumière » is a lived-in clinic for apps/web (patients, a fortnight of
// appointments either side of today, real WhatsApp threads, reminder rows);
// five more clinics give the owner portal something to operate — subscriptions
// in every state, an onboarding queue, an error log, support threads.
//
// Idempotent: every seeded clinic is deleted and rebuilt (the cascade takes its
// tenant rows with it), and every date is relative to now, so the demo never
// looks stale no matter when it was last run.

// Known passwords on the seeded logins, plus a destructive reset: not for prod.
if (process.env.NODE_ENV === 'production') {
  throw new Error('The demo seed plants known passwords and deletes clinics — not for production.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PASSWORD = 'Demo1234!';
const ADMIN_EMAIL = 'admin@zenvydental.fr';
const OWNER_EMAIL = 'docteur@lumiere-dentaire.fr';
const STAFF_EMAIL = 'secretariat@lumiere-dentaire.fr';
const CLINIC_SLUG = 'cabinet-dentaire-lumiere';
/** Prefix on every seeded ErrorLog: the unattributed ones have no clinic to
 *  cascade from, so this is what the next run deletes them by. */
const CORRELATION_PREFIX = 'demo-';

// ---------- Time ----------

const PARIS = 'Europe/Paris';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How far Paris is ahead of UTC at that instant, in ms — DST included. */
function parisOffsetMs(instant: Date): number {
  // 'sv' formats as `YYYY-MM-DD HH:mm:ss`, which parses back as if it were UTC.
  const asParis = new Date(`${instant.toLocaleString('sv', { timeZone: PARIS })}Z`);
  return asParis.getTime() - instant.getTime();
}

/** Paris wall-clock time, `days` from today — the timezone every clinic runs on
 *  (schema.prisma), so `at(1, 14, 30)` is what the dashboard shows as 14h30.
 *  Every day but today is nudged off the weekend, in its own direction: the
 *  clinic is open Mon–Fri, and whichever weekday the seed is run on, a routine
 *  détartrage sitting on a Sunday is what gives a demo away. Today is left
 *  alone — the only appointment on it is the emergency, which the clinic's own
 *  hours already carve out ("fermé le week-end, sauf urgence"). */
function at(days: number, hour: number, minute = 0): Date {
  // Shift by the current offset so the UTC fields below read as Paris' date.
  const day = new Date(Date.now() + parisOffsetMs(new Date()));
  day.setUTCDate(day.getUTCDate() + days);
  const step = days < 0 ? -1 : 1;
  while (days !== 0 && (day.getUTCDay() === 0 || day.getUTCDay() === 6)) {
    day.setUTCDate(day.getUTCDate() + step);
  }
  const naive = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute);
  // Second pass settles the hour on the two days a year the offset changes.
  const first = naive - parisOffsetMs(new Date(naive));
  return new Date(naive - parisOffsetMs(new Date(first)));
}

const ago = (ms: number): Date => new Date(Date.now() - ms);
const frDate = (d: Date): string =>
  new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: PARIS,
  }).format(d);
const frTime = (d: Date): string =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: PARIS })
    .format(d)
    .replace(':', 'h');

// ---------- Demo data ----------

/** First names are the join key for the appointments and threads below, so they
 *  have to stay distinct — `seedDemoClinic` asserts it rather than trusting it. */
type PatientSpec = Omit<Prisma.PatientCreateManyInput, 'clinicId'>;

const PATIENTS: PatientSpec[] = [
  {
    firstName: 'Marie',
    lastName: 'Dubois',
    phone: '+33612345678',
    tags: ['fidèle'],
    notes: 'Anxieuse — prévoir un temps d’explication avant les soins.',
  },
  { firstName: 'Lucas', lastName: 'Martin', phone: '+33698765432' },
  {
    firstName: 'Sophie',
    lastName: 'Bernard',
    phone: '+33655443322',
    tags: ['nouveau patient'],
    source: 'WHATSAPP_INBOUND',
  },
  {
    firstName: 'Thomas',
    lastName: 'Girard',
    phone: '+33607112233',
    tags: ['urgence'],
  },
  { firstName: 'Nadia', lastName: 'Cherif', phone: '+33781554466' },
  {
    firstName: 'Jean-Pierre',
    lastName: 'Roussel',
    phone: '+33623889977',
    tags: ['suivi post-opératoire'],
    notes: 'Extraction des dents de sagesse — contrôle de cicatrisation à prévoir.',
  },
  {
    firstName: 'Camille',
    lastName: 'Petit',
    phone: '+33766221100',
    optOut: true,
    notes: 'A répondu STOP — aucun message automatique ne part vers ce numéro.',
  },
  {
    firstName: 'Élodie',
    lastName: 'Moreau',
    phone: '+33645332211',
    tags: ['fidèle', 'famille'],
  },
  {
    firstName: 'Karim',
    lastName: 'Benali',
    phone: '+33750998877',
    tags: ['nouveau patient'],
    source: 'WHATSAPP_INBOUND',
  },
  { firstName: 'Chloé', lastName: 'Lefèvre', phone: '+33688774411' },
  {
    firstName: 'Antoine',
    lastName: 'Mercier',
    phone: '+33611223344',
    tags: ['enfant'],
    notes: 'Accompagné par sa mère, Mme Mercier.',
  },
  { firstName: 'Fatima', lastName: 'Haddad', phone: '+33734556677' },
  {
    firstName: 'Pierre',
    lastName: 'Lambert',
    phone: '+33699001122',
    tags: ['implants'],
  },
  {
    firstName: 'Julie',
    lastName: 'Rossi',
    phone: '+33677889900',
    // Soft-deleted: still holds its (clinicId, phone) slot, hidden from lists.
    deletedAt: ago(30 * DAY),
  },
];

interface AppointmentSpec {
  patient: string;
  /** Offset from today: negative is history, so the clinic has a past too. */
  day: number;
  hour: number;
  minute?: number;
  durationMin: number;
  type: string;
  status: 'SCHEDULED' | 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW' | 'DONE';
}

const APPOINTMENTS: AppointmentSpec[] = [
  {
    patient: 'Marie',
    day: -14,
    hour: 9,
    minute: 30,
    durationMin: 30,
    type: 'Détartrage',
    status: 'DONE',
  },
  { patient: 'Pierre', day: -9, hour: 14, durationMin: 90, type: 'Pose d’implant', status: 'DONE' },
  {
    patient: 'Élodie',
    day: -7,
    hour: 15,
    durationMin: 30,
    type: 'Contrôle annuel',
    status: 'DONE',
  },
  {
    patient: 'Karim',
    day: -5,
    hour: 10,
    durationMin: 45,
    type: 'Première consultation',
    status: 'DONE',
  },
  {
    patient: 'Jean-Pierre',
    day: -3,
    hour: 11,
    durationMin: 60,
    type: 'Extraction dent de sagesse',
    status: 'DONE',
  },
  {
    patient: 'Chloé',
    day: -2,
    hour: 16,
    minute: 30,
    durationMin: 30,
    type: 'Détartrage',
    status: 'NO_SHOW',
  },
  {
    patient: 'Nadia',
    day: -1,
    hour: 9,
    durationMin: 30,
    type: 'Contrôle annuel',
    status: 'CANCELLED',
  },
  {
    patient: 'Thomas',
    day: 0,
    hour: 17,
    minute: 15,
    durationMin: 30,
    type: 'Urgence — dent cassée',
    status: 'CONFIRMED',
  },
  {
    patient: 'Lucas',
    day: 1,
    hour: 14,
    minute: 30,
    durationMin: 45,
    type: 'Contrôle annuel',
    status: 'CONFIRMED',
  },
  { patient: 'Marie', day: 2, hour: 10, durationMin: 30, type: 'Détartrage', status: 'CONFIRMED' },
  {
    patient: 'Antoine',
    day: 3,
    hour: 11,
    minute: 30,
    durationMin: 30,
    type: 'Contrôle enfant',
    status: 'CONFIRMED',
  },
  { patient: 'Fatima', day: 4, hour: 9, durationMin: 60, type: 'Soin carie', status: 'SCHEDULED' },
  {
    patient: 'Camille',
    day: 5,
    hour: 16,
    durationMin: 30,
    type: 'Détartrage',
    status: 'SCHEDULED',
  },
  {
    patient: 'Sophie',
    day: 6,
    hour: 18,
    durationMin: 45,
    type: 'Bilan blanchiment',
    status: 'SCHEDULED',
  },
  {
    patient: 'Élodie',
    day: 8,
    hour: 15,
    minute: 30,
    durationMin: 30,
    type: 'Détartrage',
    status: 'SCHEDULED',
  },
  {
    patient: 'Pierre',
    day: 10,
    hour: 14,
    durationMin: 60,
    type: 'Contrôle implant',
    status: 'SCHEDULED',
  },
  {
    patient: 'Karim',
    day: 12,
    hour: 10,
    minute: 30,
    durationMin: 45,
    type: 'Soin carie',
    status: 'SCHEDULED',
  },
];

interface ClinicSpec {
  name: string;
  slug: string;
  phone: string;
  address: string;
  owner: { email: string; name: string };
  onboardingStatus: ClinicOnboardingStatus;
  subscription: SubscriptionStatus;
  trialEndsInDays?: number;
  whatsapp: boolean;
  createdDaysAgo: number;
  patients: number;
  /** One inbound message, so the client list shows a non-zero thread count. */
  conversation?: string;
  onboarding?: { status: OnboardingRequestStatus; notes: string; callInDays?: number };
}

/** The other clinics exist for the owner portal: one row per subscription and
 *  onboarding state the founder has to be able to operate. */
const OTHER_CLINICS: ClinicSpec[] = [
  {
    name: 'Cabinet Sourire du Marais',
    slug: 'cabinet-sourire-du-marais',
    phone: '+33142778899',
    address: '8 rue des Rosiers, 75004 Paris',
    owner: { email: 'contact@sourire-marais.fr', name: 'Dr Hélène Vasseur' },
    onboardingStatus: 'COMPLETED',
    subscription: 'ACTIVE',
    whatsapp: true,
    createdDaysAgo: 124,
    patients: 4,
    conversation: 'Bonjour, à quelle heure fermez-vous le vendredi ?',
  },
  {
    name: 'Centre Dentaire Océan',
    slug: 'centre-dentaire-ocean',
    phone: '+33556334455',
    address: '21 cours de l’Intendance, 33000 Bordeaux',
    owner: { email: 'direction@centre-ocean.fr', name: 'Dr Bruno Da Silva' },
    onboardingStatus: 'COMPLETED',
    subscription: 'PAST_DUE',
    whatsapp: true,
    createdDaysAgo: 208,
    patients: 3,
    conversation: 'Bonjour, je souhaite déplacer mon rendez-vous de la semaine prochaine.',
  },
  {
    name: 'Clinique Dentaire Bellecour',
    slug: 'clinique-dentaire-bellecour',
    phone: '+33472889900',
    address: '3 place Bellecour, 69002 Lyon',
    owner: { email: 'accueil@bellecour-dentaire.fr', name: 'Dr Amandine Leroy' },
    onboardingStatus: 'IN_PROGRESS',
    subscription: 'TRIALING',
    trialEndsInDays: 9,
    whatsapp: false,
    createdDaysAgo: 5,
    patients: 2,
    onboarding: {
      status: 'CALL_SCHEDULED',
      notes:
        'Numéro WhatsApp déjà utilisé sur l’app grand public — migration à faire pendant l’appel.',
      callInDays: 2,
    },
  },
  {
    name: 'Cabinet Dentaire du Port',
    slug: 'cabinet-dentaire-du-port',
    phone: '+33491223344',
    address: '14 quai du Port, 13002 Marseille',
    owner: { email: 'cabinet@dentaire-du-port.fr', name: 'Dr Yanis Perrin' },
    onboardingStatus: 'PENDING',
    subscription: 'TRIALING',
    trialEndsInDays: 13,
    whatsapp: false,
    createdDaysAgo: 1,
    patients: 0,
    onboarding: { status: 'PENDING', notes: 'Inscrit hier soir — à rappeler.' },
  },
  {
    name: 'Cabinet Dentaire Saint-Michel',
    slug: 'cabinet-dentaire-saint-michel',
    phone: '+33561445566',
    address: '5 rue Saint-Michel, 31000 Toulouse',
    owner: { email: 'contact@dentaire-saint-michel.fr', name: 'Dr Nicolas Barbier' },
    onboardingStatus: 'COMPLETED',
    subscription: 'CANCELED',
    whatsapp: false,
    createdDaysAgo: 296,
    patients: 3,
  },
];

const OTHER_PATIENT_NAMES = [
  ['Isabelle', 'Fournier'],
  ['Mehdi', 'Bouzid'],
  ['Céline', 'Garnier'],
  ['Olivier', 'Perrin'],
  ['Sarah', 'Cohen'],
  ['Damien', 'Fabre'],
  ['Leïla', 'Amrani'],
  ['Gaëlle', 'Ricard'],
  ['Vincent', 'Aubert'],
  ['Nour', 'Belkacem'],
  ['Marc', 'Chevalier'],
  ['Awa', 'Diallo'],
];

const ALL_SLUGS = [CLINIC_SLUG, ...OTHER_CLINICS.map((c) => c.slug)];

// ---------- Helpers ----------

/** A Better Auth credential account — the same shape sign-up writes (providerId
 *  'credential', accountId = the user id). Without one, the user cannot log in. */
async function setPassword(userId: string): Promise<void> {
  await prisma.account.create({
    data: {
      userId,
      accountId: userId,
      providerId: 'credential',
      password: await hashPassword(PASSWORD),
    },
  });
}

type ReminderKind = 'REMINDER_24H' | 'REMINDER_2H' | 'FOLLOWUP';

/** The reminder rows appointments/reminders.ts would have left behind: two
 *  before every live appointment, a follow-up after a done one, and only
 *  cancellations for a patient who opted out. */
function remindersFor(
  appointment: { startsAt: Date; status: string },
  optOut: boolean,
): { kind: ReminderKind; sendAt: Date; status: ScheduledMessageStatus }[] {
  const offset = (ms: number): Date => new Date(appointment.startsAt.getTime() + ms);
  const fired = (sendAt: Date): ScheduledMessageStatus =>
    sendAt.getTime() <= Date.now() ? 'SENT' : 'PENDING';
  const before: { kind: ReminderKind; sendAt: Date }[] = [
    { kind: 'REMINDER_24H', sendAt: offset(-24 * HOUR) },
    { kind: 'REMINDER_2H', sendAt: offset(-2 * HOUR) },
  ];

  switch (appointment.status) {
    case 'DONE':
      return [
        ...before.map((r) => ({ ...r, status: 'SENT' as const })),
        { kind: 'FOLLOWUP', sendAt: offset(24 * HOUR), status: fired(offset(24 * HOUR)) },
      ];
    case 'NO_SHOW':
      // Already out the door by the time the patient failed to turn up.
      return before.map((r) => ({ ...r, status: 'SENT' as const }));
    case 'CANCELLED':
      return before.map((r) => ({ ...r, status: 'CANCELLED' as const }));
    default:
      // Opt-out is retroactive: pending rows are cancelled, none are re-armed.
      return before.map((r) => ({ ...r, status: optOut ? 'CANCELLED' : fired(r.sendAt) }));
  }
}

// ---------- The demo clinic (apps/web) ----------

async function seedDemoClinic(): Promise<{ clinicId: string; ownerId: string }> {
  const clinic = await prisma.clinic.create({
    data: {
      name: 'Cabinet Dentaire Lumière',
      slug: CLINIC_SLUG,
      phone: '+33145887766',
      address: '12 rue de la Paix, 75002 Paris',
      onboardingStatus: 'COMPLETED',
      createdAt: ago(96 * DAY),
      // Keys and shapes are the ones the settings form reads and writes back
      // (apps/web AiSettings.tsx, S3-4): `services` a string list, `prices` and
      // `faq` free text. aiConfig is still untyped Json, so nothing would reject
      // a richer shape here — the AI prompt dumps whatever it is given
      // (ai/prompt.ts renderConfig) and the settings page would be the one to
      // render it as [object Object]. Match the consumer, not the column.
      aiConfig: {
        tone: 'chaleureux et professionnel',
        hours: 'Lundi au vendredi, 9h00 – 19h00. Fermé le week-end, sauf urgence.',
        services: [
          'Détartrage',
          'Soin de carie',
          'Blanchiment au fauteuil',
          'Pose d’implant',
          'Urgence dentaire',
        ],
        prices: [
          'Consultation : 60 €',
          'Détartrage : 70 €',
          'Soin de carie : à partir de 90 €',
          'Blanchiment au fauteuil : à partir de 350 €',
          'Pose d’implant : sur devis',
        ].join('\n'),
        faq: [
          'Q: Êtes-vous conventionnés ?',
          'R: Oui, secteur 1, carte Vitale acceptée.',
          '',
          'Q: Y a-t-il un parking ?',
          'R: Un parking public se trouve à 100 m, rue Danielle Casanova.',
          '',
          'Q: Que faire en cas d’urgence en dehors des horaires ?',
          'R: En cas d’urgence vitale, composez le 15. Sinon, écrivez-nous : nous répondons dès la réouverture.',
        ].join('\n'),
      },
      whatsAppAccounts: {
        create: {
          phoneNumberId: '155000000000001',
          wabaId: '266000000000001',
          displayNumber: '+33145887766',
          verified: true,
        },
      },
      subscription: {
        create: {
          status: 'ACTIVE',
          stripeCustomerId: 'cus_demo_lumiere',
          stripeSubscriptionId: 'sub_demo_lumiere',
          statusEventAt: ago(66 * DAY),
        },
      },
      // S4-1 enqueues every new clinic; this one was onboarded months ago.
      onboardingRequests: {
        create: {
          status: 'DONE',
          notes: 'Numéro WhatsApp connecté le jour de l’appel. Config IA validée avec Dr Fontaine.',
          scheduledCallAt: ago(95 * DAY),
          createdAt: ago(96 * DAY),
        },
      },
    },
  });

  const owner = await prisma.user.create({
    data: {
      clinicId: clinic.id,
      email: OWNER_EMAIL,
      name: 'Dr Claire Fontaine',
      role: 'CLINIC_OWNER',
      emailVerified: true,
      createdAt: ago(96 * DAY),
    },
  });
  const staff = await prisma.user.create({
    data: {
      clinicId: clinic.id,
      email: STAFF_EMAIL,
      name: 'Sarah Lemoine',
      role: 'CLINIC_STAFF',
      emailVerified: true,
      createdAt: ago(90 * DAY),
    },
  });
  await setPassword(owner.id);
  await setPassword(staff.id);

  const patientRows = await prisma.patient.createManyAndReturn({
    data: PATIENTS.map((p) => ({ ...p, clinicId: clinic.id })),
  });
  // createManyAndReturn keeps input order, so first names line up with the rows.
  const byName = new Map(patientRows.map((row) => [row.firstName, row]));
  if (byName.size !== PATIENTS.length) {
    throw new Error('Two demo patients share a first name — the appointments below would mis-wire');
  }
  const patient = (firstName: string): (typeof patientRows)[number] => {
    const row = byName.get(firstName);
    if (!row) throw new Error(`No demo patient named ${firstName}`);
    return row;
  };

  const appointmentRows = await prisma.appointment.createManyAndReturn({
    data: APPOINTMENTS.map((a) => {
      const startsAt = at(a.day, a.hour, a.minute ?? 0);
      return {
        clinicId: clinic.id,
        patientId: patient(a.patient).id,
        startsAt,
        durationMin: a.durationMin,
        type: a.type,
        status: a.status,
        // Booked a while back, but never in the future.
        createdAt: new Date(Math.min(Date.now(), startsAt.getTime() - 10 * DAY)),
      };
    }),
  });

  const reminders = appointmentRows.flatMap((a, i) =>
    remindersFor(a, patient(APPOINTMENTS[i].patient).optOut).map((r) => ({
      clinicId: clinic.id,
      patientId: a.patientId,
      appointmentId: a.id,
      kind: r.kind,
      templateName: TEMPLATES[r.kind]!.name,
      status: r.status,
      sendAt: r.sendAt,
      jobId: r.status === 'PENDING' ? null : `demo-${a.id}-${r.kind.toLowerCase()}`,
    })),
  );
  // One send that failed — the reason Chloé never turned up.
  const missed = reminders.find(
    (r) => r.patientId === patient('Chloé').id && r.kind === 'REMINDER_2H',
  );
  if (missed) missed.status = 'FAILED';
  await prisma.scheduledMessage.createMany({ data: reminders });

  const upcoming = (key: string): (typeof appointmentRows)[number] =>
    appointmentRows.find(
      (a) => a.patientId === patient(key).id && a.startsAt.getTime() > Date.now(),
    )!;
  const marieNext = upcoming('Marie');
  const lucasNext = upcoming('Lucas');
  const sophieBooking = upcoming('Sophie');
  const jeanpierreVisit = appointmentRows.find((a) => a.patientId === patient('Jean-Pierre').id)!;

  interface ThreadSpec {
    patient: string | null;
    /** Only for the thread with no patient row behind it. */
    phone?: string;
    status: 'AI' | 'HUMAN' | 'CLOSED';
    urgentFlag?: boolean;
    messages: {
      minutesAgo: number;
      direction: 'IN' | 'OUT';
      author: 'PATIENT' | 'AI' | 'STAFF' | 'SYSTEM';
      body: string;
      templateName?: string;
      deliveryStatus?: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
    }[];
  }

  // The threads the founder walks a dentist through: an emergency escalated to
  // a human, the AI closing a reschedule on its own, a new patient won from a
  // price question, a reminder answered, an unknown number, a cancellation, a
  // follow-up, and an opt-out — which the product answers with silence.
  const threads: ThreadSpec[] = [
    {
      patient: 'Thomas',
      status: 'HUMAN',
      urgentFlag: true,
      messages: [
        {
          minutesAgo: 96,
          direction: 'IN',
          author: 'PATIENT',
          body: 'Bonjour, je me suis cassé une dent hier soir en mangeant et j’ai vraiment mal. Est-ce que vous pouvez me prendre aujourd’hui ?',
        },
        {
          minutesAgo: 95,
          direction: 'OUT',
          author: 'AI',
          body: 'Bonjour Thomas, je comprends : une dent cassée avec douleur est une urgence. Je transmets tout de suite votre demande au cabinet, une personne de l’équipe vous répond dans les minutes qui suivent.',
          deliveryStatus: 'READ',
        },
        {
          minutesAgo: 88,
          direction: 'OUT',
          author: 'STAFF',
          body: `Bonjour Thomas, Sarah du Cabinet Dentaire Lumière. Nous vous gardons un créneau d’urgence aujourd’hui à ${frTime(at(0, 17, 15))}. En attendant, évitez de mastiquer de ce côté et prenez un antalgique si nécessaire.`,
          deliveryStatus: 'READ',
        },
        {
          minutesAgo: 84,
          direction: 'IN',
          author: 'PATIENT',
          body: 'Merci beaucoup, je serai là.',
        },
      ],
    },
    {
      patient: 'Marie',
      status: 'AI',
      messages: [
        {
          minutesAgo: 320,
          direction: 'IN',
          author: 'PATIENT',
          body: 'Bonjour, est-ce que je peux décaler mon rendez-vous ? J’ai une réunion qui tombe au même moment.',
        },
        {
          minutesAgo: 319,
          direction: 'OUT',
          author: 'AI',
          body: `Bonjour Marie, bien sûr. Nous avons de la disponibilité ${frDate(marieNext.startsAt)} à ${frTime(marieNext.startsAt)}, ou le lendemain en fin de journée. Qu’est-ce qui vous arrangerait ?`,
          deliveryStatus: 'READ',
        },
        {
          minutesAgo: 305,
          direction: 'IN',
          author: 'PATIENT',
          body: `${frTime(marieNext.startsAt)} c’est parfait, merci !`,
        },
        {
          minutesAgo: 304,
          direction: 'OUT',
          author: 'AI',
          body: `C’est noté : votre détartrage est déplacé au ${frDate(marieNext.startsAt)} à ${frTime(marieNext.startsAt)}. Vous recevrez un rappel la veille. Belle journée !`,
          deliveryStatus: 'READ',
        },
      ],
    },
    {
      patient: 'Sophie',
      status: 'AI',
      messages: [
        {
          minutesAgo: 1_500,
          direction: 'IN',
          author: 'PATIENT',
          body: 'Bonjour, je voudrais des renseignements sur le blanchiment dentaire. Vous le faites ? Et à quel prix ?',
        },
        {
          minutesAgo: 1_499,
          direction: 'OUT',
          author: 'AI',
          body: 'Bonjour ! Oui, nous proposons le blanchiment au fauteuil, à partir de 350 €, en une séance d’environ une heure. Un premier bilan est nécessaire pour vérifier que vos dents et vos gencives sont prêtes. Souhaitez-vous que je vous propose un créneau pour ce bilan ?',
          deliveryStatus: 'READ',
        },
        {
          minutesAgo: 1_460,
          direction: 'IN',
          author: 'PATIENT',
          body: 'Oui volontiers, plutôt en fin de journée si possible.',
        },
        {
          minutesAgo: 1_459,
          direction: 'OUT',
          author: 'AI',
          body: `Nous avons ${frDate(sophieBooking.startsAt)} à ${frTime(sophieBooking.startsAt)}. Cela vous convient-il ?`,
          deliveryStatus: 'READ',
        },
        { minutesAgo: 1_452, direction: 'IN', author: 'PATIENT', body: 'Parfait pour moi.' },
        {
          minutesAgo: 1_451,
          direction: 'OUT',
          author: 'AI',
          body: `C’est réservé : bilan blanchiment ${frDate(sophieBooking.startsAt)} à ${frTime(sophieBooking.startsAt)}. Pensez à venir avec votre carte Vitale. À très bientôt !`,
          deliveryStatus: 'DELIVERED',
        },
      ],
    },
    {
      patient: 'Lucas',
      status: 'AI',
      messages: [
        {
          minutesAgo: 200,
          direction: 'OUT',
          author: 'AI',
          templateName: TEMPLATES.REMINDER_24H!.name,
          body: `Bonjour Lucas, nous vous rappelons votre rendez-vous le ${frDate(lucasNext.startsAt)} à ${frTime(lucasNext.startsAt)}. Pour confirmer, modifier ou annuler, répondez simplement à ce message. À bientôt, Cabinet Dentaire Lumière.`,
          deliveryStatus: 'READ',
        },
        {
          minutesAgo: 176,
          direction: 'IN',
          author: 'PATIENT',
          body: 'Oui c’est noté, je serai là.',
        },
        {
          minutesAgo: 175,
          direction: 'OUT',
          author: 'AI',
          body: 'Merci Lucas, votre rendez-vous est confirmé. À demain !',
          deliveryStatus: 'DELIVERED',
        },
      ],
    },
    {
      // No patient row behind it: a number that wrote in and never booked.
      patient: null,
      phone: '+33627448811',
      status: 'AI',
      messages: [
        {
          minutesAgo: 40,
          direction: 'IN',
          author: 'PATIENT',
          body: 'Bonjour, quels sont vos horaires le samedi ?',
        },
        {
          minutesAgo: 39,
          direction: 'OUT',
          author: 'AI',
          body: 'Bonjour ! Le cabinet est ouvert du lundi au vendredi, de 9h00 à 19h00. Nous sommes fermés le samedi, sauf urgence. Puis-je vous aider à prendre rendez-vous en semaine ?',
          deliveryStatus: 'DELIVERED',
        },
        {
          minutesAgo: 25,
          direction: 'IN',
          author: 'PATIENT',
          body: 'Non merci, c’était juste pour savoir. Bonne journée !',
        },
      ],
    },
    {
      patient: 'Jean-Pierre',
      status: 'AI',
      messages: [
        {
          minutesAgo: 2_700,
          direction: 'OUT',
          author: 'AI',
          templateName: TEMPLATES.FOLLOWUP!.name,
          body: 'Bonjour Jean-Pierre, nous espérons que tout va bien depuis votre visite. Si vous avez une question ou une gêne, répondez simplement à ce message : notre équipe vous répondra. Bonne journée, Cabinet Dentaire Lumière.',
          deliveryStatus: 'READ',
        },
        {
          minutesAgo: 2_640,
          direction: 'IN',
          author: 'PATIENT',
          body: `Bonjour, tout va bien, la douleur a disparu deux jours après l’extraction du ${frDate(jeanpierreVisit.startsAt)}. Merci pour le suivi !`,
        },
        {
          minutesAgo: 2_639,
          direction: 'OUT',
          author: 'AI',
          body: 'Excellente nouvelle. N’hésitez pas à nous écrire si quoi que ce soit change d’ici la cicatrisation complète. Bonne journée !',
          deliveryStatus: 'DELIVERED',
        },
      ],
    },
    {
      patient: 'Nadia',
      status: 'CLOSED',
      messages: [
        {
          minutesAgo: 3_100,
          direction: 'IN',
          author: 'PATIENT',
          body: 'Bonjour, je dois annuler mon rendez-vous, je serai en déplacement toute la semaine.',
        },
        {
          minutesAgo: 3_099,
          direction: 'OUT',
          author: 'AI',
          body: 'Bonjour Nadia, c’est annulé, sans frais. Souhaitez-vous que je vous propose une nouvelle date dès maintenant ?',
          deliveryStatus: 'READ',
        },
        {
          minutesAgo: 3_050,
          direction: 'IN',
          author: 'PATIENT',
          body: 'Je vous recontacte à mon retour, merci.',
        },
        {
          minutesAgo: 3_049,
          direction: 'OUT',
          author: 'AI',
          body: 'Très bien, à bientôt. Prenez soin de vous !',
          deliveryStatus: 'FAILED',
        },
      ],
    },
    {
      patient: 'Camille',
      status: 'AI',
      messages: [
        {
          minutesAgo: 44_000,
          direction: 'OUT',
          author: 'AI',
          templateName: TEMPLATES.REMINDER_24H!.name,
          body: 'Bonjour Camille, nous vous rappelons votre rendez-vous. Pour confirmer, modifier ou annuler, répondez simplement à ce message. À bientôt, Cabinet Dentaire Lumière.',
          deliveryStatus: 'DELIVERED',
        },
        // STOP is honoured in silence (whatsapp/inbound.processor.ts): the flag
        // goes on, the pending reminders are cancelled, nothing is sent back.
        { minutesAgo: 43_980, direction: 'IN', author: 'PATIENT', body: 'STOP' },
      ],
    },
  ];

  for (const thread of threads) {
    const row = thread.patient ? patient(thread.patient) : null;
    const last = thread.messages[thread.messages.length - 1];
    await prisma.conversation.create({
      data: {
        clinicId: clinic.id,
        patientId: row?.id ?? null,
        waContactPhone: row?.phone ?? thread.phone!,
        status: thread.status,
        urgentFlag: thread.urgentFlag ?? false,
        lastMessageAt: ago(last.minutesAgo * MINUTE),
        createdAt: ago(thread.messages[0].minutesAgo * MINUTE),
        messages: {
          create: thread.messages.map((m) => ({
            clinicId: clinic.id,
            direction: m.direction,
            author: m.author,
            body: m.body,
            templateName: m.templateName ?? null,
            deliveryStatus: m.deliveryStatus ?? null,
            createdAt: ago(m.minutesAgo * MINUTE),
          })),
        },
      },
    });
  }

  // A week of assistant spend, so the cost log and the budget guard have a
  // history behind them. Deterministic, not random: same seed, same demo.
  const usage = Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 4 + ((day * 3) % 5) }, (_, i) => {
      const promptTokens = 900 + ((day * 7 + i * 13) % 800);
      const completionTokens = 110 + ((day * 11 + i * 5) % 90);
      return {
        clinicId: clinic.id,
        model: 'gpt-4o-mini',
        promptTokens,
        completionTokens,
        costMicroEur: priceMicroEur('gpt-4o-mini', promptTokens, completionTokens),
        createdAt: ago(day * DAY + (i + 1) * 47 * MINUTE),
      };
    }),
  ).flat();
  await prisma.aiUsage.createMany({ data: usage });

  return { clinicId: clinic.id, ownerId: owner.id };
}

// ---------- The other clinics (apps/owner) ----------

interface ClinicRef {
  id: string;
  ownerId: string;
}

async function seedOtherClinics(): Promise<Record<string, ClinicRef>> {
  const created: Record<string, ClinicRef> = {};
  let nameCursor = 0;

  for (const [index, spec] of OTHER_CLINICS.entries()) {
    const createdAt = ago(spec.createdDaysAgo * DAY);
    const clinic = await prisma.clinic.create({
      data: {
        name: spec.name,
        slug: spec.slug,
        phone: spec.phone,
        address: spec.address,
        onboardingStatus: spec.onboardingStatus,
        createdAt,
        subscription: {
          create: {
            status: spec.subscription,
            trialEndsAt: spec.trialEndsInDays
              ? new Date(Date.now() + spec.trialEndsInDays * DAY)
              : null,
            // A trial never reached checkout, so it has no Stripe customer yet.
            stripeCustomerId: spec.subscription === 'TRIALING' ? null : `cus_demo_${index}`,
            statusEventAt: spec.subscription === 'TRIALING' ? null : ago(12 * DAY),
          },
        },
        ...(spec.whatsapp && {
          whatsAppAccounts: {
            create: {
              phoneNumberId: `15500000000001${index}`,
              wabaId: `26600000000001${index}`,
              displayNumber: spec.phone,
              verified: true,
            },
          },
        }),
        ...(spec.onboarding && {
          onboardingRequests: {
            create: {
              status: spec.onboarding.status,
              notes: spec.onboarding.notes,
              scheduledCallAt: spec.onboarding.callInDays
                ? new Date(Date.now() + spec.onboarding.callInDays * DAY)
                : null,
              createdAt,
            },
          },
        }),
      },
    });

    const owner = await prisma.user.create({
      data: {
        clinicId: clinic.id,
        email: spec.owner.email,
        name: spec.owner.name,
        role: 'CLINIC_OWNER',
        emailVerified: spec.onboardingStatus !== 'PENDING',
        createdAt,
      },
    });
    created[spec.slug] = { id: clinic.id, ownerId: owner.id };

    if (spec.patients === 0) continue;
    const patients = await prisma.patient.createManyAndReturn({
      data: Array.from({ length: spec.patients }, () => {
        const [firstName, lastName] = OTHER_PATIENT_NAMES[nameCursor % OTHER_PATIENT_NAMES.length];
        return {
          clinicId: clinic.id,
          firstName,
          lastName,
          phone: `+337${10_000_000 + nameCursor++}`,
          createdAt,
        };
      }),
    });

    if (spec.conversation) {
      await prisma.conversation.create({
        data: {
          clinicId: clinic.id,
          patientId: patients[0].id,
          waContactPhone: patients[0].phone,
          status: 'AI',
          lastMessageAt: ago(3 * HOUR),
          createdAt: ago(3 * HOUR),
          messages: {
            create: {
              clinicId: clinic.id,
              direction: 'IN',
              author: 'PATIENT',
              body: spec.conversation,
              createdAt: ago(3 * HOUR),
            },
          },
        },
      });
    }
  }
  return created;
}

// ---------- The operating trail (error log + support) ----------

async function seedOpsTrail(
  adminId: string,
  demo: { clinicId: string; ownerId: string },
  others: Record<string, ClinicRef>,
): Promise<void> {
  const marais = others['cabinet-sourire-du-marais'];
  const ocean = others['centre-dentaire-ocean'];
  const bellecour = others['clinique-dentaire-bellecour'];
  const port = others['cabinet-dentaire-du-port'];

  // Error messages stay English like every other log line the API writes
  // (docs/07-coding-standards.md) — the portal chrome around them is the French
  // part. Two rows carry no clinic: that column has to be demoed too.
  const errors: Prisma.ErrorLogCreateManyInput[] = [
    {
      clinicId: demo.clinicId,
      module: 'whatsapp',
      severity: 'ERROR',
      message: 'Meta Graph API responded 429 for a template send',
      context: { templateName: 'reminder_24h_fr', retryInSeconds: 60 },
      createdAt: ago(3 * HOUR),
    },
    {
      clinicId: demo.clinicId,
      module: 'ai',
      severity: 'WARN',
      message: 'Daily token budget exhausted — thread handed to a human',
      context: { budget: 300_000, spent: 301_412 },
      createdAt: ago(9 * HOUR),
    },
    {
      clinicId: demo.clinicId,
      module: 'whatsapp',
      severity: 'INFO',
      message: 'Inbound webhook replay ignored (duplicate waMessageId)',
      createdAt: ago(26 * HOUR),
    },
    {
      clinicId: demo.clinicId,
      module: 'conversations',
      severity: 'ERROR',
      message: 'Outbound send failed after 3 retries',
      context: { waContactPhone: '+33688774411', lastStatus: 'FAILED' },
      createdAt: ago(2 * DAY),
    },
    {
      clinicId: demo.clinicId,
      userId: demo.ownerId,
      module: 'http',
      severity: 'ERROR',
      message: 'GET /api/v1/patients failed with 500',
      stack:
        'PrismaClientKnownRequestError: Timed out fetching a new connection from the pool\n    at PatientsController.list (/app/dist/patients/patients.controller.js:61:24)',
      createdAt: ago(4 * DAY),
    },
    {
      clinicId: bellecour.id,
      module: 'billing',
      severity: 'ERROR',
      message: 'Stripe webhook signature verification failed',
      stack:
        'StripeSignatureVerificationError: No signatures found matching the expected signature for payload\n    at StripeWebhookController.handle (/app/dist/billing/stripe-webhook.controller.js:44:18)',
      context: { eventType: 'customer.subscription.updated' },
      createdAt: ago(5 * HOUR),
    },
    {
      clinicId: ocean.id,
      module: 'billing',
      severity: 'WARN',
      message: 'Subscription moved to PAST_DUE after a failed payment',
      context: { attempt: 2, nextAttemptInDays: 3 },
      createdAt: ago(31 * HOUR),
    },
    {
      clinicId: marais.id,
      module: 'ai',
      severity: 'ERROR',
      message: 'LLM request timed out after 15000ms',
      context: { model: 'gpt-4o-mini' },
      createdAt: ago(14 * HOUR),
    },
    {
      clinicId: port.id,
      module: 'identity',
      severity: 'WARN',
      message: 'Verification mail could not be delivered',
      context: { reason: 'no mail provider configured' },
      createdAt: ago(20 * HOUR),
    },
    {
      module: 'http',
      severity: 'FATAL',
      message: 'Unhandled exception in the request pipeline',
      stack:
        'TypeError: Cannot read properties of undefined (reading "id")\n    at ApiExceptionFilter.catch (/app/dist/common/http.js:118:31)',
      createdAt: ago(7 * HOUR),
    },
    {
      module: 'whatsapp',
      severity: 'WARN',
      message: 'Inbound webhook for an unknown phone_number_id — no tenant to route to',
      context: { phoneNumberId: '155000000000999' },
      createdAt: ago(2 * DAY + 3 * HOUR),
    },
  ];
  await prisma.errorLog.createMany({
    data: errors.map((e, i) => ({
      ...e,
      correlationId: `${CORRELATION_PREFIX}${String(i + 1).padStart(3, '0')}`,
    })),
  });

  interface SupportThreadSpec {
    clinicId: string;
    subject: string;
    status: 'OPEN' | 'CLOSED';
    /** Where the exchange actually left off — both lists sort on it. */
    updatedAgo: number;
    messages: { authorUserId: string; body: string; minutesAgo: number }[];
  }

  const threads: SupportThreadSpec[] = [
    {
      clinicId: demo.clinicId,
      subject: 'Ajouter une deuxième praticienne au cabinet',
      status: 'OPEN',
      updatedAgo: 2 * HOUR,
      messages: [
        {
          authorUserId: demo.ownerId,
          body: 'Bonjour, une consœur rejoint le cabinet le mois prochain. Comment lui donner accès à l’agenda et à la messagerie ?',
          minutesAgo: 26 * 60,
        },
        {
          authorUserId: adminId,
          body: 'Bonjour Docteur, c’est prévu : dans Réglages › Équipe, « Inviter un membre » lui envoie un lien par e-mail. Elle verra le même agenda et la même boîte de réception que vous.',
          minutesAgo: 24 * 60,
        },
        {
          authorUserId: demo.ownerId,
          body: 'Parfait, merci. Est-ce que cela change quelque chose à l’abonnement ?',
          minutesAgo: 120,
        },
      ],
    },
    {
      clinicId: marais.id,
      subject: 'Le rappel de 2 h n’est pas parti hier soir',
      status: 'OPEN',
      updatedAgo: 19 * HOUR,
      messages: [
        {
          authorUserId: marais.ownerId,
          body: 'Bonjour, deux patients m’ont dit ne pas avoir reçu le rappel de 2 h hier. Pouvez-vous vérifier ?',
          minutesAgo: 19 * 60,
        },
      ],
    },
    {
      clinicId: ocean.id,
      subject: 'Modifier la carte bancaire de l’abonnement',
      status: 'CLOSED',
      updatedAgo: 6 * DAY,
      messages: [
        {
          authorUserId: ocean.ownerId,
          body: 'Bonjour, ma carte a expiré. Où puis-je la remplacer ?',
          minutesAgo: 8 * 24 * 60,
        },
        {
          authorUserId: adminId,
          body: 'Bonjour, depuis Réglages › Abonnement, le bouton « Gérer le paiement » ouvre le portail Stripe où vous pouvez mettre la carte à jour.',
          minutesAgo: 7 * 24 * 60,
        },
        { authorUserId: ocean.ownerId, body: 'C’est fait, merci !', minutesAgo: 6 * 24 * 60 },
      ],
    },
  ];

  for (const thread of threads) {
    const created = await prisma.supportThread.create({
      data: {
        clinicId: thread.clinicId,
        subject: thread.subject,
        status: thread.status,
        createdAt: ago(thread.messages[0].minutesAgo * MINUTE),
        messages: {
          create: thread.messages.map((m) => ({
            authorUserId: m.authorUserId,
            body: m.body,
            createdAt: ago(m.minutesAgo * MINUTE),
          })),
        },
      },
    });
    // @updatedAt just stamped `now` on create — put it back where the exchange
    // actually ended, or every thread claims to have been answered this second.
    await prisma.supportThread.update({
      where: { id: created.id },
      data: { updatedAt: ago(thread.updatedAgo) },
    });
  }
}

// ---------- Entry point ----------

async function main(): Promise<void> {
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { name: 'Zenvy Admin', role: 'SUPER_ADMIN', emailVerified: true },
    create: { email: ADMIN_EMAIL, name: 'Zenvy Admin', role: 'SUPER_ADMIN', emailVerified: true },
  });
  await prisma.account.deleteMany({ where: { userId: admin.id, providerId: 'credential' } });
  await setPassword(admin.id);

  // Rebuild from scratch: deleting a clinic cascades to every tenant-scoped row
  // it owns. The unattributed error logs have no clinic to cascade from, so
  // they go by the correlation id this seed stamped on them.
  await prisma.clinic.deleteMany({ where: { slug: { in: ALL_SLUGS } } });
  await prisma.errorLog.deleteMany({
    where: { clinicId: null, correlationId: { startsWith: CORRELATION_PREFIX } },
  });

  const demo = await seedDemoClinic();
  const others = await seedOtherClinics();
  await seedOpsTrail(admin.id, demo, others);

  const inDemo = { where: { clinicId: demo.clinicId } };
  const counts = {
    clinics: await prisma.clinic.count({ where: { slug: { in: ALL_SLUGS } } }),
    patients: await prisma.patient.count(inDemo),
    appointments: await prisma.appointment.count(inDemo),
    conversations: await prisma.conversation.count(inDemo),
    messages: await prisma.message.count(inDemo),
    reminders: await prisma.scheduledMessage.count(inDemo),
    aiUsage: await prisma.aiUsage.count(inDemo),
    errors: await prisma.errorLog.count({
      where: { correlationId: { startsWith: CORRELATION_PREFIX } },
    }),
    onboardingRequests: await prisma.onboardingRequest.count(),
    supportThreads: await prisma.supportThread.count(),
    logins: await prisma.account.count({ where: { providerId: 'credential' } }),
  };

  // A demo that silently seeded half a clinic is worse than one that failed.
  const doneAppointments = APPOINTMENTS.filter((a) => a.status === 'DONE').length;
  const expected = {
    clinics: 1 + OTHER_CLINICS.length,
    patients: PATIENTS.length,
    appointments: APPOINTMENTS.length,
    conversations: 8,
    // Two before every appointment, plus a follow-up after each done one.
    reminders: 2 * APPOINTMENTS.length + doneAppointments,
    logins: 3,
  };
  for (const [key, want] of Object.entries(expected)) {
    const got = counts[key as keyof typeof counts];
    if (got < want) throw new Error(`Seed self-check failed: ${key} is ${got}, expected ${want}`);
  }

  console.log('Seed complete:', counts);
  console.log(
    `\nLogins (mot de passe « ${PASSWORD} ») :\n` +
      `  owner portal  ${ADMIN_EMAIL}\n` +
      `  dashboard     ${OWNER_EMAIL} (propriétaire)\n` +
      `                ${STAFF_EMAIL} (secrétariat)\n`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
