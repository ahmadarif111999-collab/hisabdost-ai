import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PROBIZ_FIRM = {
  name: 'ProBiz Consultants',
  type: 'ACCOUNTANT_FIRM' as const,
  planName: 'Partner Beta',
  clientSlotLimit: 10,
  firmUserLimit: 5,
};

const PROBIZ_PARTNER_PASSWORD = 'Probiz01';

const PROBIZ_PARTNERS = [
  {
    name: 'Ahmad Arif',
    email: 'ahmadarif111999@gmail.com',
    role: 'FIRM_PARTNER' as const,
    canGrantClientAccess: true,
  },
  {
    name: 'Yasir Javaid',
    email: 'yjavaid01@gmail.com',
    role: 'FIRM_PARTNER' as const,
    canGrantClientAccess: false,
  },
  {
    name: 'Maysum Zaidi',
    email: 'maysumzaidi2001@gmail.com',
    role: 'FIRM_PARTNER' as const,
    canGrantClientAccess: false,
  },
  {
    name: 'Asfand Sajjad',
    email: 'asfandsajjid@gmail.com',
    role: 'FIRM_PARTNER' as const,
    canGrantClientAccess: false,
  },
  {
    name: 'Ali Awan',
    email: 'ali.awan9167@gmail.com',
    role: 'FIRM_PARTNER' as const,
    canGrantClientAccess: false,
  },
];

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

async function getOrCreateProBizFirm() {
  const existingFirm = await prisma.organization.findFirst({
    where: {
      name: PROBIZ_FIRM.name,
      type: PROBIZ_FIRM.type,
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
        name: PROBIZ_FIRM.name,
        type: PROBIZ_FIRM.type,
        planName: PROBIZ_FIRM.planName,
        clientSlotLimit: PROBIZ_FIRM.clientSlotLimit,
        firmUserLimit: PROBIZ_FIRM.firmUserLimit,
      },
    });
  }

  return prisma.organization.create({
    data: {
      name: PROBIZ_FIRM.name,
      type: PROBIZ_FIRM.type,
      planName: PROBIZ_FIRM.planName,
      clientSlotLimit: PROBIZ_FIRM.clientSlotLimit,
      firmUserLimit: PROBIZ_FIRM.firmUserLimit,
    },
  });
}

async function seedPartnerAccess(firmId: string) {
  const passwordHash = await bcrypt.hash(PROBIZ_PARTNER_PASSWORD, 10);

  for (const partner of PROBIZ_PARTNERS) {
    const email = normalizeEmail(partner.email);

    const user = await prisma.user.upsert({
      where: {
        email,
      },
      update: {
        name: partner.name,
        passwordHash,
        preferredLanguage: 'roman_urdu',
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
     * Disable old accidental personal firm memberships like:
     * "Ahmed's Accounting Firm"
     *
     * We do not delete the old organizations yet.
     * We just stop the backend from selecting them as active firm access.
     */
    await prisma.organizationMember.updateMany({
      where: {
        userId: user.id,
        organizationId: {
          not: firmId,
        },
        status: 'active',
        organization: {
          type: PROBIZ_FIRM.type,
        },
      },
      data: {
        status: 'inactive',
      },
    });
  }
}

async function disableDemoFirmAccess() {
  const demoUser = await prisma.user.findUnique({
    where: {
      email: 'demo@pakbooks.ai',
    },
  });

  if (!demoUser) return;

  await prisma.organizationMember.updateMany({
    where: {
      userId: demoUser.id,
      status: 'active',
      organization: {
        type: PROBIZ_FIRM.type,
      },
    },
    data: {
      status: 'inactive',
    },
  });
}

async function printSummary(firmId: string) {
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
              name: true,
              email: true,
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

  console.log('Seed completed');
  console.log(`Firm: ${firm?.name}`);
  console.log(`Firm users: ${firm?.members.length}/${firm?.firmUserLimit}`);
  console.log(`Client slots: ${firm?.businesses.length}/${firm?.clientSlotLimit}`);

  for (const member of firm?.members || []) {
    const partner = PROBIZ_PARTNERS.find(
      (item) => item.email === normalizeEmail(member.user.email),
    );

    console.log(
      `- ${member.user.email} | ${member.role} | client access admin: ${
        partner?.canGrantClientAccess ? 'yes' : 'no'
      }`,
    );
  }
}

async function main() {
  const firm = await getOrCreateProBizFirm();

  await seedPartnerAccess(firm.id);
  await disableDemoFirmAccess();
  await printSummary(firm.id);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
