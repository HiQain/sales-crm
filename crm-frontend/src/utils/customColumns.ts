import type { StoredCustomColumn } from './columnLayout';

export type CustomColumnDefinition = StoredCustomColumn;

export type CustomColumnValues = Record<string, Record<string, string>>;

export function createCustomColumnId(label: string) {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  return `custom:${slug || 'column'}-${Date.now()}`;
}

export function loadCustomColumnValues(storageKey: string): CustomColumnValues {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([rowId, value]) => {
        if (!value || typeof value !== 'object') return [];

        const normalizedEntries = Object.entries(value).flatMap(([columnId, cellValue]) => {
          if (typeof cellValue !== 'string') return [];
          return [[columnId, cellValue]] as const;
        });

        return normalizedEntries.length > 0
          ? [[String(rowId), Object.fromEntries(normalizedEntries)]]
          : [];
      }),
    );
  } catch {
    return {};
  }
}

export function saveCustomColumnValues(storageKey: string, values: CustomColumnValues) {
  localStorage.setItem(storageKey, JSON.stringify(values));
}

export function pickCustomColumnValues(
  row: Record<string, unknown>,
  customColumns: CustomColumnDefinition[],
) {
  return Object.fromEntries(
    customColumns.flatMap((column) => {
      const value = row[column.id];
      if (typeof value !== 'string' || value.trim() === '') return [];
      return [[column.id, value]];
    }),
  );
}
