import db from './db.js';
import { buildBillingFromLead } from '../services/billingSync.js';
import { buildClientJourneyFromLead } from '../services/salesRecordSync.js';

export const ensureTables = async () => {
  const [leadOwnerColumn] = await db.execute(`SHOW COLUMNS FROM leads LIKE 'lead_owner'`);
  if (leadOwnerColumn.length > 0) {
    await db.execute('ALTER TABLE leads CHANGE COLUMN lead_owner `lead` VARCHAR(255) NULL');
  }

  const [legacyTables] = await db.execute(`SHOW TABLES LIKE 'sales_records'`);
  const [clientJourneyTables] = await db.execute(`SHOW TABLES LIKE 'client_journeys'`);

  if (legacyTables.length > 0 && clientJourneyTables.length === 0) {
    await db.execute('RENAME TABLE sales_records TO client_journeys');
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS client_journeys (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lead_id INT NOT NULL,
      record_date DATE NULL,
      client_name VARCHAR(255) NOT NULL DEFAULT '',
      business_name VARCHAR(255) NOT NULL DEFAULT '',
      credit_card_info TEXT NULL,
      email VARCHAR(255) NOT NULL DEFAULT '',
      phone VARCHAR(100) NOT NULL DEFAULT '',
      sales VARCHAR(255) NOT NULL DEFAULT '',
      \`lead\` VARCHAR(255) NOT NULL DEFAULT '',
      service VARCHAR(255) NOT NULL DEFAULT '',
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      paid DECIMAL(10, 2) NOT NULL DEFAULT 0,
      balance DECIMAL(10, 2) NOT NULL DEFAULT 0,
      total DECIMAL(10, 2) NOT NULL DEFAULT 0,
      assigned_user INT NULL,
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_client_journeys_lead_id (lead_id),
      INDEX idx_client_journeys_assigned_user (assigned_user),
      INDEX idx_client_journeys_status (status),
      INDEX idx_client_journeys_record_date (record_date)
    )
  `);

  const [clientJourneyLeadColumn] = await db.execute(`SHOW COLUMNS FROM client_journeys LIKE 'lead_label'`);
  if (clientJourneyLeadColumn.length > 0) {
    await db.execute('ALTER TABLE client_journeys CHANGE COLUMN lead_label `lead` VARCHAR(255) NOT NULL DEFAULT \'\'');
  }

  const [leadsWithoutJourneys] = await db.execute(`
    SELECT l.*, u.username AS assigned_username
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_user
    LEFT JOIN client_journeys cj ON cj.lead_id = l.id
    WHERE cj.id IS NULL
  `);

  for (const lead of leadsWithoutJourneys) {
    const clientJourney = buildClientJourneyFromLead(lead);
    await db.execute(`
      INSERT INTO client_journeys
      (lead_id, record_date, client_name, business_name, credit_card_info, email, phone,
       sales, \`lead\`, service, status, paid, balance, total, assigned_user, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      lead.id,
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
      clientJourney.assigned_user,
      lead.created_by || lead.assigned_user || null,
    ]);
  }

  const [journeysNeedingLeadColumnSync] = await db.execute(`
    SELECT cj.id, l.\`lead\` AS lead_name, u.username AS assigned_username
    FROM client_journeys cj
    LEFT JOIN leads l ON l.id = cj.lead_id
    LEFT JOIN users u ON u.id = l.assigned_user
    WHERE cj.sales <> '' OR cj.\`lead\` = '' OR cj.\`lead\` IS NULL
  `);

  for (const journey of journeysNeedingLeadColumnSync) {
    const leadLabel = journey.lead_name || journey.assigned_username || '';
    await db.execute(
      'UPDATE client_journeys SET sales = ?, `lead` = ? WHERE id = ?',
      ['', leadLabel, journey.id],
    );
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS billings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lead_id INT NULL,
      invoice_date DATE NULL,
      payment_received_date DATE NULL,
      client_name VARCHAR(255) NOT NULL DEFAULT '',
      business_name VARCHAR(255) NOT NULL DEFAULT '',
      payment_method VARCHAR(255) NOT NULL DEFAULT '',
      service VARCHAR(255) NOT NULL DEFAULT '',
      amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
      fee_deduction DECIMAL(10, 2) NOT NULL DEFAULT 0,
      net_currency DECIMAL(10, 2) NOT NULL DEFAULT 0,
      \`lead\` VARCHAR(255) NOT NULL DEFAULT '',
      assigned_user INT NULL,
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_billings_lead_id (lead_id),
      INDEX idx_billings_invoice_date (invoice_date),
      INDEX idx_billings_payment_received_date (payment_received_date),
      INDEX idx_billings_assigned_user (assigned_user)
    )
  `);

  const [billingLeadIdColumn] = await db.execute(`SHOW COLUMNS FROM billings LIKE 'lead_id'`);
  if (billingLeadIdColumn.length === 0) {
    await db.execute('ALTER TABLE billings ADD COLUMN lead_id INT NULL AFTER id');
    await db.execute('ALTER TABLE billings ADD INDEX idx_billings_lead_id (lead_id)');
  }

  const [billingLeadNameColumn] = await db.execute(`SHOW COLUMNS FROM billings LIKE 'agent'`);
  if (billingLeadNameColumn.length > 0) {
    await db.execute('ALTER TABLE billings CHANGE COLUMN agent `lead` VARCHAR(255) NOT NULL DEFAULT \'\'');
  }

  const [paidLeadsWithoutBilling] = await db.execute(`
    SELECT l.*
    FROM leads l
    LEFT JOIN billings b ON b.lead_id = l.id
    WHERE l.lead_status = 'paid' AND b.id IS NULL
  `);

  for (const lead of paidLeadsWithoutBilling) {
    const billing = buildBillingFromLead(lead);
    await db.execute(`
      INSERT INTO billings
      (lead_id, invoice_date, payment_received_date, client_name, business_name, payment_method,
       service, amount, fee_deduction, net_currency, \`lead\`, assigned_user, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
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
      lead.created_by || lead.assigned_user || null,
    ]);
  }

  const [billingsMissingClientName] = await db.execute(`
    SELECT b.id, l.contact, l.business_owner
    FROM billings b
    LEFT JOIN leads l ON l.id = b.lead_id
    WHERE (b.client_name IS NULL OR b.client_name = '')
  `);

  for (const billing of billingsMissingClientName) {
    const clientName = billing.business_owner || billing.contact || '';
    if (!clientName) continue;

    await db.execute(
      'UPDATE billings SET client_name = ? WHERE id = ?',
      [clientName, billing.id],
    );
  }
};
