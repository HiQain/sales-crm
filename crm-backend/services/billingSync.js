export const buildBillingFromLead = (lead) => {
  const amount = Number(lead.lead_value) || 0;
  const feeDeduction = Number(lead.fee_deduction) || 0;

  const dateValue = lead.payment_date || lead.created_at || null;
  let normalizedDate = null;

  if (dateValue) {
    const parsed = new Date(dateValue);
    if (!Number.isNaN(parsed.getTime())) {
      normalizedDate = parsed.toISOString().slice(0, 10);
    }
  }

  return {
    invoice_date: normalizedDate,
    payment_received_date: normalizedDate,
    client_name: lead.business_owner || lead.client_name || lead.contact || '',
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

const toDateOnly = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
};

export const buildClientJourneyFromBilling = (billing) => {
  const total = Number(billing.amount) || 0;
  const paid = Number(billing.net_currency) || 0;
  const recordDate = billing.payment_received_date || billing.invoice_date || billing.created_at || null;

  return {
    record_date: toDateOnly(recordDate),
    client_name: billing.client_name || '',
    business_name: billing.business_name || '',
    credit_card_info: '',
    email: '',
    phone: '',
    sales: '',
    lead: billing.lead || '',
    service: billing.service || '',
    status: billing.payment_received_date ? 'paid' : 'pending',
    paid,
    total,
    balance: Math.max(total - paid, 0),
    assigned_user: billing.assigned_user ?? null,
  };
};
