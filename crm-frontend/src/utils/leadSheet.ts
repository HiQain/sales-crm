import { normalizeUsPhoneForStorage } from './phone';

export const MAX_LEAD_IMPORT_ROWS = 3000;

export type LeadImportRow = {
  contact: string;
  email: string;
  business_owner: string;
  business_name: string;
  source: string;
  service: string;
  notes: string;
  lead_value: number;
  lead_status: string;
};

export type ParsedLeadSheet = {
  fileName: string;
  sheetName: string;
  rows: LeadImportRow[];
  skippedRows: number;
};

const FIELD_ALIASES: Record<keyof LeadImportRow, string[]> = {
  contact: ['contact', 'contact number', 'phone', 'phone number', 'mobile', 'mobile number', 'telephone'],
  email: ['email', 'email address', 'e mail'],
  business_owner: ['business owner', 'owner', 'owner name', 'client', 'client name', 'contact name', 'name'],
  business_name: ['business name', 'company', 'company name', 'organization', 'organisation'],
  source: ['source', 'lead source'],
  service: ['service', 'services', 'interested service'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks'],
  lead_value: ['lead value', 'value', 'amount', 'deal value'],
  lead_status: ['lead status', 'status'],
};

const normalizeHeader = (value: unknown) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ');

const ALIAS_TO_FIELD = new Map<string, keyof LeadImportRow>(
  Object.entries(FIELD_ALIASES).flatMap(([field, aliases]) => (
    aliases.map((alias) => [normalizeHeader(alias), field as keyof LeadImportRow])
  )),
);

const toCellText = (value: unknown) => String(value ?? '').trim();

const parseLeadValue = (value: unknown) => {
  const rawValue = toCellText(value);
  if (!rawValue) return 0;

  const isNegative = /^\(.*\)$/.test(rawValue);
  const numericValue = Number(rawValue.replace(/[$,()\s]/g, ''));
  return Number.isFinite(numericValue) ? (isNegative ? -numericValue : numericValue) : null;
};

const getSupportedValues = (sourceRow: Record<string, unknown>) => {
  const values = new Map<keyof LeadImportRow, unknown>();

  for (const [header, value] of Object.entries(sourceRow)) {
    const field = ALIAS_TO_FIELD.get(normalizeHeader(header));
    if (field && !values.has(field)) {
      values.set(field, value);
    }
  }

  return values;
};

const parseCsvRows = (contents: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let insideQuotes = false;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];

    if (character === '"') {
      if (insideQuotes && contents[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === ',' && !insideQuotes) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !insideQuotes) {
      if (character === '\r' && contents[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (insideQuotes) {
    throw new Error('The CSV file contains an unfinished quoted value.');
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
};

const rowsToObjects = (sheetRows: unknown[][]) => {
  const headerRow = sheetRows[0] ?? [];
  const headers = headerRow.map((header, index) => (
    index === 0 ? toCellText(header).replace(/^\uFEFF/, '') : toCellText(header)
  ));

  return sheetRows.slice(1).map((row) => Object.fromEntries(
    headers.map((header, index) => [header, row[index] ?? '']),
  ));
};

export const parseLeadSheet = async (file: File): Promise<ParsedLeadSheet> => {
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  let sheetName = 'CSV';
  let sourceRows: Record<string, unknown>[];

  if (isCsv) {
    sourceRows = rowsToObjects(parseCsvRows(await file.text()));
  } else {
    const { readSheet } = await import('read-excel-file/browser');
    const firstSheetRows = await readSheet(file);

    if (firstSheetRows.length === 0) {
      throw new Error('The spreadsheet does not contain a worksheet.');
    }

    sheetName = 'First worksheet';
    sourceRows = rowsToObjects(firstSheetRows);
  }

  if (sourceRows.length === 0) {
    throw new Error('The first worksheet does not contain any lead rows.');
  }

  if (sourceRows.length > MAX_LEAD_IMPORT_ROWS) {
    throw new Error(`A single import can contain up to ${MAX_LEAD_IMPORT_ROWS.toLocaleString()} rows.`);
  }

  const rows: LeadImportRow[] = [];
  const rowErrors: string[] = [];
  let skippedRows = 0;

  sourceRows.forEach((sourceRow, rowIndex) => {
    const values = getSupportedValues(sourceRow);
    const hasLeadData = Array.from(values.values()).some((value) => toCellText(value) !== '');

    if (!hasLeadData) {
      skippedRows += 1;
      return;
    }

    const rawContact = toCellText(values.get('contact'));
    const contact = normalizeUsPhoneForStorage(rawContact);
    const leadValue = parseLeadValue(values.get('lead_value'));

    if (rawContact && contact === null) {
      rowErrors.push(`row ${rowIndex + 2}: invalid US phone number`);
      return;
    }

    if (leadValue === null) {
      rowErrors.push(`row ${rowIndex + 2}: invalid lead value`);
      return;
    }

    rows.push({
      contact: contact ?? '',
      email: toCellText(values.get('email')),
      business_owner: toCellText(values.get('business_owner')),
      business_name: toCellText(values.get('business_name')),
      source: toCellText(values.get('source')),
      service: toCellText(values.get('service')),
      notes: toCellText(values.get('notes')),
      lead_value: leadValue,
      lead_status: toCellText(values.get('lead_status')) || 'pending',
    });
  });

  if (rowErrors.length > 0) {
    const displayedErrors = rowErrors.slice(0, 5).join('; ');
    const additionalErrors = rowErrors.length > 5 ? `; plus ${rowErrors.length - 5} more` : '';
    throw new Error(`Fix these spreadsheet values before importing: ${displayedErrors}${additionalErrors}.`);
  }

  if (rows.length === 0) {
    throw new Error('No importable leads were found. Check that the sheet uses supported column headings.');
  }

  return {
    fileName: file.name,
    sheetName,
    rows,
    skippedRows,
  };
};
