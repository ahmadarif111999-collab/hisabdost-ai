import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildWorkbookXlsxBase64,
  type WorkbookSheet,
  type XlsxRow,
  type XlsxValue,
} from '../../common/xlsx-export.util';
import { ReportApprovalService } from '../accounting/report-approval.service';
import { BusinessesService } from '../businesses/businesses.service';
import { ReferenceNumbersService } from './reference-numbers.service';
import { ReferencePresentationService } from './reference-presentation.service';

type RegisterKind = 'expense' | 'purchase';

type RegisterFilters = {
  startDate?: string;
  endDate?: string;
  vendor?: string;
  paymentMethod?: string;
  documentStatus?: string;
  reference?: string;
  search?: string;
};

type RegisterRow = {
  reference: string;
  journalReference: string;
  date: string;
  vendor: string;
  account: string;
  description: string;
  paymentMethod: string;
  amount: number;
  tax: number;
  documentStatus: string;
  receiptAttached: boolean;
  documentReference: string;
  createdBy: string;
  approvedBy: string;
  status: string;
};

@Injectable()
export class ExpensePurchaseRegistersService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
    private readonly references: ReferenceNumbersService,
    private readonly presentation: ReferencePresentationService,
  ) {}

  async list(
    userId: string,
    businessId: string,
    kind: RegisterKind,
    filters: RegisterFilters,
  ) {
    const business = await this.businesses.getAccessibleBusiness(
      userId,
      businessId,
    );

    const expenses = await this.prisma.expense.findMany({
      where: {
        businessId,
        kind,
        ...(filters.startDate || filters.endDate
          ? {
              expenseDate: {
                ...(filters.startDate
                  ? { gte: this.startOfDate(filters.startDate) }
                  : {}),
                ...(filters.endDate
                  ? { lte: this.endOfDate(filters.endDate) }
                  : {}),
              },
            }
          : {}),
      },
      include: {
        vendor: true,
      },
      orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
    });

    const expenseIds = expenses.map((expense) => expense.id);

    const journalEntries = expenseIds.length
      ? await this.prisma.journalEntry.findMany({
          where: {
            businessId,
            sourceType: kind,
            sourceId: {
              in: expenseIds,
            },
          },
          orderBy: [
            {
              entryDate: 'asc',
            },
            {
              createdAt: 'asc',
            },
          ],
        })
      : [];

    const journalBySourceId = new Map<
      string,
      (typeof journalEntries)[number]
    >();

    for (const entry of journalEntries) {
      if (
        entry.sourceId &&
        !journalBySourceId.has(entry.sourceId)
      ) {
        journalBySourceId.set(
          entry.sourceId,
          entry,
        );
      }
    }

    const accountIds = Array.from(
      new Set(
        expenses
          .flatMap((expense) => [
            expense.categoryAccountId,
            expense.paymentAccountId,
          ])
          .filter(
            (id): id is string =>
              Boolean(id),
          ),
      ),
    );

    const accounts = accountIds.length
      ? await this.prisma.account.findMany({
          where: {
            businessId,
            id: {
              in: accountIds,
            },
          },
        })
      : [];

    const accountById = new Map(
      accounts.map((account) => [
        account.id,
        account,
      ]),
    );

    const explicitDocumentIds = Array.from(
      new Set(
        expenses
          .map(
            (expense) =>
              expense.documentId,
          )
          .filter(
            (id): id is string =>
              Boolean(id),
          ),
      ),
    );

    const documents = expenseIds.length
      ? await this.prisma.document.findMany({
          where: {
            businessId,
            OR: [
              ...(explicitDocumentIds.length
                ? [
                    {
                      id: {
                        in: explicitDocumentIds,
                      },
                    },
                  ]
                : []),
              {
                linkedEntityId: {
                  in: expenseIds,
                },
              },
            ],
          },
          orderBy: {
            createdAt: 'asc',
          },
        })
      : [];

    const documentById = new Map(
      documents.map((document) => [
        document.id,
        document,
      ]),
    );

    const documentByLinkedEntityId =
      new Map<
        string,
        (typeof documents)[number]
      >();

    for (const document of documents) {
      if (
        document.linkedEntityId &&
        !documentByLinkedEntityId.has(
          document.linkedEntityId,
        )
      ) {
        documentByLinkedEntityId.set(
          document.linkedEntityId,
          document,
        );
      }
    }

    const userIds = Array.from(
      new Set(
        journalEntries
          .flatMap((entry) => [
            entry.createdById,
            entry.approvedById,
          ])
          .filter(
            (id): id is string =>
              Boolean(id),
          ),
      ),
    );

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: {
              in: userIds,
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        })
      : [];

    const userById = new Map(
      users.map((user) => [
        user.id,
        user,
      ]),
    );

    const entityReferences =
      await this.references.ensureMany(
        businessId,
        kind,
        expenses.map((expense) => ({
          id: expense.id,
          date: expense.expenseDate,
        })),
      );

    const journalReferences =
      await this.references.ensureMany(
        businessId,
        'journal',
        journalEntries.map((entry) => ({
          id: entry.id,
          date: entry.entryDate,
        })),
      );

    const documentReferences =
      await this.references.ensureMany(
        businessId,
        'document',
        documents.map((document) => ({
          id: document.id,
          date: document.createdAt,
        })),
      );

    const baseRows: RegisterRow[] =
      expenses.map((expense) => {
        const journal =
          journalBySourceId.get(
            expense.id,
          );

        const categoryAccount =
          accountById.get(
            expense.categoryAccountId,
          );

        const paymentAccount =
          expense.paymentAccountId
            ? accountById.get(
                expense.paymentAccountId,
              )
            : undefined;

        const document =
          expense.documentId
            ? documentById.get(
                expense.documentId,
              ) ||
              documentByLinkedEntityId.get(
                expense.id,
              )
            : documentByLinkedEntityId.get(
                expense.id,
              );

        const manualResolution =
          document?.fileType ===
          'application/x-hisabdost-manual-resolution';

        const createdBy =
          journal?.createdById
            ? userById.get(
                journal.createdById,
              )
            : undefined;

        const approvedBy =
          journal?.approvedById
            ? userById.get(
                journal.approvedById,
              )
            : undefined;

        return {
          reference:
            entityReferences[
              expense.id
            ] || 'Not assigned',

          journalReference: journal
            ? journalReferences[
                journal.id
              ] || 'Not assigned'
            : 'Not assigned',

          date: this.pakistanDate(
            expense.expenseDate,
          ),

          vendor:
            expense.vendor?.name ||
            'Not specified',

          account:
            categoryAccount?.name ||
            'Account not found',

          description:
            expense.description ||
            'No description',

          paymentMethod:
            this.paymentMethodLabel(
              paymentAccount,
            ),

          amount: Number(
            expense.amount || 0,
          ),

          tax: Number(
            expense.taxAmount || 0,
          ),

          documentStatus: document
            ? manualResolution
              ? 'Resolved manually'
              : 'Attached'
            : 'Missing',

          receiptAttached: Boolean(
            document &&
              !manualResolution,
          ),

          documentReference: document
            ? documentReferences[
                document.id
              ] || 'Not assigned'
            : 'Missing',

          createdBy:
            this.personLabel(
              createdBy,
            ) || 'Unknown user',

          approvedBy:
            this.personLabel(
              approvedBy,
            ) || 'Not approved',

          status:
            expense.status ||
            journal?.status ||
            'posted',
        };
      });

    const rows =
      this.applyFilters(
        baseRows,
        filters,
      );

    const vendors =
      this.uniqueOptions(
        baseRows.map(
          (row) => row.vendor,
        ),
        [
          'Not specified',
          '-',
        ],
      );

    const paymentMethods =
      this.uniqueOptions(
        baseRows.map(
          (row) =>
            row.paymentMethod,
        ),
        [
          'Not specified',
          '-',
        ],
      );

    return {
      kind,

      title:
        kind === 'expense'
          ? 'Expense Register'
          : 'Purchase Register',

      clientName: business.name,

      generatedAt:
        this.pakistanDateTime(
          new Date(),
        ),

      timezone: 'Asia/Karachi',

      filters: {
        startDate:
          filters.startDate ||
          null,

        endDate:
          filters.endDate ||
          null,

        vendor:
          filters.vendor || '',

        paymentMethod:
          filters.paymentMethod ||
          '',

        documentStatus:
          filters.documentStatus ||
          'all',

        reference:
          filters.reference || '',

        search:
          filters.search || '',
      },

      options: {
        vendors,
        paymentMethods,
      },

      rows,

      totals: {
        count: rows.length,

        amount: rows.reduce(
          (sum, row) =>
            sum + row.amount,
          0,
        ),

        tax: rows.reduce(
          (sum, row) =>
            sum + row.tax,
          0,
        ),

        missingDocuments:
          rows.filter(
            (row) =>
              row.documentStatus ===
              'Missing',
          ).length,

        attachedDocuments:
          rows.filter(
            (row) =>
              row.documentStatus ===
              'Attached',
          ).length,

        manualResolutions:
          rows.filter(
            (row) =>
              row.documentStatus ===
              'Resolved manually',
          ).length,
      },
    };
  }

  async exportXlsx(
    userId: string,
    businessId: string,
    kind: RegisterKind,
    filters: RegisterFilters,
  ) {
    const approval =
      this.moduleRef.get(
        ReportApprovalService,
        {
          strict: false,
        },
      );

    await approval.assertCanDirectExport(
      userId,
      businessId,
    );

    const register =
      await this.list(
        userId,
        businessId,
        kind,
        filters,
      );

    const reportType =
      kind === 'expense'
        ? 'expense-register'
        : 'purchase-register';

    const provisionalFilename =
      `pending-${reportType}.xlsx`;

    const exportRecord =
      await this.presentation.createExportRecord(
        userId,
        businessId,
        reportType,
        'xlsx',
        provisionalFilename,
        {
          ...filters,
          registerKind: kind,
        },
      );

    const exportNo =
      await this.references.attachReference(
        businessId,
        'report_export',
        exportRecord.id,
        exportRecord.createdAt ||
          new Date(),
      );

    const filename =
      `${exportNo}-${reportType}-${this.fileDate(
        filters.startDate,
        'from',
      )}-to-${this.fileDate(
        filters.endDate,
        'to',
      )}.xlsx`;

    const workbook =
      buildWorkbookXlsxBase64([
        this.exportDetailsSheet(
          exportNo,
          register,
        ),
        this.registerSheet(
          register,
        ),
      ]);

    await this.presentation.updateExportRecord(
      exportRecord.id,
      filename,
      {
        ...filters,
        registerKind: kind,
        exportReference:
          exportNo,
      },
    );

    return {
      exportNo,

      referenceNo:
        exportNo,

      displayNumber:
        exportNo,

      filename,

      mimeType:
        workbook.mimeType,

      contentBase64:
        workbook.contentBase64,

      base64:
        workbook.contentBase64,

      fileBase64:
        workbook.contentBase64,

      message:
        `${exportNo} filtered ${register.title} exported successfully.`,
    };
  }

  private applyFilters(
    rows: RegisterRow[],
    filters: RegisterFilters,
  ) {
    const vendor =
      this.normalized(
        filters.vendor,
      );

    const paymentMethod =
      this.normalized(
        filters.paymentMethod,
      );

    const documentStatus =
      this.normalized(
        filters.documentStatus ||
          'all',
      );

    const reference =
      this.normalized(
        filters.reference,
      );

    const search =
      this.normalized(
        filters.search,
      );

    return rows.filter(
      (row) => {
        if (
          vendor &&
          this.normalized(
            row.vendor,
          ) !== vendor
        ) {
          return false;
        }

        if (
          paymentMethod &&
          this.normalized(
            row.paymentMethod,
          ) !== paymentMethod
        ) {
          return false;
        }

        if (
          documentStatus !==
            'all' &&
          documentStatus !==
            this.documentFilterValue(
              row.documentStatus,
            )
        ) {
          return false;
        }

        if (
          reference &&
          ![
            row.reference,
            row.journalReference,
            row.documentReference,
          ].some((value) =>
            this.normalized(
              value,
            ).includes(
              reference,
            ),
          )
        ) {
          return false;
        }

        if (
          search &&
          ![
            row.reference,
            row.journalReference,
            row.date,
            row.vendor,
            row.account,
            row.description,
            row.paymentMethod,
            row.documentStatus,
            row.documentReference,
            row.createdBy,
            row.approvedBy,
            row.status,
          ].some((value) =>
            this.normalized(
              value,
            ).includes(
              search,
            ),
          )
        ) {
          return false;
        }

        return true;
      },
    );
  }

  private exportDetailsSheet(
    exportNo: string,
    register: any,
  ): WorkbookSheet {
    return {
      name: 'Export Details',

      rows: [
        {
          values: [
            register.title,
            exportNo,
          ],
          style: 2,
        },

        {
          values: [
            'Export Reference',
            exportNo,
          ],
          style: 3,
        },

        {
          values: [
            'Client',
            register.clientName ||
              '-',
          ],
        },

        {
          values: [
            'Generated At',
            register.generatedAt ||
              '-',
          ],
        },

        {
          values: [
            'Timezone',
            register.timezone ||
              'Asia/Karachi',
          ],
        },

        {
          values: [
            'Start Date',
            register.filters
              .startDate ||
              'Not specified',
          ],
        },

        {
          values: [
            'End Date',
            register.filters
              .endDate ||
              'Not specified',
          ],
        },

        {
          values: [
            'Vendor Filter',
            register.filters
              .vendor ||
              'All vendors',
          ],
        },

        {
          values: [
            'Payment Method Filter',
            register.filters
              .paymentMethod ||
              'All methods',
          ],
        },

        {
          values: [
            'Document Filter',
            register.filters
              .documentStatus ||
              'all',
          ],
        },

        {
          values: [
            'Reference Search',
            register.filters
              .reference ||
              'Not applied',
          ],
        },

        {
          values: [
            'Rows',
            register.totals
              .count,
          ],
        },

        {
          values: [
            'Amount',
            register.totals
              .amount,
          ],
        },

        {
          values: [
            'Tax',
            register.totals.tax,
          ],
        },

        {
          values: [
            'Missing Documents',
            register.totals
              .missingDocuments,
          ],
        },

        {
          values: [
            'Attached Documents',
            register.totals
              .attachedDocuments,
          ],
        },

        {
          values: [
            'Manual Resolutions',
            register.totals
              .manualResolutions,
          ],
        },

        {
          values: [],
        },

        {
          values: [
            'Note',
            'Internal database IDs are intentionally excluded from this workbook.',
          ],
        },
      ],
    };
  }

  private registerSheet(
    register: any,
  ): WorkbookSheet {
    const rows: XlsxRow[] = [
      {
        values: [
          register.title,
        ],
        style: 2,
      },

      {
        values: [
          'Reference',
          'Journal Reference',
          'Date',
          'Supplier / Vendor',
          'Account',
          'Description',
          'Payment Method',
          'Amount',
          'Tax',
          'Document Status',
          'Receipt Attached',
          'Document Reference',
          'Created By',
          'Approved By',
          'Status',
        ],
        style: 1,
      },

      ...register.rows.map(
        (
          row: RegisterRow,
        ) => ({
          values: [
            row.reference,
            row.journalReference,
            row.date,
            row.vendor,
            row.account,
            row.description,
            row.paymentMethod,
            row.amount,
            row.tax,
            row.documentStatus,
            row.receiptAttached
              ? 'Yes'
              : 'No',
            row.documentReference,
            row.createdBy,
            row.approvedBy,
            row.status,
          ] as XlsxValue[],
          style: 4,
        }),
      ),

      {
        values: [],
      },

      {
        values: [
          'Filtered totals',
        ],
        style: 3,
      },

      {
        values: [
          'Count',
          register.totals.count,
        ],
      },

      {
        values: [
          'Amount',
          register.totals.amount,
        ],
      },

      {
        values: [
          'Tax',
          register.totals.tax,
        ],
      },

      {
        values: [
          'Missing Documents',
          register.totals
            .missingDocuments,
        ],
      },

      {
        values: [
          'Attached Documents',
          register.totals
            .attachedDocuments,
        ],
      },

      {
        values: [
          'Manual Resolutions',
          register.totals
            .manualResolutions,
        ],
      },
    ];

    return {
      name: register.title,
      rows,
    };
  }

  private paymentMethodLabel(
    account:
      | {
          code: string;
          name: string;
        }
      | undefined,
  ) {
    if (!account) {
      return 'Not specified';
    }

    const code = String(
      account.code || '',
    ).trim();

    if (code === '1000') {
      return 'Cash';
    }

    if (code === '1010') {
      return 'Bank';
    }

    if (code === '1020') {
      return 'Wallet';
    }

    if (code === '2000') {
      return 'Payable';
    }

    return (
      account.name ||
      code ||
      'Not specified'
    );
  }

  private documentFilterValue(
    status: string,
  ) {
    const normalized =
      this.normalized(status);

    if (
      normalized ===
      'attached'
    ) {
      return 'attached';
    }

    if (
      normalized ===
      'resolved manually'
    ) {
      return 'manual';
    }

    return 'missing';
  }

  private personLabel(
    person:
      | {
          name: string;
          email: string;
        }
      | undefined,
  ) {
    return (
      person?.name ||
      person?.email ||
      ''
    );
  }

  private uniqueOptions(
    values: string[],
    excluded: string[],
  ) {
    const excludedSet =
      new Set(
        excluded.map(
          (value) =>
            this.normalized(
              value,
            ),
        ),
      );

    return Array.from(
      new Set(
        values
          .map((value) =>
            String(
              value || '',
            ).trim(),
          )
          .filter(Boolean)
          .filter(
            (value) =>
              !excludedSet.has(
                this.normalized(
                  value,
                ),
              ),
          ),
      ),
    ).sort(
      (left, right) =>
        left.localeCompare(
          right,
        ),
    );
  }

  private normalized(
    value: unknown,
  ) {
    return String(
      value || '',
    )
      .trim()
      .toLowerCase();
  }

  private startOfDate(
    value: string,
  ) {
    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return new Date(0);
    }

    return date;
  }

  private endOfDate(
    value: string,
  ) {
    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return new Date(
        8640000000000000,
      );
    }

    date.setUTCHours(
      23,
      59,
      59,
      999,
    );

    return date;
  }

  private pakistanDate(
    value: Date,
  ) {
    return new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'Asia/Karachi',

        year: 'numeric',

        month:
          '2-digit',

        day: '2-digit',
      },
    ).format(value);
  }

  private pakistanDateTime(
    value: Date,
  ) {
    return new Intl.DateTimeFormat(
      'en-PK',
      {
        timeZone:
          'Asia/Karachi',

        year: 'numeric',

        month: 'short',

        day: '2-digit',

        hour: '2-digit',

        minute:
          '2-digit',

        hour12: true,
      },
    ).format(value);
  }

  private fileDate(
    value:
      | string
      | undefined,
    fallback: string,
  ) {
    return String(
      value || fallback,
    ).replace(
      /[^0-9a-zA-Z-]+/g,
      '-',
    );
  }
}
