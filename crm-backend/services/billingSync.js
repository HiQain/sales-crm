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
