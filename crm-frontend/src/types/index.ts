
export interface User {
  id: number;
  username: string;
  email: string;
  provider: string;
  confirmed: boolean;
  blocked: boolean;
  createdAt: string;
  updatedAt: string;
  role_name?: string;
  role_type?: string;
}

export type LeadStatus = 'pending' | 'contacted' | 'paid' | 'failed';

export interface Lead {
  id: number;
  contact: string;
  email: string;
  ns: string;
  business_owner: string;
  business_name: string;
  service: string;
  response: string;
  follow_up: string;
  lead_value: number;
  lead_owner: string;
  lead_status: LeadStatus;
  payment_date: string;
  payment_amount: number;
  assigned_user?: User;
}
