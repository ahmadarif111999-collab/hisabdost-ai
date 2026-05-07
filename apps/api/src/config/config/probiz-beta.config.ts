export const PROBIZ_FIRM = {
  name: 'ProBiz Consultants',
  type: 'ACCOUNTANT_FIRM' as const,
  planName: 'Partner Beta',
  clientSlotLimit: 10,
  firmUserLimit: 5,
};

export const PROBIZ_PARTNER_PASSWORD = 'Probiz01';

export const PROBIZ_PARTNERS = [
  {
    name: 'Ahmad Arif',
    email: 'ahmadarif111999@gmail.com',
    role: 'FIRM_PARTNER',
    canGrantClientAccess: true,
  },
  {
    name: 'Yasir Javaid',
    email: 'yjavaid01@gmail.com',
    role: 'FIRM_PARTNER',
    canGrantClientAccess: false,
  },
  {
    name: 'Maysum Zaidi',
    email: 'maysumzaidi2001@gmail.com',
    role: 'FIRM_PARTNER',
    canGrantClientAccess: false,
  },
  {
    name: 'Asfand Sajjad',
    email: 'asfandsajjid@gmail.com',
    role: 'FIRM_PARTNER',
    canGrantClientAccess: false,
  },
  {
    name: 'Ali Awan',
    email: 'ali.awan9167@gmail.com',
    role: 'FIRM_PARTNER',
    canGrantClientAccess: false,
  },
];

export function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

export function isProBizPartnerEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return PROBIZ_PARTNERS.some((partner) => partner.email === normalizedEmail);
}

export function canGrantClientAccessEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return PROBIZ_PARTNERS.some(
    (partner) => partner.email === normalizedEmail && partner.canGrantClientAccess,
  );
}
