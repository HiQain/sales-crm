import db from '../config/db.js';
import { getCompanyId } from '../utils/company.js';
import { isPhoneBlank, normalizeUsPhoneForStorage } from '../utils/phone.js';

const CLIENT_JOURNEYS_TABLE = 'client_journeys';

const SALES_RECORD_FIELDS = [
  'record_date',
  'client_name',
  'business_name',
  'credit_card_info',
  'email',
  'phone',
  'sales',
  'lead',
  'service',
  'status',
  'paid',
  'balance',
  'total',
  'assigned_user',
];

const pickSalesRecordFields = (payload) => {
  const picked = {};

  for (const field of SALES_RECORD_FIELDS) {
    if (field in payload) {
      picked[field] = payload[field];
    }
  }

  return picked;
};

const toMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const toDateOnly = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const directMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch) {
      return directMatch[1];
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return null;
};

const quoteColumn = (column) => `\`${column}\``;

const normalizeClientJourneyPayload = (payload, currentRecord = {}) => {
  const normalized = { ...payload };
  const hasTotal = 'total' in normalized || 'total' in currentRecord;
  const hasPaid = 'paid' in normalized || 'paid' in currentRecord;

  if ('total' in normalized) {
    normalized.total = toMoney(normalized.total);
  }

  if ('paid' in normalized) {
    normalized.paid = toMoney(normalized.paid);
  }

  if ('record_date' in normalized) {
    normalized.record_date = toDateOnly(normalized.record_date);
  }

  if ('phone' in normalized) {
    const formattedPhone = normalizeUsPhoneForStorage(normalized.phone);

    if (formattedPhone === null && !isPhoneBlank(normalized.phone)) {
      return null;
    }

    normalized.phone = formattedPhone ?? '';
  }

  if ('balance' in normalized) {
    normalized.balance = toMoney(normalized.balance);
  } else if (hasTotal || hasPaid) {
    const total = 'total' in normalized ? normalized.total : toMoney(currentRecord.total);
    const paid = 'paid' in normalized ? normalized.paid : toMoney(currentRecord.paid);
    normalized.balance = Math.max(total - paid, 0);
  }

  return normalized;
};

const serializeClientJourney = (record) => ({
  ...record,
  record_date: toDateOnly(record.record_date) || '',
  phone: normalizeUsPhoneForStorage(record.phone) ?? record.phone,
});

export const getSalesRecords = async (req, res) => {
  const { userId } = req.query;
  const companyId = getCompanyId(req);

  try {
    let query = `SELECT id, company_id, lead_id, billing_id, record_date, client_name, business_name, credit_card_info, email, phone, sales, \`lead\`, service, status, paid, balance, total, assigned_user, created_by, created_at, updated_at FROM ${CLIENT_JOURNEYS_TABLE} WHERE company_id = ?`;
    const params = [companyId];

    if (userId) {
      query += ' AND assigned_user = ?';
      params.push(userId);
    }

    query += ' ORDER BY COALESCE(record_date, created_at) DESC, id DESC';

    const [records] = await db.execute(query, params);
    res.json(records.map(serializeClientJourney));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to fetch client journeys' } });
  }
};

export const createSalesRecord = async (req, res) => {
  const companyId = getCompanyId(req);
  const payload = normalizeClientJourneyPayload({
    ...pickSalesRecordFields(req.body),
    assigned_user: req.body.assigned_user || req.user.id,
  });

  if (!payload) {
    return res.status(400).json({ error: { message: 'Phone must be a valid US phone number in the format (240) 319-4630' } });
  }

  try {
    const [salesRecordResult] = await db.execute(`
      INSERT INTO ${CLIENT_JOURNEYS_TABLE}
      (company_id, lead_id, billing_id, record_date, client_name, business_name, credit_card_info, email, phone,
       sales, \`lead\`, service, status, paid, balance, total, assigned_user, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      companyId,
      null,
      null,
      payload.record_date || null,
      payload.client_name || '',
      payload.business_name || '',
      payload.credit_card_info || '',
      payload.email || '',
      payload.phone || '',
      payload.sales || '',
      payload.lead || '',
      payload.service || '',
      payload.status || 'pending',
      Number(payload.paid) || 0,
      Number(payload.balance) || 0,
      Number(payload.total) || 0,
      payload.assigned_user || req.user.id,
      req.user.id,
    ]);

    res.status(201).json({
      id: salesRecordResult.insertId,
      company_id: companyId,
      lead_id: null,
      billing_id: null,
      ...serializeClientJourney(payload),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to create client journey' } });
  }
};

export const updateSalesRecord = async (req, res) => {
  const { id } = req.params;
  const companyId = getCompanyId(req);
  const rawUpdates = pickSalesRecordFields(req.body);

  if (Object.keys(rawUpdates).length === 0) {
    return res.status(400).json({ error: { message: 'No fields to update' } });
  }

  try {
    const [records] = await db.execute(
      `SELECT total, paid, balance FROM ${CLIENT_JOURNEYS_TABLE} WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, companyId]
    );

    if (records.length === 0) {
      return res.status(404).json({ error: { message: 'Client journey not found' } });
    }

    const updates = normalizeClientJourneyPayload(rawUpdates, records[0]);

    if (!updates) {
      return res.status(400).json({ error: { message: 'Phone must be a valid US phone number in the format (240) 319-4630' } });
    }

    const setClause = Object.keys(updates).map(key => `${quoteColumn(key)} = ?`).join(', ');
    await db.execute(
      `UPDATE ${CLIENT_JOURNEYS_TABLE} SET ${setClause} WHERE id = ? AND company_id = ?`,
      [...Object.values(updates), id, companyId]
    );
    res.json({ message: 'Client journey updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to update client journey' } });
  }
};

export const deleteSalesRecord = async (req, res) => {
  const { id } = req.params;
  const companyId = getCompanyId(req);
  try {
    const [result] = await db.execute(
      `DELETE FROM ${CLIENT_JOURNEYS_TABLE} WHERE id = ? AND company_id = ?`,
      [id, companyId],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: { message: 'Client journey not found' } });
    }
    res.json({ message: 'Client journey deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to delete client journey' } });
  }
};
