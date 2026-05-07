import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const firmName = 'ProBiz AI Firm';

const ownerUser = {
  name: 'Firm Owner',
  email: 'demo@pakbooks.ai',
  password: 'password123',
};

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
  const ownerPasswordHash = await bcrypt.hash(ownerUser.password, 10);
  const partnerPasswordHash = await bcrypt.hash('Probiz01', 10);

  const owner = await prisma.user.upsert({
    where: {
      email: ownerUser.email.toLowerCase(),
    },
    update: {
      name: ownerUser.name,
      passwordHash: ownerPasswordHash,
    },
    create: {
      name: ownerUser.name,
      email: ownerUser.email.toLowerCase(),
      phone: '+923001234567',
      passwordHash: ownerPasswordHash,
    },
  });

  const firstPartner = await prisma.user.upsert({
    where: {
      email: partnerUsers[0].email.toLowerCase(),
    },
    update: {
      name: partnerUsers[0].name,
      passwordHash: partnerPasswordHash,
    },
    create: {
      name: partnerUsers[0].name,
      email: partnerUsers[0].email.toLowerCase(),
      passwordHash: partnerPasswordHash,
    },
  });

  const existingPartnerFirmMembership =
    await prisma.organizationMember.findFirst({
      where: {
        userId: firstPartner.id,
        organization: {
          type: 'ACCOUNTANT_FIRM',
        },
      },
      include: {
        organization: true,
      },
    });

  const existingOwnerFirmMembership =
    await prisma.organizationMember.findFirst({
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

  const existingNamedFirm = await prisma.organization.findFirst({
    where: {
      name: firmName,
      type: 'ACCOUNTANT_FIRM',
    },
  });

  const firmRecord =
    existingPartnerFirmMembership?.organization ??
    existingOwnerFirmMembership?.organization ??
    existingNamedFirm ??
    (await prisma.organization.create({
      data: {
        name: firmName,
        type: 'ACCOUNTANT_FIRM',
        planName: 'Firm Starter',
        clientSlotLimit: 10,
        firmUserLimit: 10,
      },
    }));

  const firm = await prisma.organization.update({
    where: {
      id: firmRecord.id,
    },
    data: {
      name: firmName,
      type: 'ACCOUNTANT_FIRM',
      planName: 'Firm Starter',
      clientSlotLimit: 10,
      firmUserLimit: 10,
    },
  });

  await prisma.organizationMember.deleteMany({
    where: {
      userId: owner.id,
      organizationId: {
        not: firm.id,
      },
      organization: {
        type: 'ACCOUNTANT_FIRM',
      },
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

    await prisma.organizationMember.deleteMany({
      where: {
        userId: user.id,
        organizationId: {
          not: firm.id,
        },
        organization: {
          type: 'ACCOUNTANT_FIRM',
        },
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

  console.log('Firm users connected successfully');
  console.log({
    firm: firm.name,
    firmUserLimit: firm.firmUserLimit,
    owner: owner.email,
    partnerPassword: 'Probiz01',
    partners: partnerUsers.map((partner) => partner.email),
    expectedFirmUserCount: 6,
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
