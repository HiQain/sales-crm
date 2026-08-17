import db from '../config/db.js';
import { buildClientJourneyFromBilling } from '../services/billingSync.js';
import { getCompanyId } from '../utils/company.js';

const BILLING_FIELDS = [
  'invoice_date',
  'payment_received_date',
  'client_name',
  'business_name',
  'payment_method',
  'service',
  'amount',
  'fee_deduction',
  'net_currency',
  'lead',
  'assigned_user',
];

const pickBillingFields = (payload) => {
  const picked = {};

  for (const field of BILLING_FIELDS) {
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

const normalizeBillingPayload = (payload, currentBilling = {}) => {
  const normalized = { ...payload };
  const hasAmount = 'amount' in normalized || 'amount' in currentBilling;
  const hasFee = 'fee_deduction' in normalized || 'fee_deduction' in currentBilling;

  if ('amount' in normalized) {
    normalized.amount = toMoney(normalized.amount);
  }

  if ('fee_deduction' in normalized) {
    normalized.fee_deduction = toMoney(normalized.fee_deduction);
  }

  if ('invoice_date' in normalized) {
    normalized.invoice_date = toDateOnly(normalized.invoice_date);
  }

  if ('payment_received_date' in normalized) {
    normalized.payment_received_date = toDateOnly(normalized.payment_received_date);
  }

  if ('net_currency' in normalized) {
    normalized.net_currency = toMoney(normalized.net_currency);
  } else if (hasAmount || hasFee) {
    const amount = 'amount' in normalized ? normalized.amount : toMoney(currentBilling.amount);
    const feeDeduction = 'fee_deduction' in normalized ? normalized.fee_deduction : toMoney(currentBilling.fee_deduction);
    normalized.net_currency = amount - feeDeduction;
  }

  return normalized;
};

const serializeBilling = (billing) => ({
  ...billing,
  invoice_date: toDateOnly(billing.invoice_date) || '',
  payment_received_date: toDateOnly(billing.payment_received_date) || '',
});

const syncClientJourneyFromBilling = async (connection, billing) => {
  const journey = buildClientJourneyFromBilling(billing);
  const [existingJourneys] = await connection.execute(
    'SELECT id FROM client_journeys WHERE billing_id = ? AND company_id = ? LIMIT 1',
    [billing.id, billing.company_id],
  );

  if (existingJourneys.length > 0) {
    await connection.execute(`
      UPDATE client_journeys
      SET record_date = ?, client_name = ?, business_name = ?, credit_card_info = ?, email = ?, phone = ?,
          sales = ?, \`lead\` = ?, service = ?, status = ?, paid = ?, balance = ?, total = ?, assigned_user = ?
      WHERE billing_id = ? AND company_id = ?
    `, [
      journey.record_date,
      journey.client_name,
      journey.business_name,
      journey.credit_card_info,
      journey.email,
      journey.phone,
      journey.sales,
      journey.lead,
      journey.service,
      journey.status,
      journey.paid,
      journey.balance,
      journey.total,
      journey.assigned_user,
      billing.id,
      billing.company_id,
    ]);
    return;
  }

  await connection.execute(`
    INSERT INTO client_journeys
    (company_id, lead_id, billing_id, record_date, client_name, business_name, credit_card_info, email, phone,
     sales, \`lead\`, service, status, paid, balance, total, assigned_user, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    billing.company_id,
    null,
    billing.id,
    journey.record_date,
    journey.client_name,
    journey.business_name,
    journey.credit_card_info,
    journey.email,
    journey.phone,
    journey.sales,
    journey.lead,
    journey.service,
    journey.status,
    journey.paid,
    journey.balance,
    journey.total,
    journey.assigned_user,
    billing.created_by || billing.assigned_user || null,
  ]);
};

export const getBillings = async (req, res) => {
  const { userId } = req.query;
  const companyId = getCompanyId(req);

  try {
    let query = 'SELECT * FROM billings WHERE company_id = ?';
    const params = [companyId];

    if (userId) {
      query += ' AND assigned_user = ?';
      params.push(userId);
    }

    query += ' ORDER BY COALESCE(invoice_date, created_at) DESC, id DESC';

    const [billings] = await db.execute(query, params);
    res.json(billings.map(serializeBilling));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to fetch billings' } });
  }
};

export const createBilling = async (req, res) => {
  const companyId = getCompanyId(req);
  const payload = normalizeBillingPayload({
    ...pickBillingFields(req.body),
    assigned_user: req.body.assigned_user || req.user.id,
  });
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(`
      INSERT INTO billings
      (company_id, invoice_date, payment_received_date, client_name, business_name, payment_method,
       service, amount, fee_deduction, net_currency, \`lead\`, assigned_user, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      companyId,
      payload.invoice_date || null,
      payload.payment_received_date || null,
      payload.client_name || '',
      payload.business_name || '',
      payload.payment_method || '',
      payload.service || '',
      Number(payload.amount) || 0,
      Number(payload.fee_deduction) || 0,
      Number(payload.net_currency) || 0,
      payload.lead || '',
      payload.assigned_user || req.user.id,
      req.user.id,
    ]);

    await syncClientJourneyFromBilling(connection, {
      id: result.insertId,
      company_id: companyId,
      ...payload,
      created_by: req.user.id,
    });

    await connection.commit();

    res.status(201).json({
      id: result.insertId,
      company_id: companyId,
      ...serializeBilling(payload),
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to create billing' } });
  } finally {
    connection.release();
  }
};

export const updateBilling = async (req, res) => {
  const { id } = req.params;
  const companyId = getCompanyId(req);
  const rawUpdates = pickBillingFields(req.body);

  if (Object.keys(rawUpdates).length === 0) {
    return res.status(400).json({ error: { message: 'No fields to update' } });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT * FROM billings WHERE id = ? AND company_id = ? LIMIT 1',
      [id, companyId]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: { message: 'Billing not found' } });
    }

    const updates = normalizeBillingPayload(rawUpdates, rows[0]);
    const setClause = Object.keys(updates).map((key) => `${quoteColumn(key)} = ?`).join(', ');
    await connection.execute(
      `UPDATE billings SET ${setClause} WHERE id = ? AND company_id = ?`,
      [...Object.values(updates), id, companyId],
    );

    await syncClientJourneyFromBilling(connection, {
      ...rows[0],
      ...updates,
      id: Number(id),
    });

    await connection.commit();

    res.json({ message: 'Billing updated successfully' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to update billing' } });
  } finally {
    connection.release();
  }
};

export const deleteBilling = async (req, res) => {
  const { id } = req.params;
  const companyId = getCompanyId(req);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      'DELETE FROM client_journeys WHERE billing_id = ? AND company_id = ?',
      [id, companyId],
    );
    const [result] = await connection.execute(
      'DELETE FROM billings WHERE id = ? AND company_id = ?',
      [id, companyId],
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: { message: 'Billing not found' } });
    }
    await connection.commit();
    res.json({ message: 'Billing deleted successfully' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to delete billing' } });
  } finally {
    connection.release();
  }
};
