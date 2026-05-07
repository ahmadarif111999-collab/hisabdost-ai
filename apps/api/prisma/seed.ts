import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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
  const ownerPasswordHash = await bcrypt.hash('password123', 10);
  const partnerPasswordHash = await bcrypt.hash('Probiz01', 10);

  const owner = await prisma.user.upsert({
    where: { email: 'demo@pakbooks.ai' },
    update: {
      name: 'Firm Owner',
      passwordHash: ownerPasswordHash,
    },
    create: {
      name: 'Firm Owner',
      email: 'demo@pakbooks.ai',
      phone: '+923001234567',
      passwordHash: ownerPasswordHash,
    },
  });

  const existingFirmMembership = await prisma.organizationMember.findFirst({
    where: {
      userId: owner.id,
      organization: {
        type: 'ACCOUNTANT_FIRM',
      },
    },
    include: {
      organization: true,
    },
  });

  const firmRecord =
    existingFirmMembership?.organization ??
    (await prisma.organization.create({
      data: {
        name: 'HisabDost Accounting Firm',
        type: 'ACCOUNTANT_FIRM',
        planName: 'Firm Starter',
        clientSlotLimit: 10,
        firmUserLimit: 10,
        members: {
          create: {
            userId: owner.id,
            role: 'FIRM_OWNER',
          },
        },
      },
    }));

  const firm = await prisma.organization.update({
    where: {
      id: firmRecord.id,
    },
    data: {
      name: 'HisabDost Accounting Firm',
      type: 'ACCOUNTANT_FIRM',
      planName: 'Firm Starter',
      clientSlotLimit: 10,
      firmUserLimit: 10,
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: firm.id,
        userId: owner.id,
      },
    },
    update: {
      role: 'FIRM_OWNER',
      status: 'active',
    },
    create: {
      organizationId: firm.id,
      userId: owner.id,
      role: 'FIRM_OWNER',
      status: 'active',
    },
  });

  for (const partner of partnerUsers) {
    const user = await prisma.user.upsert({
      where: {
        email: partner.email.toLowerCase(),
      },
      update: {
        name: partner.name,
        passwordHash: partnerPasswordHash,
      },
      create: {
        name: partner.name,
        email: partner.email.toLowerCase(),
        passwordHash: partnerPasswordHash,
      },
    });

    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: firm.id,
          userId: user.id,
        },
      },
      update: {
        role: 'FIRM_PARTNER',
        status: 'active',
      },
      create: {
        organizationId: firm.id,
        userId: user.id,
        role: 'FIRM_PARTNER',
        status: 'active',
      },
    });
  }

  const templates = [
    {
      code: 'FBR_INCOME_TAX_RETURN_INDIVIDUAL_AOP',
      title: 'Income tax return reminder',
      authority: 'FBR',
      frequency: 'yearly',
      dueDateRuleJson: {
        month: 9,
        day: 30,
        note: 'Configurable; verify with accountant/FBR.',
      },
      reminderOffsetsJson: [30, 14, 7, 1, 0],
    },
    {
      code: 'FBR_SALES_TAX_MONTHLY_RETURN',
      title: 'Monthly sales tax return review',
      authority: 'FBR',
      frequency: 'monthly',
      dueDateRuleJson: {
        day: 18,
        monthOffset: 1,
        note: 'Configurable; verify with accountant/FBR.',
      },
      reminderOffsetsJson: [10, 5, 2, 0],
    },
    {
      code: 'MONTHLY_BOOK_CLOSE',
      title: 'Monthly bookkeeping close',
      authority: 'Internal',
      frequency: 'monthly',
      dueDateRuleJson: {
        day: 5,
        monthOffset: 1,
      },
      reminderOffsetsJson: [5, 2, 0],
    },
    {
      code: 'SECP_ANNUAL_RETURN_REVIEW',
      title: 'SECP annual return review',
      authority: 'SECP',
      frequency: 'yearly',
      dueDateRuleJson: {
        note: 'Configurable by admin/accountant. Do not hardcode final deadline.',
      },
      reminderOffsetsJson: [30, 14, 7, 1, 0],
    },
  ];

  for (const template of templates) {
    await prisma.complianceRuleTemplate.upsert({
      where: {
        code: template.code,
      },
      update: template,
      create: template,
    });
  }

  console.log('Seed complete');
  console.log({
    ownerEmail: owner.email,
    ownerPassword: 'password123',
    firm: firm.name,
    clientSlots: firm.clientSlotLimit,
    firmUserLimit: firm.firmUserLimit,
    partnerPassword: 'Probiz01',
    partners: partnerUsers.map((partner) => partner.email),
    note: 'No sample clients were created. Add real client companies from the Firm Dashboard.',
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
