import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TARGET_FIRM = {
  name: 'ProBiz Consultants',
  type: 'ACCOUNTANT_FIRM' as const,
  planName: 'Firm Starter',
  clientSlotLimit: 10,
  firmUserLimit: 5,
};

const PARTNERS = [
  {
    name: 'Ahmad Arif',
    email: 'ahmadarif111999@gmail.com',
    password: 'Probiz01',
    role: 'FIRM_PARTNER' as const,
  },
  {
    name: 'Yasir Javaid',
    email: 'yjavaid01@gmail.com',
    password: 'Probiz01',
    role: 'FIRM_PARTNER' as const,
  },
  {
    name: 'Maysum Zaidi',
    email: 'maysumzaidi2001@gmail.com',
    password: 'Probiz01',
    role: 'FIRM_PARTNER' as const,
  },
  {
    name: 'Asfand Sajjad',
    email: 'asfandsajjid@gmail.com',
    password: 'Probiz01',
    role: 'FIRM_PARTNER' as const,
  },
  {
    name: 'Ali Awan',
    email: 'ali.awan9167@gmail.com',
    password: 'Probiz01',
    role: 'FIRM_PARTNER' as const,
  },
];

async function getOrCreateTargetFirm() {
  const existingFirm = await prisma.organization.findFirst({
    where: {
      name: TARGET_FIRM.name,
      type: TARGET_FIRM.type,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  if (existingFirm) {
    return prisma.organization.update({
      where: {
        id: existingFirm.id,
      },
      data: {
        name: TARGET_FIRM.name,
        type: TARGET_FIRM.type,
        planName: TARGET_FIRM.planName,
        clientSlotLimit: TARGET_FIRM.clientSlotLimit,
        firmUserLimit: TARGET_FIRM.firmUserLimit,
      },
    });
  }

  return prisma.organization.create({
    data: TARGET_FIRM,
  });
}

async function seedPartnerUsers(firmId: string) {
  for (const partner of PARTNERS) {
    const email = partner.email.toLowerCase();
    const passwordHash = await bcrypt.hash(partner.password, 10);

    const user = await prisma.user.upsert({
      where: {
        email,
      },
      update: {
        name: partner.name,
        passwordHash,
      },
      create: {
        name: partner.name,
        email,
        passwordHash,
        preferredLanguage: 'roman_urdu',
      },
    });

    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: firmId,
          userId: user.id,
        },
      },
      update: {
        role: partner.role,
        status: 'active',
      },
      create: {
        organizationId: firmId,
        userId: user.id,
        role: partner.role,
        status: 'active',
      },
    });

    /**
     * Important:
     * If this partner already had an old personal accounting firm,
     * keep the old firm record but deactivate the old membership.
     * This prevents getFirmMembership/findFirst from selecting
     * "Ahmed's Accounting Firm" before "ProBiz Consultants".
     */
    await prisma.organizationMember.updateMany({
      where: {
        userId: user.id,
        organizationId: {
          not: firmId,
        },
        status: 'active',
        organization: {
          type: 'ACCOUNTANT_FIRM',
        },
      },
      data: {
        status: 'inactive',
      },
    });
  }
}

async function removeDemoFromActiveFirmAccess() {
  const demo = await prisma.user.findUnique({
    where: {
      email: 'demo@pakbooks.ai',
    },
  });

  if (!demo) return;

  await prisma.organizationMember.updateMany({
    where: {
      userId: demo.id,
      status: 'active',
      organization: {
        type: 'ACCOUNTANT_FIRM',
      },
    },
    data: {
      status: 'inactive',
    },
  });
}

async function printSeedSummary(firmId: string) {
  const firm = await prisma.organization.findUnique({
    where: {
      id: firmId,
    },
    include: {
      members: {
        where: {
          status: 'active',
        },
        include: {
          user: {
            select: {
              email: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
      businesses: {
        where: {
          status: 'active',
        },
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  console.log('Seed completed.');
  console.log(`Firm: ${firm?.name}`);
  console.log(`Firm users: ${firm?.members.length}/${firm?.firmUserLimit}`);
  console.log(
    firm?.members.map((member) => `- ${member.user.email} (${member.role})`).join('\n'),
  );
  console.log(`Client companies: ${firm?.businesses.length}/${firm?.clientSlotLimit}`);
}

async function main() {
  const firm = await getOrCreateTargetFirm();

  await seedPartnerUsers(firm.id);
  await removeDemoFromActiveFirmAccess();
  await printSeedSummary(firm.id);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
