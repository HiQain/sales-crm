
export interface User {
  id: number;
  username: string;
  email: string;
  provider: string;
  confirmed: boolean;
  blocked: boolean;
  createdAt: string;
  updatedAt: string;
  created_at?: string;
  updated_at?: string;
  visible_to_employees?: boolean;
  visible_employee_count?: number;
  role_name?: string;
  role_type?: string;
}

export type LeadStatus = string;

export interface Lead {
  id: number;
  contact: string;
  email: string;
  ns: string;
  business_owner: string;
  business_name: string;
  source: string;
  service: string;
  notes: string;
  is_date_marker?: boolean;
  marker_date?: string;
  sort_order?: number;
  lead_value: number;
  lead: string;
  lead_status: LeadStatus;
  brand?: string;
  payment_date: string;
  payment_amount: number;
  created_at?: string;
  updated_at?: string;
  assigned_user?: User | number;
}

export interface ClientJourney {
  id: number;
  lead_id: number | null;
  billing_id?: number | null;
  record_date: string;
  client_name: string;
  business_name: string;
  credit_card_info: string;
  email: string;
  phone: string;
  sales: string;
  lead: string;
  service: string;
  status: LeadStatus;
  paid: number;
  balance: number;
  total: number;
  created_at?: string;
  updated_at?: string;
  assigned_user?: User | number;
}

export type SalesRecord = ClientJourney;

export interface Billing {
  id: number;
  invoice_date: string;
  payment_received_date: string;
  client_name: string;
  business_name: string;
  payment_method: string;
  service: string;
  amount: number;
  fee_deduction: number;
  net_currency: number;
  lead: string;
  created_at?: string;
  updated_at?: string;
  assigned_user?: User | number;
}
