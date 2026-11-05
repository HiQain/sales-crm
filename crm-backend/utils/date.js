const pad = (value) => String(value).padStart(2, '0');

const formatLocalDate = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// Returns the LOCAL calendar day as 'YYYY-MM-DD'.
// Deliberately avoids toISOString(), which converts to UTC and can shift a DATE value
// (read back as local midnight) to the previous day in timezones ahead of UTC.
export const toDateOnly = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : formatLocalDate(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const directMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch) {
      return directMatch[1];
    }
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return formatLocalDate(parsed);
  }

  return null;
};
