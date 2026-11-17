import type { ClientJourney, ClientOption } from '../types';

export const UNNAMED_CLIENT = 'No client name';

// Rows are grouped by client_id. Rows without one (not linked yet) fall back to their name.
export const getClientKey = (record: Pick<ClientJourney, 'client_id' | 'client_name'>) =>
  record.client_id ? `id:${record.client_id}` : `name:${(record.client_name || '').trim().toLowerCase()}`;

const firstFilled = (values: Array<string | undefined>) =>
  values.map((value) => (value || '').trim()).find(Boolean) || '';

export const buildClientOptions = (records: ClientJourney[]): ClientOption[] => {
  const byKey = new Map<string, { option: ClientOption; records: ClientJourney[] }>();

  for (const record of records) {
    const key = getClientKey(record);
    if (!byKey.has(key)) {
      byKey.set(key, {
        option: {
          key,
          id: record.client_id ?? null,
          name: (record.client_name || '').trim() || UNNAMED_CLIENT,
          hint: '',
          nameNumber: null,
          businesses: [],
          rowCount: 0,
        },
        records: [],
      });
    }
    byKey.get(key)!.records.push(record);
  }

  // Same-name clients are numbered #1, #2, ... within their name, oldest client first.
  const sameNameGroups = new Map<string, ClientOption[]>();
  byKey.forEach(({ option }) => {
    const nameKey = option.name.toLowerCase();
    if (!sameNameGroups.has(nameKey)) sameNameGroups.set(nameKey, []);
    sameNameGroups.get(nameKey)!.push(option);
  });
  const duplicateNumber = new Map<string, number>();
  sameNameGroups.forEach((group) => {
    if (group.length < 2) return;
    [...group]
      .sort((a, b) => (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER))
      .forEach((option, index) => duplicateNumber.set(option.key, index + 1));
  });

  const options = [...byKey.values()].map(({ option, records: clientRecords }) => {
    const businesses = new Map<string, string>();
    clientRecords.forEach((record) => {
      const business = (record.business_name || '').trim();
      if (business && !businesses.has(business.toLowerCase())) businesses.set(business.toLowerCase(), business);
    });
    const businessList = [...businesses.values()].sort((a, b) => a.localeCompare(b));
    const number = duplicateNumber.get(option.key);

    return {
      ...option,
      businesses: businessList,
      rowCount: clientRecords.length,
      nameNumber: number ?? null,
      // The number tells same-name clients apart; the detail after it is a reminder of who it is.
      hint: number
        ? [
          `#${number}`,
          firstFilled([
            businessList[0],
            ...clientRecords.map((record) => record.phone),
            ...clientRecords.map((record) => record.email),
          ]),
        ].filter(Boolean).join(' · ')
        : '',
    };
  });

  return options.sort((a, b) => {
    if (a.name === UNNAMED_CLIENT) return 1;
    if (b.name === UNNAMED_CLIENT) return -1;
    return a.name.localeCompare(b.name) || (a.id ?? 0) - (b.id ?? 0);
  });
};
