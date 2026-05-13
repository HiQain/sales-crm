import db from '../config/db.js';

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

  if ('net_currency' in normalized) {
    normalized.net_currency = toMoney(normalized.net_currency);
  } else if (hasAmount || hasFee) {
    const amount = 'amount' in normalized ? normalized.amount : toMoney(currentBilling.amount);
    const feeDeduction = 'fee_deduction' in normalized ? normalized.fee_deduction : toMoney(currentBilling.fee_deduction);
    normalized.net_currency = amount - feeDeduction;
  }

  return normalized;
};

export const getBillings = async (req, res) => {
  const { userId } = req.query;

  try {
    let query = 'SELECT * FROM billings WHERE 1=1';
    const params = [];

    if (userId) {
      query += ' AND assigned_user = ?';
      params.push(userId);
    }

    query += ' ORDER BY COALESCE(invoice_date, created_at) DESC, id DESC';

    const [billings] = await db.execute(query, params);
    res.json(billings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to fetch billings' } });
  }
};

export const createBilling = async (req, res) => {
  const payload = normalizeBillingPayload({
    ...pickBillingFields(req.body),
    assigned_user: req.body.assigned_user || req.user.id,
  });

  try {
    const [result] = await db.execute(`
      INSERT INTO billings
      (invoice_date, payment_received_date, client_name, business_name, payment_method,
       service, amount, fee_deduction, net_currency, \`lead\`, assigned_user, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
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

    res.status(201).json({
      id: result.insertId,
      ...payload,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to create billing' } });
  }
};

export const updateBilling = async (req, res) => {
  const { id } = req.params;
  const rawUpdates = pickBillingFields(req.body);

  if (Object.keys(rawUpdates).length === 0) {
    return res.status(400).json({ error: { message: 'No fields to update' } });
  }

  try {
    const [rows] = await db.execute('SELECT amount, fee_deduction, net_currency FROM billings WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: 'Billing not found' } });
    }

    const updates = normalizeBillingPayload(rawUpdates, rows[0]);
    const setClause = Object.keys(updates).map((key) => `${quoteColumn(key)} = ?`).join(', ');
    await db.execute(
      `UPDATE billings SET ${setClause} WHERE id = ?`,
      [...Object.values(updates), id],
    );

    res.json({ message: 'Billing updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to update billing' } });
  }
};

export const deleteBilling = async (req, res) => {
  const { id } = req.params;

  try {
    await db.execute('DELETE FROM billings WHERE id = ?', [id]);
    res.json({ message: 'Billing deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to delete billing' } });
  }
};
