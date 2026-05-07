import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_ACCOUNTS } from '../src/modules/businesses/businesses.service';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'demo@pakbooks.ai' },
    update: { name: 'Firm Owner' },
    create: {
      name: 'Firm Owner',
      email: 'demo@pakbooks.ai',
      phone: '+923001234567',
      passwordHash,
    },
  });

  const existingFirmMembership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, organization: { type: 'ACCOUNTANT_FIRM' } },
    include: { organization: true },
  });

  const firm = existingFirmMembership?.organization ?? await prisma.organization.create({
    data: {
      name: 'HisabDost Accounting Firm',
      type: 'ACCOUNTANT_FIRM',
      planName: 'Firm Starter',
      clientSlotLimit: 10,
      firmUserLimit: 5,
      members: {
        create: {
          userId: user.id,
          role: 'FIRM_OWNER',
        },
      },
    },
  });


  for (const [index, account] of DEFAULT_ACCOUNTS.entries()) {
    await prisma.accountTemplate.upsert({
      where: { organizationId_code: { organizationId: firm.id, code: account.code } },
      update: {
        name: account.name,
        type: account.type,
        description: account.description,
        isTaxSensitive: account.requiresReview || account.name.toLowerCase().includes('tax') || account.name.toLowerCase().includes('withholding'),
        sortOrder: index,
        isActive: true,
      },
      create: {
        organizationId: firm.id,
        code: account.code,
        name: account.name,
        type: account.type,
        description: account.description,
        isTaxSensitive: account.requiresReview || account.name.toLowerCase().includes('tax') || account.name.toLowerCase().includes('withholding'),
        sortOrder: index,
      },
    });
  }

  const templates = [
    {
      code: 'FBR_INCOME_TAX_RETURN_INDIVIDUAL_AOP',
      title: 'Income tax return reminder',
      authority: 'FBR',
      frequency: 'yearly',
      dueDateRuleJson: { month: 9, day: 30, note: 'Configurable; verify with accountant/FBR.' },
      reminderOffsetsJson: [30, 14, 7, 1, 0],
    },
    {
      code: 'FBR_SALES_TAX_MONTHLY_RETURN',
      title: 'Monthly sales tax return review',
      authority: 'FBR',
      frequency: 'monthly',
      dueDateRuleJson: { day: 18, monthOffset: 1, note: 'Configurable; verify with accountant/FBR.' },
      reminderOffsetsJson: [10, 5, 2, 0],
    },
    {
      code: 'MONTHLY_BOOK_CLOSE',
      title: 'Monthly bookkeeping close',
      authority: 'Internal',
      frequency: 'monthly',
      dueDateRuleJson: { day: 5, monthOffset: 1 },
      reminderOffsetsJson: [5, 2, 0],
    },
    {
      code: 'SECP_ANNUAL_RETURN_REVIEW',
      title: 'SECP annual return review',
      authority: 'SECP',
      frequency: 'yearly',
      dueDateRuleJson: { note: 'Configurable by admin/accountant. Do not hardcode final deadline.' },
      reminderOffsetsJson: [30, 14, 7, 1, 0],
    },
  ];

  for (const template of templates) {
    await prisma.complianceRuleTemplate.upsert({
      where: { code: template.code },
      update: template,
      create: template,
    });
  }

  console.log('Seed complete');
  console.log({
    email: user.email,
    password: 'password123',
    firm: firm.name,
    clientSlots: firm.clientSlotLimit,
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
