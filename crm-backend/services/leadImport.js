import { isPhoneBlank, normalizeUsPhoneForStorage } from '../utils/phone.js';

export const MAX_LEAD_IMPORT_ROWS = 3000;

const STRING_LIMITS = {
  contact: 255,
  email: 255,
  business_owner: 255,
  business_name: 255,
  source: 255,
  service: 255,
  notes: 16000,
  lead_status: 100,
};

const getString = (value) => String(value ?? '').trim();

const validateLength = (field, value, rowNumber) => {
  const limit = STRING_LIMITS[field];
  if (limit && value.length > limit) {
    throw new Error(`Spreadsheet row ${rowNumber} has a ${field.replaceAll('_', ' ')} longer than ${limit} characters`);
  }
};

export const normalizeImportedLead = (source, rowNumber) => {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`Spreadsheet row ${rowNumber} is invalid`);
  }

  const rawContact = getString(source.contact);
  const contact = normalizeUsPhoneForStorage(rawContact);
  if (contact === null && !isPhoneBlank(rawContact)) {
    throw new Error(`Spreadsheet row ${rowNumber} has an invalid US phone number`);
  }

  const leadValue = source.lead_value == null || source.lead_value === ''
    ? 0
    : Number(source.lead_value);
  if (!Number.isFinite(leadValue)) {
    throw new Error(`Spreadsheet row ${rowNumber} has an invalid lead value`);
  }

  if (Math.abs(leadValue) > 99999999.99) {
    throw new Error(`Spreadsheet row ${rowNumber} has a lead value outside the supported range`);
  }

  const normalized = {
    contact: contact ?? '',
    email: getString(source.email),
    business_owner: getString(source.business_owner),
    business_name: getString(source.business_name),
    source: getString(source.source),
    service: getString(source.service),
    notes: getString(source.notes),
    lead_value: leadValue,
    lead_status: getString(source.lead_status) || 'pending',
  };

  for (const [field, value] of Object.entries(normalized)) {
    if (typeof value === 'string') validateLength(field, value, rowNumber);
  }

  return normalized;
};

export const buildRoundRobinAssignments = (leadCount, users) => {
  const counts = new Map(users.map((user) => [Number(user.id), 0]));
  const assignments = Array.from({ length: leadCount }, (_, index) => {
    const user = users[index % users.length];
    counts.set(Number(user.id), (counts.get(Number(user.id)) ?? 0) + 1);
    return user;
  });

  return {
    assignments,
    summary: users.map((user) => ({
      userId: Number(user.id),
      username: user.username,
      count: counts.get(Number(user.id)) ?? 0,
    })),
  };
};
