const LEAD_TO_SALES_FIELD_MAP = {
  business_owner: 'client_name',
  business_name: 'business_name',
  email: 'email',
  contact: 'phone',
  service: 'service',
  lead: 'lead',
  lead_status: 'status',
  lead_value: 'total',
  assigned_user: 'assigned_user',
};

const SALES_TO_LEAD_FIELD_MAP = {
  client_name: 'business_owner',
  business_name: 'business_name',
  email: 'email',
  phone: 'contact',
  service: 'service',
  lead: 'lead',
  status: 'lead_status',
  total: 'lead_value',
  assigned_user: 'assigned_user',
};

export const buildLeadFromSalesPayload = (salesRecord) => ({
  contact: salesRecord.phone || '',
  email: salesRecord.email || '',
  business_owner: salesRecord.client_name || '',
  business_name: salesRecord.business_name || '',
  service: salesRecord.service || '',
  notes: '',
  lead_value: Number(salesRecord.total) || 0,
  lead: salesRecord.lead || '',
  lead_status: salesRecord.status || 'pending',
  assigned_user: salesRecord.assigned_user,
});

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

export const buildClientJourneyFromLead = (lead) => {
  const total = Number(lead.lead_value) || 0;
  const paid = Number(lead.paid) || 0;
  const leadLabel = lead.lead || lead.assigned_username || '';

  return {
    record_date: toDateOnly(lead.created_at),
    client_name: lead.business_owner || '',
    business_name: lead.business_name || '',
    credit_card_info: '',
    email: lead.email || '',
    phone: lead.contact || '',
    sales: '',
    lead: leadLabel,
    service: lead.service || '',
    status: lead.lead_status || 'pending',
    paid,
    total,
    balance: Math.max(total - paid, 0),
    assigned_user: lead.assigned_user,
  };
};

export const mapLeadUpdatesToSalesRecord = (updates) => {
  const mapped = {};

  for (const [leadField, salesField] of Object.entries(LEAD_TO_SALES_FIELD_MAP)) {
    if (leadField in updates) {
      mapped[salesField] = updates[leadField];
    }
  }

  return mapped;
};

export const mapSalesRecordUpdatesToLead = (updates) => {
  const mapped = {};

  for (const [salesField, leadField] of Object.entries(SALES_TO_LEAD_FIELD_MAP)) {
    if (salesField in updates) {
      mapped[leadField] = updates[salesField];
    }
  }

  return mapped;
};
