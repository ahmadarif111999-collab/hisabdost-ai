'use client';

import Link from 'next/link';
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import {
  Card,
  Input,
  Select,
} from '@/components/Card';
import {
  api,
  getBusinessId,
} from '@/lib/api';

type TxType =
  | 'sale'
  | 'purchase'
  | 'expense'
  | 'receive'
  | 'pay_supplier';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type TransactionResult = {
  message?: string;
  expense?: {
    id: string;
  };
  purchase?: {
    id: string;
  };
};

const transactionLabels:
  Record<TxType, string> = {
    sale: 'Sale',
    purchase: 'Purchase',
    expense: 'Expense',
    receive: 'Receive Payment',
    pay_supplier: 'Pay Supplier',
  };

export default function TransactionsPage() {
  const [
    type,
    setType,
  ] = useState<TxType>('sale');

  const [
    accounts,
    setAccounts,
  ] = useState<Account[]>([]);

  const [
    amount,
    setAmount,
  ] = useState('');

  const [
    paymentMethod,
    setPaymentMethod,
  ] = useState('cash');

  const [
    accountCode,
    setAccountCode,
  ] = useState('');

  const [
    partyName,
    setPartyName,
  ] = useState('');

  const [
    description,
    setDescription,
  ] = useState('');

  const [
    receiptFile,
    setReceiptFile,
  ] = useState<File | null>(
    null,
  );

  const [
    message,
    setMessage,
  ] = useState('');

  const [
    error,
    setError,
  ] = useState('');

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    recordedWithoutDocument,
    setRecordedWithoutDocument,
  ] = useState(false);

  async function loadAccounts() {
    const businessId =
      getBusinessId();

    if (!businessId) {
      setAccounts([]);
      return;
    }

    try {
      const result =
        await api<Account[]>(
          `/accounting/businesses/${businessId}/accounts`,
        );

      setAccounts(result);
    } catch {
      setAccounts([]);
    }
  }

  useEffect(() => {
    void loadAccounts();

    window.addEventListener(
      'pakbooks-business-changed',
      loadAccounts,
    );

    return () => {
      window.removeEventListener(
        'pakbooks-business-changed',
        loadAccounts,
      );
    };
  }, []);

  const accountOptions =
    useMemo(
      () =>
        accounts.filter(
          (account) => {
            if (
              type === 'sale'
            ) {
              return (
                account.type ===
                'INCOME'
              );
            }

            if (
              type === 'purchase'
            ) {
              return (
                account.code ===
                  '5000' ||
                account.code ===
                  '1200' ||
                account.name
                  .toLowerCase()
                  .includes(
                    'purchase',
                  )
              );
            }

            if (
              type === 'expense'
            ) {
              return (
                account.type ===
                'EXPENSE'
              );
            }

            return false;
          },
        ),
      [accounts, type],
    );

  function changeType(
    nextType: TxType,
  ) {
    if (busy) {
      return;
    }

    setType(nextType);
    setPaymentMethod('cash');
    setAccountCode('');
    setMessage('');
    setError('');

    setRecordedWithoutDocument(
      false,
    );

    if (
      nextType !== 'purchase' &&
      nextType !== 'expense'
    ) {
      setReceiptFile(null);
    }
  }

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (busy) {
      return;
    }

    const businessId =
      getBusinessId();

    if (!businessId) {
      setError(
        'Please add or select a client company first.',
      );

      return;
    }

    const numericAmount =
      Number(amount);

    if (
      !Number.isFinite(
        numericAmount,
      ) ||
      numericAmount <= 0
    ) {
      setError(
        'Enter a valid transaction amount greater than zero.',
      );

      return;
    }

    setBusy(true);
    setMessage('');
    setError('');

    setRecordedWithoutDocument(
      false,
    );

    const body:
      Record<string, unknown> = {
        amount: numericAmount,
        paymentMethod,
        accountCode:
          accountCode ||
          undefined,
        description:
          description.trim() ||
          undefined,
      };

    let path = '';

    if (type === 'sale') {
      path = 'sales';

      body.customerName =
        partyName.trim() ||
        undefined;
    }

    if (type === 'purchase') {
      path = 'purchases';

      body.vendorName =
        partyName.trim() ||
        undefined;
    }

    if (type === 'expense') {
      path = 'expenses';

      body.vendorName =
        partyName.trim() ||
        undefined;

      body.category =
        description.trim() ||
        undefined;
    }

    if (type === 'receive') {
      path = 'payments/receive';

      body.partyName =
        partyName.trim() ||
        undefined;
    }

    if (
      type === 'pay_supplier'
    ) {
      path =
        'payments/pay-supplier';

      body.partyName =
        partyName.trim() ||
        undefined;
    }

    try {
      const result =
        await api<TransactionResult>(
          `/accounting/businesses/${businessId}/${path}`,
          {
            method: 'POST',
            body: JSON.stringify(
              body,
            ),
          },
        );

      const expenseId =
        result.purchase?.id ||
        result.expense?.id;

      const supportsReceipt =
        type === 'purchase' ||
        type === 'expense';

      if (
        supportsReceipt &&
        receiptFile &&
        expenseId
      ) {
        const uploadBody =
          new FormData();

        uploadBody.append(
          'file',
          receiptFile,
        );

        try {
          await api(
            `/documents/businesses/${businessId}/expenses/${expenseId}/attach?documentType=RECEIPT&process=true`,
            {
              method: 'POST',
              body: uploadBody,
            },
          );

          setMessage(
            `${transactionLabels[type]} recorded and the receipt was attached successfully.`,
          );
        } catch (
          attachmentError
        ) {
          setRecordedWithoutDocument(
            true,
          );

          setMessage(
            `${transactionLabels[type]} was recorded, but the receipt could not be attached. The item is now visible in Missing Documents.`,
          );

          setError(
            attachmentError instanceof
              Error
              ? attachmentError.message
              : 'Receipt attachment failed after the transaction was recorded.',
          );
        }
      } else {
        setMessage(
          result.message ||
            `${transactionLabels[type]} recorded.`,
        );

        if (
          supportsReceipt &&
          !receiptFile
        ) {
          setRecordedWithoutDocument(
            true,
          );
        }
      }

      setAmount('');
      setPartyName('');
      setDescription('');
      setAccountCode('');
      setReceiptFile(null);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not record the transaction.',
      );
    } finally {
      setBusy(false);
    }
  }

  const supportsReceipt =
    type === 'purchase' ||
    type === 'expense';

  return (
    <AppShell>
      <ClientRequired>
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              Client books
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Transactions
            </h1>

            <p className="mt-1 text-slate-600">
              Record sales,
              purchases, expenses,
              customer recoveries,
              and supplier payments.
            </p>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {message}
            </div>
          )}

          {recordedWithoutDocument && (
            <Link
              href="/documents?missing=true"
              className="block rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              Open Missing
              Documents to attach
              the receipt or add a
              resolution note →
            </Link>
          )}

          <Card>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 md:grid-cols-5">
              <Tab
                label="Sale"
                active={
                  type === 'sale'
                }
                onClick={() =>
                  changeType('sale')
                }
              />

              <Tab
                label="Purchase"
                active={
                  type ===
                  'purchase'
                }
                onClick={() =>
                  changeType(
                    'purchase',
                  )
                }
              />

              <Tab
                label="Expense"
                active={
                  type ===
                  'expense'
                }
                onClick={() =>
                  changeType(
                    'expense',
                  )
                }
              />

              <Tab
                label="Receive"
                active={
                  type ===
                  'receive'
                }
                onClick={() =>
                  changeType(
                    'receive',
                  )
                }
              />

              <Tab
                label="Pay Supplier"
                active={
                  type ===
                  'pay_supplier'
                }
                onClick={() =>
                  changeType(
                    'pay_supplier',
                  )
                }
              />
            </div>

            <form
              onSubmit={submit}
              className="mt-5 grid gap-4"
            >
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Amount e.g. 45000"
                value={amount}
                onChange={(
                  event,
                ) =>
                  setAmount(
                    event.target
                      .value,
                  )
                }
                required
                disabled={busy}
              />

              <Select
                value={
                  paymentMethod
                }
                onChange={(
                  event,
                ) =>
                  setPaymentMethod(
                    event.target
                      .value,
                  )
                }
                disabled={busy}
              >
                <option value="cash">
                  Cash
                </option>

                <option value="bank">
                  Bank
                </option>

                <option value="wallet">
                  JazzCash /
                  Easypaisa /
                  Wallet
                </option>

                {type ===
                  'sale' && (
                  <option value="credit">
                    Credit /
                    Receivable
                  </option>
                )}

                {supportsReceipt && (
                  <option value="payable">
                    Unpaid /
                    Payable
                  </option>
                )}
              </Select>

              {accountOptions.length >
                0 && (
                <Select
                  value={
                    accountCode
                  }
                  onChange={(
                    event,
                  ) =>
                    setAccountCode(
                      event.target
                        .value,
                    )
                  }
                  disabled={busy}
                >
                  <option value="">
                    Default account
                    head
                  </option>

                  {accountOptions.map(
                    (account) => (
                      <option
                        key={
                          account.id
                        }
                        value={
                          account.code
                        }
                      >
                        {
                          account.code
                        }{' '}
                        —{' '}
                        {
                          account.name
                        }
                      </option>
                    ),
                  )}
                </Select>
              )}

              <Input
                placeholder={
                  type === 'sale' ||
                  type === 'receive'
                    ? 'Customer name optional'
                    : 'Supplier/vendor name optional'
                }
                value={partyName}
                onChange={(
                  event,
                ) =>
                  setPartyName(
                    event.target
                      .value,
                  )
                }
                disabled={busy}
              />

              <Input
                placeholder="Description e.g. rent, electricity bill, stock purchase"
                value={description}
                onChange={(
                  event,
                ) =>
                  setDescription(
                    event.target
                      .value,
                  )
                }
                disabled={busy}
              />

              {supportsReceipt && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                  <label className="block text-sm font-bold text-slate-800">
                    Supporting receipt
                    or invoice
                  </label>

                  <p className="mt-1 text-xs text-slate-500">
                    Optional. When
                    omitted, the
                    transaction will
                    appear in Missing
                    Documents.
                  </p>

                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(
                      event,
                    ) =>
                      setReceiptFile(
                        event.target
                          .files?.[0] ||
                          null,
                      )
                    }
                    disabled={busy}
                    className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:font-semibold file:text-white"
                  />

                  {receiptFile && (
                    <p className="mt-2 text-xs font-semibold text-emerald-700">
                      Selected:{' '}
                      {
                        receiptFile.name
                      }
                    </p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy
                  ? 'Recording...'
                  : `Record ${transactionLabels[type]}`}
              </button>
            </form>
          </Card>
        </div>
      </ClientRequired>
    </AppShell>
  );
}

function Tab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-600 hover:bg-white/60'
      }`}
    >
      {label}
    </button>
  );
}
