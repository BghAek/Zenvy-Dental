import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

// Seed skeleton (S0-4): 1 SUPER_ADMIN + the demo clinic "Cabinet Dentaire Lumière"
// with a handful of French patients, appointments and one conversation.
// S4-4 turns this into the rich sales-demo dataset.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const CLINIC_SLUG = 'cabinet-dentaire-lumiere';

async function main() {
  await prisma.user.upsert({
    where: { email: 'admin@zenvydental.fr' },
    update: { name: 'Zenvy Admin', role: 'SUPER_ADMIN' },
    create: {
      email: 'admin@zenvydental.fr',
      name: 'Zenvy Admin',
      role: 'SUPER_ADMIN',
    },
  });

  // Recreate the demo clinic from scratch on every run — deleting the clinic
  // cascades to all tenant-scoped rows, which keeps the seed idempotent.
  await prisma.clinic.deleteMany({ where: { slug: CLINIC_SLUG } });

  const clinic = await prisma.clinic.create({
    data: {
      name: 'Cabinet Dentaire Lumière',
      slug: CLINIC_SLUG,
      phone: '+33145887766',
      address: '12 rue de la Paix, 75002 Paris',
      onboardingStatus: 'COMPLETED',
      aiConfig: {
        tone: 'chaleureux et professionnel',
        services: ['Détartrage', 'Carie', 'Blanchiment', 'Urgence dentaire'],
        hours: 'Lun–Ven 9h–19h',
      },
      users: {
        create: {
          email: 'docteur@lumiere-dentaire.fr',
          name: 'Dr Claire Fontaine',
          role: 'CLINIC_OWNER',
        },
      },
      subscription: {
        create: {
          status: 'TRIALING',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      },
    },
  });

  const [marie, lucas] = await Promise.all(
    [
      { firstName: 'Marie', lastName: 'Dubois', phone: '+33612345678', tags: ['fidèle'] },
      { firstName: 'Lucas', lastName: 'Martin', phone: '+33698765432', tags: [] },
      {
        firstName: 'Sophie',
        lastName: 'Bernard',
        phone: '+33655443322',
        tags: ['nouveau patient'],
        source: 'WHATSAPP_INBOUND' as const,
      },
    ].map((p) => prisma.patient.create({ data: { ...p, clinicId: clinic.id } })),
  );

  const tomorrow9h = new Date();
  tomorrow9h.setDate(tomorrow9h.getDate() + 1);
  // ~09:00 Europe/Paris regardless of host timezone (08:00 in winter — demo data).
  tomorrow9h.setUTCHours(7, 0, 0, 0);

  await Promise.all([
    prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: marie.id,
        startsAt: tomorrow9h,
        durationMin: 30,
        type: 'Détartrage',
        status: 'CONFIRMED',
      },
    }),
    prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: lucas.id,
        startsAt: new Date(tomorrow9h.getTime() + 7 * 24 * 60 * 60 * 1000),
        durationMin: 45,
        type: 'Contrôle annuel',
        status: 'SCHEDULED',
      },
    }),
  ]);

  const now = new Date();
  await prisma.conversation.create({
    data: {
      clinicId: clinic.id,
      patientId: marie.id,
      waContactPhone: marie.phone,
      status: 'AI',
      lastMessageAt: now,
      messages: {
        create: [
          {
            clinicId: clinic.id,
            direction: 'IN',
            author: 'PATIENT',
            body: 'Bonjour, est-ce que je peux décaler mon rendez-vous de demain ?',
          },
          {
            clinicId: clinic.id,
            direction: 'OUT',
            author: 'AI',
            body: 'Bonjour Marie ! Bien sûr, je transmets votre demande au cabinet. Quel créneau vous conviendrait ?',
            deliveryStatus: 'DELIVERED',
          },
        ],
      },
    },
  });

  const inClinic = { where: { clinicId: clinic.id } };
  const [users, patients, appointments, conversations, messages] = await Promise.all([
    prisma.user.count(),
    prisma.patient.count(inClinic),
    prisma.appointment.count(inClinic),
    prisma.conversation.count(inClinic),
    prisma.message.count(inClinic),
  ]);
  const counts = { users, patients, appointments, conversations, messages };
  console.log('Seed complete:', counts);
  if (counts.patients < 3 || counts.messages < 2) {
    throw new Error('Seed self-check failed: expected demo rows are missing');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
