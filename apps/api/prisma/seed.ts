import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const FIRM_NAME = 'ProBiz AI Firm';
const PARTNER_PASSWORD = 'Probiz01';

const partnerUsers = [
  {
    name: 'Ahmad Arif',
    email: 'ahmadarif111999@gmail.com',
  },
  {
    name: 'Y Javaid',
    email: 'yjavaid01@gmail.com',
  },
  {
    name: 'Maysum Zaidi',
    email: 'maysumzaidi2001@gmail.com',
  },
  {
    name: 'Asfand Sajjid',
    email: 'asfandsajjid@gmail.com',
  },
  {
    name: 'Ali Awan',
    email: 'ali.awan9167@gmail.com',
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(PARTNER_PASSWORD, 10);

  const existingFirm =
    (await prisma.organization.findFirst({
      where: {
        name: FIRM_NAME,
        type: 'ACCOUNTANT_FIRM',
      },
    })) ??
    (await prisma.organization.findFirst({
      where: {
        type: 'ACCOUNTANT_FIRM',
      },
      orderBy: {
        createdAt: 'asc',
      },
    }));

  const firm =
    existingFirm ??
    (await prisma.organization.create({
      data: {
        name: FIRM_NAME,
        type: 'ACCOUNTANT_FIRM',
        planName: 'Partner Beta',
        clientSlotLimit: 10,
        firmUserLimit: 5,
      },
    }));

  const updatedFirm = await prisma.organization.update({
    where: {
      id: firm.id,
    },
    data: {
      name: FIRM_NAME,
      type: 'ACCOUNTANT_FIRM',
      planName: 'Partner Beta',
      clientSlotLimit: 10,
      firmUserLimit: 5,
    },
  });

  for (const partner of partnerUsers) {
    const user = await prisma.user.upsert({
      where: {
        email: partner.email.toLowerCase(),
      },
      update: {
        name: partner.name,
        passwordHash,
      },
      create: {
        name: partner.name,
        email: partner.email.toLowerCase(),
        passwordHash,
      },
    });

    await prisma.organizationMember.updateMany({
      where: {
        userId: user.id,
        organizationId: {
          not: updatedFirm.id,
        },
        organization: {
          type: 'ACCOUNTANT_FIRM',
        },
      },
      data: {
        status: 'inactive',
      },
    });

    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: updatedFirm.id,
          userId: user.id,
        },
      },
      update: {
        role: 'FIRM_PARTNER',
        status: 'active',
      },
      create: {
        organizationId: updatedFirm.id,
        userId: user.id,
        role: 'FIRM_PARTNER',
        status: 'active',
      },
    });
  }

  const demoUser = await prisma.user.findUnique({
    where: {
      email: 'demo@pakbooks.ai',
    },
  });

  if (demoUser) {
    await prisma.organizationMember.updateMany({
      where: {
        userId: demoUser.id,
        organization: {
          type: 'ACCOUNTANT_FIRM',
        },
      },
      data: {
        status: 'inactive',
      },
    });
  }

  console.log('Seed complete');
  console.log({
    firm: updatedFirm.name,
    firmUserLimit: updatedFirm.firmUserLimit,
    expectedFirmUsers: partnerUsers.length,
    partnerPassword: PARTNER_PASSWORD,
    partners: partnerUsers.map((partner) => partner.email),
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
