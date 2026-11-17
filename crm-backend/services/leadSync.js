// One-way sync: Leads are the master record.
// A lead pushes its data down into Billings and Client Journeys (both linked by lead_id).
// Nothing flows back up to the lead.

import { toDateOnly } from '../utils/date.js';
import { linkJourneyClient } from './clients.js';

const isPaidStatus = (status) => String(status ?? '').trim().toLowerCase() === 'paid';

export const buildBillingFromLead = (lead) => {
  const amount = Number(lead.lead_value) || 0;
  const feeDeduction = 0;
  const invoiceDate = toDateOnly(lead.created_at);

  return {
    invoice_date: invoiceDate,
    payment_received_date: isPaidStatus(lead.lead_status) ? invoiceDate : null,
    client_name: lead.business_owner || '',
    business_name: lead.business_name || '',
    payment_method: '',
    service: lead.service || '',
    amount,
    fee_deduction: feeDeduction,
    net_currency: amount - feeDeduction,
    lead: lead.lead || '',
    assigned_user: lead.assigned_user ?? null,
  };
};

export const buildClientJourneyFromLead = (lead) => {
  const total = Number(lead.lead_value) || 0;
  const paid = isPaidStatus(lead.lead_status) ? total : 0;

  return {
    record_date: toDateOnly(lead.created_at),
    client_name: lead.business_owner || '',
    business_name: lead.business_name || '',
    credit_card_info: '',
    email: lead.email || '',
    phone: lead.contact || '',
    sales: '',
    lead: lead.lead || '',
    service: lead.service || '',
    status: lead.lead_status || 'pending',
    paid,
    total,
    balance: Math.max(total - paid, 0),
    assigned_user: lead.assigned_user ?? null,
  };
};

const upsertBillingFromLead = async (connection, lead) => {
  const billing = buildBillingFromLead(lead);

  const [existing] = await connection.execute(
    'SELECT id FROM billings WHERE lead_id = ? AND company_id = ? LIMIT 1',
    [lead.id, lead.company_id],
  );

  if (existing.length > 0) {
    await connection.execute(`
      UPDATE billings
      SET invoice_date = ?, payment_received_date = ?, client_name = ?, business_name = ?, payment_method = ?,
          service = ?, amount = ?, fee_deduction = ?, net_currency = ?, \`lead\` = ?, assigned_user = ?
      WHERE lead_id = ? AND company_id = ?
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
      lead.id,
      lead.company_id,
    ]);
    return existing[0].id;
  }

  const [result] = await connection.execute(`
    INSERT INTO billings
    (company_id, lead_id, invoice_date, payment_received_date, client_name, business_name, payment_method,
     service, amount, fee_deduction, net_currency, \`lead\`, assigned_user, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    lead.company_id,
    lead.id,
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
    lead.created_by ?? lead.assigned_user ?? null,
  ]);

  return result.insertId;
};

const upsertClientJourneyFromLead = async (connection, lead, billingId) => {
  const journey = buildClientJourneyFromLead(lead);

  const [existing] = await connection.execute(
    'SELECT id FROM client_journeys WHERE lead_id = ? AND company_id = ? LIMIT 1',
    [lead.id, lead.company_id],
  );

  if (existing.length > 0) {
    await connection.execute(`
      UPDATE client_journeys
      SET billing_id = ?, record_date = ?, client_name = ?, business_name = ?, credit_card_info = ?, email = ?, phone = ?,
          sales = ?, \`lead\` = ?, service = ?, status = ?, paid = ?, balance = ?, total = ?, assigned_user = ?
      WHERE lead_id = ? AND company_id = ?
    `, [
      billingId ?? null,
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
      lead.id,
      lead.company_id,
    ]);
    return existing[0].id;
  }

  const [result] = await connection.execute(`
    INSERT INTO client_journeys
    (company_id, lead_id, billing_id, record_date, client_name, business_name, credit_card_info, email, phone,
     sales, \`lead\`, service, status, paid, balance, total, assigned_user, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    lead.company_id,
    lead.id,
    billingId ?? null,
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
    lead.created_by ?? lead.assigned_user ?? null,
  ]);

  return result.insertId;
};

export const removeDownstreamForLead = async (connection, leadId, companyId) => {
  await connection.execute(
    'DELETE FROM client_journeys WHERE lead_id = ? AND company_id = ?',
    [leadId, companyId],
  );
  await connection.execute(
    'DELETE FROM billings WHERE lead_id = ? AND company_id = ?',
    [leadId, companyId],
  );
};

// Upsert the billing + client journey derived from a lead, but ONLY when the lead is paid.
// A lead that is not paid (or is a date-marker separator) must not appear downstream, so any
// previously-synced rows are removed when the status moves away from paid.
export const syncDownstreamForLead = async (connection, lead) => {
  if (!lead || !lead.id || !lead.company_id) return;

  if (lead.is_date_marker || !isPaidStatus(lead.lead_status)) {
    await removeDownstreamForLead(connection, lead.id, lead.company_id);
    return;
  }

  const billingId = await upsertBillingFromLead(connection, lead);
  const journeyId = await upsertClientJourneyFromLead(connection, lead, billingId);
  // Links only once: an already-linked row keeps its client, and a re-paid lead reuses the
  // client it remembers (leads.client_id).
  await linkJourneyClient(connection, lead.company_id, journeyId, {
    userId: lead.created_by ?? lead.assigned_user ?? null,
  });
};
