import db from '../config/db.js';
import { getCompanyId } from '../utils/company.js';
import { toDateOnly } from '../utils/date.js';
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

const isPaidStatus = (status) => String(status ?? '').trim().toLowerCase() === 'paid';

// Reverse of buildClientJourneyFromBilling: a Client Journey edit mirrors into its Billing.
const buildBillingFromClientJourney = (journey) => {
  const amount = toMoney(journey.total);
  const paid = toMoney(journey.paid);
  const recordDate = toDateOnly(journey.record_date);

  return {
    invoice_date: recordDate,
    payment_received_date: isPaidStatus(journey.status) ? recordDate : null,
    client_name: journey.client_name || '',
    business_name: journey.business_name || '',
    service: journey.service || '',
    amount,
    fee_deduction: Math.max(amount - paid, 0),
    net_currency: paid,
    lead: journey.lead || '',
    assigned_user: journey.assigned_user ?? null,
  };
};

// Writes the billing directly (never calls the billing controller), so there is no sync loop
// with the existing Billings -> Client Journey sync. Leaves payment_method untouched since a
// Client Journey has no equivalent field.
const syncBillingFromClientJourney = async (connection, journey) => {
  if (!journey || !journey.id || !journey.company_id) return null;

  const billing = buildBillingFromClientJourney(journey);

  if (journey.billing_id) {
    const [existing] = await connection.execute(
      'SELECT id FROM billings WHERE id = ? AND company_id = ? LIMIT 1',
      [journey.billing_id, journey.company_id],
    );

    if (existing.length > 0) {
      await connection.execute(`
        UPDATE billings
        SET invoice_date = ?, payment_received_date = ?, client_name = ?, business_name = ?,
            service = ?, amount = ?, fee_deduction = ?, net_currency = ?, \`lead\` = ?, assigned_user = ?
        WHERE id = ? AND company_id = ?
      `, [
        billing.invoice_date,
        billing.payment_received_date,
        billing.client_name,
        billing.business_name,
        billing.service,
        billing.amount,
        billing.fee_deduction,
        billing.net_currency,
        billing.lead,
        billing.assigned_user,
        journey.billing_id,
        journey.company_id,
      ]);
      return journey.billing_id;
    }
  }

  // No linked billing yet — create one and link it back to the journey.
  const [result] = await connection.execute(`
    INSERT INTO billings
    (company_id, lead_id, invoice_date, payment_received_date, client_name, business_name, payment_method,
     service, amount, fee_deduction, net_currency, \`lead\`, assigned_user, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    journey.company_id,
    journey.lead_id ?? null,
    billing.invoice_date,
    billing.payment_received_date,
    billing.client_name,
    billing.business_name,
    '',
    billing.service,
    billing.amount,
    billing.fee_deduction,
    billing.net_currency,
    billing.lead,
    billing.assigned_user,
    journey.created_by ?? journey.assigned_user ?? null,
  ]);

  await connection.execute(
    'UPDATE client_journeys SET billing_id = ? WHERE id = ? AND company_id = ?',
    [result.insertId, journey.id, journey.company_id],
  );

  return result.insertId;
};

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

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [salesRecordResult] = await connection.execute(`
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

    const billingId = await syncBillingFromClientJourney(connection, {
      id: salesRecordResult.insertId,
      company_id: companyId,
      lead_id: null,
      billing_id: null,
      created_by: req.user.id,
      ...payload,
      assigned_user: payload.assigned_user || req.user.id,
    });

    await connection.commit();

    res.status(201).json({
      id: salesRecordResult.insertId,
      company_id: companyId,
      lead_id: null,
      billing_id: billingId,
      ...serializeClientJourney(payload),
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

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const setClause = Object.keys(updates).map(key => `${quoteColumn(key)} = ?`).join(', ');
      await connection.execute(
        `UPDATE ${CLIENT_JOURNEYS_TABLE} SET ${setClause} WHERE id = ? AND company_id = ?`,
        [...Object.values(updates), id, companyId]
      );

      const [rows] = await connection.execute(
        `SELECT * FROM ${CLIENT_JOURNEYS_TABLE} WHERE id = ? AND company_id = ? LIMIT 1`,
        [id, companyId],
      );
      if (rows[0]) {
        await syncBillingFromClientJourney(connection, rows[0]);
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    res.json({ message: 'Client journey updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to update client journey' } });
  }
};

export const deleteSalesRecord = async (req, res) => {
  const { id } = req.params;
  const companyId = getCompanyId(req);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [records] = await connection.execute(
      `SELECT billing_id FROM ${CLIENT_JOURNEYS_TABLE} WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, companyId],
    );

    if (records.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: { message: 'Client journey not found' } });
    }

    await connection.execute(
      `DELETE FROM ${CLIENT_JOURNEYS_TABLE} WHERE id = ? AND company_id = ?`,
      [id, companyId],
    );

    if (records[0].billing_id) {
      await connection.execute(
        'DELETE FROM billings WHERE id = ? AND company_id = ?',
        [records[0].billing_id, companyId],
      );
    }

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
