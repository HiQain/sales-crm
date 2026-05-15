import type { Lead } from '../types';

export const LEAD_DATE_FILTERS = [
  { value: 'all', label: 'All time' },
  { value: 'last7Days', label: 'Last 7 days' },
  { value: 'last3Months', label: 'Last 3 months' },
  { value: 'last6Months', label: 'Last 6 months' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'thisYear', label: 'This year' },
  { value: 'lastYear', label: 'Last year' },
] as const;

export type LeadDateFilter = (typeof LEAD_DATE_FILTERS)[number]['value'];

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const resolveDateFilter = (date: Date, filter: LeadDateFilter, now: Date) => {
  if (filter === 'last7Days') {
    return date.getTime() >= now.getTime() - (7 * DAY_IN_MS);
  }

  if (filter === 'last3Months') {
    const threshold = new Date(now);
    threshold.setMonth(threshold.getMonth() - 3);
    return date.getTime() >= threshold.getTime();
  }

  if (filter === 'last6Months') {
    const threshold = new Date(now);
    threshold.setMonth(threshold.getMonth() - 6);
    return date.getTime() >= threshold.getTime();
  }

  if (filter === 'thisMonth') {
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    );
  }

  if (filter === 'lastMonth') {
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return (
      date.getFullYear() === lastMonthDate.getFullYear() &&
      date.getMonth() === lastMonthDate.getMonth()
    );
  }

  if (filter === 'thisYear') {
    return date.getFullYear() === now.getFullYear();
  }

  if (filter === 'lastYear') {
    return date.getFullYear() === now.getFullYear() - 1;
  }

  return true;
};

const parseLeadDate = (lead: Lead) => {
  const candidate = lead.created_at || lead.payment_date || lead.follow_up;
  if (!candidate) return null;

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const filterLeadsByDate = (leads: Lead[], filter: LeadDateFilter, now = new Date()) => {
  if (filter === 'all') return leads;

  return leads.filter((lead) => {
    const leadDate = parseLeadDate(lead);
    if (!leadDate) return false;

    return resolveDateFilter(leadDate, filter, now);
  });
};

export const filterItemsByDate = <T>(
  items: T[],
  filter: LeadDateFilter,
  getDateValue: (item: T) => string | undefined | null,
  now = new Date(),
) => {
  if (filter === 'all') return items;

  return items.filter((item) => {
    const candidate = getDateValue(item);
    if (!candidate) return false;

    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) return false;

    return resolveDateFilter(parsed, filter, now);
  });
};
