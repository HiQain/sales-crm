import db from './db.js';
import { buildClientJourneyFromBilling } from '../services/billingSync.js';

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
      lead_id INT NULL,
      billing_id INT NULL,
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
      INDEX idx_client_journeys_billing_id (billing_id),
      INDEX idx_client_journeys_assigned_user (assigned_user),
      INDEX idx_client_journeys_status (status),
      INDEX idx_client_journeys_record_date (record_date)
    )
  `);

  const [clientJourneyLeadColumn] = await db.execute(`SHOW COLUMNS FROM client_journeys LIKE 'lead_label'`);
  if (clientJourneyLeadColumn.length > 0) {
    await db.execute('ALTER TABLE client_journeys CHANGE COLUMN lead_label `lead` VARCHAR(255) NOT NULL DEFAULT \'\'');
  }

  const [clientJourneyBillingIdColumn] = await db.execute(`SHOW COLUMNS FROM client_journeys LIKE 'billing_id'`);
  if (clientJourneyBillingIdColumn.length === 0) {
    await db.execute('ALTER TABLE client_journeys ADD COLUMN billing_id INT NULL AFTER lead_id');
    await db.execute('ALTER TABLE client_journeys ADD INDEX idx_client_journeys_billing_id (billing_id)');
  }

  const [clientJourneyLeadColumnInfo] = await db.execute(`SHOW COLUMNS FROM client_journeys LIKE 'lead_id'`);
  if (clientJourneyLeadColumnInfo.length > 0 && clientJourneyLeadColumnInfo[0].Null === 'NO') {
    await db.execute('ALTER TABLE client_journeys MODIFY COLUMN lead_id INT NULL');
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

  const [billingsWithoutJourneys] = await db.execute(`
    SELECT b.*
    FROM billings b
    LEFT JOIN client_journeys cj ON cj.billing_id = b.id
    WHERE cj.id IS NULL
  `);

  for (const billing of billingsWithoutJourneys) {
    const clientJourney = buildClientJourneyFromBilling(billing);
    await db.execute(`
      INSERT INTO client_journeys
      (lead_id, billing_id, record_date, client_name, business_name, credit_card_info, email, phone,
       sales, \`lead\`, service, status, paid, balance, total, assigned_user, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      null,
      billing.id,
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
      billing.created_by || billing.assigned_user || null,
    ]);
  }
};
