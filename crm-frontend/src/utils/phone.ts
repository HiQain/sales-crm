const stripPhoneToDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

const normalizeUsDigits = (value: unknown) => {
  const digits = stripPhoneToDigits(value);

  if (!digits) {
    return '';
  }

  if (digits.length >= 11 && digits.startsWith('1')) {
    return digits.slice(1, 11);
  }

  return digits.slice(0, 10);
};

export const formatUsPhoneInput = (value: unknown) => {
  const digits = normalizeUsDigits(value);

  if (!digits) {
    return '';
  }

  if (digits.length < 4) {
    return digits;
  }

  if (digits.length < 7) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

export const normalizeUsPhoneForStorage = (value: unknown) => {
  const raw = String(value ?? '').trim();

  if (!raw) {
    return '';
  }

  const digits = stripPhoneToDigits(raw);
  const normalizedDigits =
    digits.length === 11 && digits.startsWith('1')
      ? digits.slice(1)
      : digits;

  if (normalizedDigits.length !== 10) {
    return null;
  }

  return `(${normalizedDigits.slice(0, 3)}) ${normalizedDigits.slice(3, 6)}-${normalizedDigits.slice(6)}`;
};
