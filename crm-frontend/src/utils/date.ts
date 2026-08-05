import { format } from 'date-fns';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const toDisplayDate = (value: unknown): Date | null => {
  if (!value) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const dateOnlyMatch = trimmed.match(DATE_ONLY_PATTERN);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDateDisplay = (value: unknown) => {
  const parsed = toDisplayDate(value);
  return parsed ? format(parsed, 'dd-MMMM-yy') : '';
};

export const formatDateTimeDisplay = (value: unknown) => {
  const parsed = toDisplayDate(value);
  return parsed ? format(parsed, 'dd-MMMM-yy h:mm a') : '';
};

export const formatRowTimestampTooltip = (row: {
  created_at?: string;
  updated_at?: string;
  __isDraft?: boolean;
  is_date_marker?: boolean;
} | null | undefined) => {
  if (!row || row.__isDraft || row.is_date_marker) {
    return '';
  }

  const createdAt = formatDateTimeDisplay(row.created_at);
  const updatedAt = formatDateTimeDisplay(row.updated_at);

  if (!createdAt && !updatedAt) {
    return '';
  }

  return [
    `Created: ${createdAt || '-'}`,
    `Updated: ${updatedAt || '-'}`,
  ].join('\n');
};
