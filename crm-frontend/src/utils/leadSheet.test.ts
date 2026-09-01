import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLeadSheet } from './leadSheet';

test('parseLeadSheet maps CSV headers and quoted values', async () => {
  const file = new File([
    'Phone,Email,Business Owner,Lead Value,Notes\r\n' +
    '2403194630,lead@example.com,"Smith, Jane","$1,250.50","Asked ""for a call"""',
  ], 'leads.csv', { type: 'text/csv' });

  const result = await parseLeadSheet(file);

  assert.equal(result.sheetName, 'CSV');
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], {
    contact: '(240) 319-4630',
    email: 'lead@example.com',
    business_owner: 'Smith, Jane',
    business_name: '',
    source: '',
    service: '',
    notes: 'Asked "for a call"',
    lead_value: 1250.5,
    lead_status: 'pending',
  });
});

test('parseLeadSheet reports the source row for invalid values', async () => {
  const file = new File(['Contact,Email\n1234,lead@example.com'], 'leads.csv', { type: 'text/csv' });

  await assert.rejects(() => parseLeadSheet(file), /row 2: invalid US phone number/);
});

