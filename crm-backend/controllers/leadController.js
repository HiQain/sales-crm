import db from '../config/db.js';
import { buildBillingFromLead } from '../services/billingSync.js';
import { buildClientJourneyFromLead, mapLeadUpdatesToSalesRecord } from '../services/salesRecordSync.js';

export const getLeads = async (req, res) => {
  const { userId } = req.query;

  try {
    let query = `SELECT * FROM leads WHERE 1=1`;
    const params = [];

    if (userId) {
      query += ` AND assigned_user = ?`;
      params.push(userId);
    }

    query += ` ORDER BY created_at DESC`;

    const [leads] = await db.execute(query, params);
    res.json(leads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to fetch leads' } });
  }
};

export const createLead = async (req, res) => {
  const {
    contact, email, business_owner, business_name, service, response,
    follow_up, lead_value, lead, lead_status, assigned_user
  } = req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(`
      INSERT INTO leads 
      (contact, email, business_owner, business_name, service, response, follow_up, 
       lead_value, \`lead\`, lead_status, assigned_user, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      contact || 'New Lead',
      email,
      business_owner,
      business_name,
      service,
      response,
      follow_up,
      lead_value || 0,
      lead,
      lead_status || 'pending',
      assigned_user || req.user.id,
      req.user.id
    ]);

    const leadId = result.insertId;
    const clientJourney = buildClientJourneyFromLead({
      ...req.body,
      id: leadId,
      contact: contact || 'New Lead',
      assigned_user: assigned_user || req.user.id,
    });

    await connection.execute(`
      INSERT INTO client_journeys
      (lead_id, record_date, client_name, business_name, credit_card_info, email, phone,
       sales, \`lead\`, service, status, paid, balance, total, assigned_user, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      leadId,
      clientJourney.record_date,
      clientJourney.client_name,
      clientJourney.business_name,
      clientJourney.credit_card_info,
      clientJourney.email,
      clientJourney.phone,
      clientJourney.sales,
      clientJourney.lead,
      clientJourney.service,
      clientJourney.status,
      clientJourney.paid,
      clientJourney.balance,
      clientJourney.total,
      clientJourney.assigned_user || req.user.id,
      req.user.id,
    ]);

    if ((lead_status || 'pending') === 'paid') {
      const billing = buildBillingFromLead({
        ...req.body,
        id: leadId,
        assigned_user: assigned_user || req.user.id,
      });

      await connection.execute(`
        INSERT INTO billings
        (lead_id, invoice_date, payment_received_date, client_name, business_name, payment_method,
         service, amount, fee_deduction, net_currency, \`lead\`, assigned_user, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        leadId,
        billing.invoice_date,
        billing.payment_received_date,
        billing.client_name,
        billing.business_name,
        billing.payment_method,
        billing.service,
        billing.amount,
        billing.fee_deduction,
        billing.net_currency,
        billing.lead,
        billing.assigned_user,
        req.user.id,
      ]);
    }

    await connection.commit();
    res.status(201).json({ id: result.insertId, ...req.body });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to create lead' } });
  } finally {
    connection.release();
  }
};

export const updateLead = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: { message: 'No fields to update' } });
  }

  try {
    const setClause = Object.keys(updates).map(key => `\`${key}\` = ?`).join(', ');
    const values = [...Object.values(updates), id];

    await db.execute(`UPDATE leads SET ${setClause} WHERE id = ?`, values);

    const salesRecordUpdates = mapLeadUpdatesToSalesRecord(updates);
    if (Object.keys(salesRecordUpdates).length > 0) {
      const salesSetClause = Object.keys(salesRecordUpdates).map(key => `\`${key}\` = ?`).join(', ');
      await db.execute(
        `UPDATE client_journeys SET ${salesSetClause} WHERE lead_id = ?`,
        [...Object.values(salesRecordUpdates), id]
      );
    }

    const [leadRows] = await db.execute('SELECT * FROM leads WHERE id = ? LIMIT 1', [id]);
    if (leadRows.length > 0) {
      const lead = leadRows[0];
      const [billingRows] = await db.execute('SELECT id FROM billings WHERE lead_id = ? LIMIT 1', [id]);

      if (lead.lead_status === 'paid') {
        const billing = buildBillingFromLead(lead);

        if (billingRows.length > 0) {
          await db.execute(`
            UPDATE billings
            SET invoice_date = ?, payment_received_date = ?, client_name = ?, business_name = ?,
                payment_method = ?, service = ?, amount = ?, fee_deduction = ?, net_currency = ?,
                \`lead\` = ?, assigned_user = ?
            WHERE lead_id = ?
          `, [
            billing.invoice_date,
            billing.payment_received_date,
            billing.client_name,
            billing.business_name,
            billing.payment_method,
            billing.service,
            billing.amount,
            billing.fee_deduction,
            billing.net_currency,
            billing.lead,
            billing.assigned_user,
            id,
          ]);
        } else {
          await db.execute(`
            INSERT INTO billings
            (lead_id, invoice_date, payment_received_date, client_name, business_name, payment_method,
             service, amount, fee_deduction, net_currency, \`lead\`, assigned_user, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            id,
            billing.invoice_date,
            billing.payment_received_date,
            billing.client_name,
            billing.business_name,
            billing.payment_method,
            billing.service,
            billing.amount,
            billing.fee_deduction,
            billing.net_currency,
            billing.lead,
            billing.assigned_user,
            lead.created_by || lead.assigned_user || null,
          ]);
        }
      } else if (billingRows.length > 0) {
        await db.execute('DELETE FROM billings WHERE lead_id = ?', [id]);
      }
    }

    res.json({ message: 'Lead updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to update lead' } });
  }
};

export const deleteLead = async (req, res) => {
  const { id } = req.params;
  try {
    await db.execute('DELETE FROM billings WHERE lead_id = ?', [id]);
    await db.execute('DELETE FROM client_journeys WHERE lead_id = ?', [id]);
    await db.execute('DELETE FROM leads WHERE id = ?', [id]);
    res.json({ message: 'Lead deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: { message: 'Failed to delete lead' } });
  }
};
