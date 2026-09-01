import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoundRobinAssignments, normalizeImportedLead } from '../services/leadImport.js';

test('buildRoundRobinAssignments preserves selected user order', () => {
  const users = [
    { id: 11, username: 'user-1' },
    { id: 22, username: 'user-2' },
    { id: 33, username: 'user-3' },
  ];

  const result = buildRoundRobinAssignments(7, users);

  assert.deepEqual(result.assignments.map((user) => user.id), [11, 22, 33, 11, 22, 33, 11]);
  assert.deepEqual(result.summary, [
    { userId: 11, username: 'user-1', count: 3 },
    { userId: 22, username: 'user-2', count: 2 },
    { userId: 33, username: 'user-3', count: 2 },
  ]);
});

test('normalizeImportedLead applies defaults and formats US phone numbers', () => {
  assert.deepEqual(normalizeImportedLead({
    contact: '12403194630',
    email: ' lead@example.com ',
    lead_value: '1250.50',
  }, 2), {
    contact: '(240) 319-4630',
    email: 'lead@example.com',
    business_owner: '',
    business_name: '',
    source: '',
    service: '',
    notes: '',
    lead_value: 1250.5,
    lead_status: 'pending',
  });
});

test('normalizeImportedLead rejects invalid contacts with the spreadsheet row', () => {
  assert.throws(
    () => normalizeImportedLead({ contact: '1234' }, 9),
    /Spreadsheet row 9 has an invalid US phone number/,
  );
});

