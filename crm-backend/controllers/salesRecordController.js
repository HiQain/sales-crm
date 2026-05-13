import db from '../config/db.js';
import {
  buildClientJourneyFromLead,
  buildLeadFromSalesPayload,
  mapSalesRecordUpdatesToLead,
} from '../services/salesRecordSync.js';

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

  if ('balance' in normalized) {
    normalized.balance = toMoney(normalized.balance);
  } else if (hasTotal || hasPaid) {
    const total = 'total' in normalized ? normalized.total : toMoney(currentRecord.total);
    const paid = 'paid' in normalized ? normalized.paid : toMoney(currentRecord.paid);
    normalized.balance = Math.max(total - paid, 0);
  }

  return normalized;
};

export const getSalesRecords = async (req, res) => {
  const { userId } = req.query;

  try {
    let query = `SELECT id, lead_id, record_date, client_name, business_name, credit_card_info, email, phone, sales, \`lead\`, service, status, paid, balance, total, assigned_user, created_by, created_at, updated_at FROM ${CLIENT_JOURNEYS_TABLE} WHERE 1=1`;
    const params = [];

    if (userId) {
      query += ' AND assigned_user = ?';
      params.push(userId);
    }

    query += ' ORDER BY COALESCE(record_date, created_at) DESC, id DESC';

    const [records] = await db.execute(query, params);
    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to fetch client journeys' } });
  }
};

export const createSalesRecord = async (req, res) => {
  const payload = normalizeClientJourneyPayload({
    ...pickSalesRecordFields(req.body),
    assigned_user: req.body.assigned_user || req.user.id,
  });

  const leadPayload = buildLeadFromSalesPayload(payload);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [leadResult] = await connection.execute(`
      INSERT INTO leads
      (contact, email, business_owner, business_name, service, response, follow_up,
       lead_value, \`lead\`, lead_status, assigned_user, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      leadPayload.contact || 'New Lead',
      leadPayload.email || '',
      leadPayload.business_owner || '',
      leadPayload.business_name || '',
      leadPayload.service || '',
      leadPayload.response || '',
      leadPayload.follow_up || '',
      leadPayload.lead_value || 0,
      leadPayload.lead || '',
      leadPayload.lead_status || 'pending',
      leadPayload.assigned_user || req.user.id,
      req.user.id,
    ]);

    const leadId = leadResult.insertId;

    const [salesRecordResult] = await connection.execute(`
      INSERT INTO ${CLIENT_JOURNEYS_TABLE}
      (lead_id, record_date, client_name, business_name, credit_card_info, email, phone,
       sales, \`lead\`, service, status, paid, balance, total, assigned_user, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      leadId,
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

    await connection.commit();

    res.status(201).json({
      id: salesRecordResult.insertId,
      lead_id: leadId,
      ...payload,
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to create client journey' } });
  } finally {
    connection.release();
  }
};

export const updateSalesRecord = async (req, res) => {
  const { id } = req.params;
  const rawUpdates = pickSalesRecordFields(req.body);

  if (Object.keys(rawUpdates).length === 0) {
    return res.status(400).json({ error: { message: 'No fields to update' } });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [records] = await connection.execute(
      `SELECT lead_id, total, paid, balance FROM ${CLIENT_JOURNEYS_TABLE} WHERE id = ? LIMIT 1`,
      [id]
    );

    if (records.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: { message: 'Client journey not found' } });
    }

    const updates = normalizeClientJourneyPayload(rawUpdates, records[0]);
    const setClause = Object.keys(updates).map(key => `${quoteColumn(key)} = ?`).join(', ');
    await connection.execute(
      `UPDATE ${CLIENT_JOURNEYS_TABLE} SET ${setClause} WHERE id = ?`,
      [...Object.values(updates), id]
    );

    const leadUpdates = mapSalesRecordUpdatesToLead(updates);
    if (Object.keys(leadUpdates).length > 0) {
      const leadSetClause = Object.keys(leadUpdates).map(key => `${quoteColumn(key)} = ?`).join(', ');
      await connection.execute(
        `UPDATE leads SET ${leadSetClause} WHERE id = ?`,
        [...Object.values(leadUpdates), records[0].lead_id]
      );
    }

    await connection.commit();
    res.json({ message: 'Client journey updated successfully' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to update client journey' } });
  } finally {
    connection.release();
  }
};

export const deleteSalesRecord = async (req, res) => {
  const { id } = req.params;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [records] = await connection.execute(
      `SELECT lead_id FROM ${CLIENT_JOURNEYS_TABLE} WHERE id = ? LIMIT 1`,
      [id]
    );

    if (records.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: { message: 'Client journey not found' } });
    }

    await connection.execute(`DELETE FROM ${CLIENT_JOURNEYS_TABLE} WHERE id = ?`, [id]);
    await connection.execute('DELETE FROM leads WHERE id = ?', [records[0].lead_id]);

    await connection.commit();
    res.json({ message: 'Client journey deleted successfully' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to delete client journey' } });
  } finally {
    connection.release();
  }
};
