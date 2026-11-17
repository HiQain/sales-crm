import db from '../config/db.js';
import { getCompanyId } from '../utils/company.js';
import { toDateOnly } from '../utils/date.js';
import { isPhoneBlank, normalizeUsPhoneForStorage } from '../utils/phone.js';
import { assignJourneyClient, createClient, getClient, linkJourneyClient } from '../services/clients.js';

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
    let query = `SELECT cj.id, cj.company_id, cj.lead_id, cj.billing_id, cj.client_id, cj.record_date,
        COALESCE(c.name, cj.client_name) AS client_name, cj.business_name, cj.credit_card_info, cj.email, cj.phone,
        cj.sales, cj.\`lead\`, cj.service, cj.status, cj.paid, cj.balance, cj.total, cj.assigned_user, cj.created_by,
        cj.created_at, cj.updated_at
      FROM ${CLIENT_JOURNEYS_TABLE} cj
      LEFT JOIN clients c ON c.id = cj.client_id AND c.company_id = cj.company_id
      WHERE cj.company_id = ?`;
    const params = [companyId];

    if (userId) {
      query += ' AND cj.assigned_user = ?';
      params.push(userId);
    }

    query += ' ORDER BY COALESCE(cj.record_date, cj.created_at) DESC, cj.id DESC';

    const [records] = await db.execute(query, params);
    res.json(records.map(serializeClientJourney));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to fetch client journeys' } });
  }
};

const PHONE_ERROR_MESSAGE = 'Phone must be a valid US phone number in the format (240) 319-4630';
const MAX_BULK_RECORDS = 100;

// Inserts one journey (and its mirrored billing) inside an open transaction, then links it to
// a client: the one picked in the UI (clientId) or, by name, the most recently used / a new one.
const insertClientJourney = async (connection, companyId, payload, userId, clientId = null) => {
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
    payload.assigned_user || userId,
    userId,
  ]);

  const billingId = await syncBillingFromClientJourney(connection, {
    id: salesRecordResult.insertId,
    company_id: companyId,
    lead_id: null,
    billing_id: null,
    created_by: userId,
    ...payload,
    assigned_user: payload.assigned_user || userId,
  });

  const linkedClientId = await linkJourneyClient(connection, companyId, salesRecordResult.insertId, {
    preferredClientId: clientId,
    userId,
  });
  const linkedClient = await getClient(connection, companyId, linkedClientId);

  return {
    id: salesRecordResult.insertId,
    company_id: companyId,
    lead_id: null,
    billing_id: billingId,
    ...serializeClientJourney(payload),
    client_id: linkedClientId,
    client_name: linkedClient?.name ?? payload.client_name ?? '',
  };
};

// Creates several journeys for one client at once (all or nothing).
// Body: { client_name, client_id?, assigned_user?, records: [{ record_date, business_name, credit_card_info, ... }] }
export const createSalesRecordsBulk = async (req, res) => {
  const companyId = getCompanyId(req);
  const clientName = String(req.body.client_name ?? '').trim();
  const records = Array.isArray(req.body.records) ? req.body.records : [];

  if (!clientName) {
    return res.status(400).json({ error: { message: 'Client name is required' } });
  }
  if (records.length === 0) {
    return res.status(400).json({ error: { message: 'Add at least one row' } });
  }
  if (records.length > MAX_BULK_RECORDS) {
    return res.status(400).json({ error: { message: `You can add up to ${MAX_BULK_RECORDS} rows at once` } });
  }

  const payloads = [];
  for (const [index, record] of records.entries()) {
    const payload = normalizeClientJourneyPayload({
      ...pickSalesRecordFields(record),
      client_name: clientName,
      business_name: String(record.business_name ?? '').trim(),
      assigned_user: req.body.assigned_user || req.user.id,
    });
    if (!payload) {
      return res.status(400).json({ error: { message: `Row ${index + 1}: ${PHONE_ERROR_MESSAGE}` } });
    }
    payloads.push(payload);
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const created = [];
    for (const payload of payloads) {
      created.push(await insertClientJourney(connection, companyId, payload, req.user.id, req.body.client_id || null));
    }
    await connection.commit();
    res.status(201).json(created);
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to create client journeys' } });
  } finally {
    connection.release();
  }
};

export const createSalesRecord = async (req, res) => {
  const companyId = getCompanyId(req);
  const payload = normalizeClientJourneyPayload({
    ...pickSalesRecordFields(req.body),
    assigned_user: req.body.assigned_user || req.user.id,
  });

  if (!payload) {
    return res.status(400).json({ error: { message: PHONE_ERROR_MESSAGE } });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const created = await insertClientJourney(connection, companyId, payload, req.user.id, req.body.client_id || null);
    await connection.commit();
    res.status(201).json(created);
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
  const pickedClientId = req.body.client_id || null;

  if (Object.keys(rawUpdates).length === 0 && !pickedClientId) {
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
    let linkedClient = null;

    try {
      await connection.beginTransaction();

      if (Object.keys(updates).length > 0) {
        const setClause = Object.keys(updates).map(key => `${quoteColumn(key)} = ?`).join(', ');
        await connection.execute(
          `UPDATE ${CLIENT_JOURNEYS_TABLE} SET ${setClause} WHERE id = ? AND company_id = ?`,
          [...Object.values(updates), id, companyId]
        );
      }

      const [rows] = await connection.execute(
        `SELECT * FROM ${CLIENT_JOURNEYS_TABLE} WHERE id = ? AND company_id = ? LIMIT 1`,
        [id, companyId],
      );
      if (rows[0]) {
        await syncBillingFromClientJourney(connection, rows[0]);
        const clientId = await linkJourneyClient(connection, companyId, Number(id), {
          preferredClientId: pickedClientId,
          relinkByName: 'client_name' in updates,
          userId: req.user.id,
        });
        linkedClient = await getClient(connection, companyId, clientId);
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    res.json({
      message: 'Client journey updated successfully',
      client_id: linkedClient?.id ?? null,
      client_name: linkedClient?.name ?? null,
    });
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

// Body: { client_id } to move to an existing client, or { new_client_name } to split the row
// off into a new client (same name allowed).
export const moveSalesRecordClient = async (req, res) => {
  const { id } = req.params;
  const companyId = getCompanyId(req);
  const targetClientId = req.body.client_id ? Number(req.body.client_id) : null;
  const newClientName = String(req.body.new_client_name ?? '').trim();

  if (!targetClientId && !newClientName) {
    return res.status(400).json({ error: { message: 'Pick a client or enter a name for the new client' } });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT id FROM ${CLIENT_JOURNEYS_TABLE} WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, companyId],
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: { message: 'Client journey not found' } });
    }

    let clientId = targetClientId;
    if (clientId) {
      if (!await getClient(connection, companyId, clientId)) {
        await connection.rollback();
        return res.status(404).json({ error: { message: 'Client not found' } });
      }
    } else {
      clientId = await createClient(connection, companyId, newClientName, req.user.id);
    }

    await assignJourneyClient(connection, companyId, Number(id), clientId);
    const client = await getClient(connection, companyId, clientId);
    await connection.commit();

    res.json({ client_id: client.id, client_name: client.name });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to move client journey' } });
  } finally {
    connection.release();
  }
};
