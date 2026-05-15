const stripPhoneToDigits = (value) => String(value ?? '').replace(/\D/g, '');

const normalizeUsDigits = (value) => {
  const digits = stripPhoneToDigits(value);

  if (!digits) {
    return '';
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }

  return digits;
};

export const formatUsPhoneFromDigits = (digits) => {
  if (digits.length !== 10) {
    return null;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

export const normalizeUsPhoneForStorage = (value) => {
  const raw = String(value ?? '').trim();

  if (!raw) {
    return '';
  }

  const digits = normalizeUsDigits(raw);
  return formatUsPhoneFromDigits(digits);
};

export const isPhoneBlank = (value) => String(value ?? '').trim() === '';
