import db from './db.js';
import { buildClientJourneyFromBilling } from '../services/billingSync.js';
import { normalizeUsPhoneForStorage } from '../utils/phone.js';

const normalizeStoredPhones = async ({ table, idColumn, phoneColumn }) => {
  const [rows] = await db.execute(
    `SELECT \`${idColumn}\` AS id, \`${phoneColumn}\` AS phone FROM \`${table}\` WHERE \`${phoneColumn}\` IS NOT NULL AND TRIM(\`${phoneColumn}\`) <> ''`
  );

  for (const row of rows) {
    const formattedPhone = normalizeUsPhoneForStorage(row.phone);

    if (!formattedPhone || formattedPhone === row.phone) {
      continue;
    }

    await db.execute(
      `UPDATE \`${table}\` SET \`${phoneColumn}\` = ? WHERE \`${idColumn}\` = ?`,
      [formattedPhone, row.id],
    );
  }
};

export const ensureTables = async () => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS companies (
      id INT PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    INSERT INTO companies (id, code, name)
    VALUES
      (1, 'HIQAIN', 'Hiqain'),
      (2, 'USLAW', 'USLAW'),
      (3, 'DS', 'DS')
    ON DUPLICATE KEY UPDATE
      code = VALUES(code),
      name = VALUES(name)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS roles (
      id INT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      type VARCHAR(100) NOT NULL UNIQUE
    )
  `);

  await db.execute(`
    INSERT INTO roles (id, name, type)
    VALUES
      (1, 'Admin', 'admin'),
      (2, 'Employee', 'employee')
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      type = VALUES(type)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role_id INT NOT NULL DEFAULT 2,
      visible_to_employees TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_role_id (role_id)
    )
  `);

  const [visibleToEmployeesColumn] = await db.execute(`SHOW COLUMNS FROM users LIKE 'visible_to_employees'`);
  if (visibleToEmployeesColumn.length === 0) {
    await db.execute("ALTER TABLE users ADD COLUMN visible_to_employees TINYINT(1) NOT NULL DEFAULT 0 AFTER role_id");
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_company_access (
      user_id INT NOT NULL,
      company_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, company_id),
      INDEX idx_user_company_access_company_user (company_id, user_id)
    )
  `);

  // Preserve current behavior during rollout: users without an assignment start in Hiqain.
  await db.execute(`
    INSERT IGNORE INTO user_company_access (user_id, company_id)
    SELECT u.id, 1
    FROM users u
    LEFT JOIN user_company_access access ON access.user_id = u.id
    WHERE access.user_id IS NULL
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_employee_visibility (
      user_id INT NOT NULL,
      employee_id INT NOT NULL,
      lead_status_filter VARCHAR(20) NOT NULL DEFAULT 'all',
      date_filter VARCHAR(30) NOT NULL DEFAULT 'all',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, employee_id),
      INDEX idx_user_employee_visibility_employee_id (employee_id)
    )
  `);

  const [visibilityStatusFilterColumn] = await db.execute(`SHOW COLUMNS FROM user_employee_visibility LIKE 'lead_status_filter'`);
  if (visibilityStatusFilterColumn.length === 0) {
    await db.execute("ALTER TABLE user_employee_visibility ADD COLUMN lead_status_filter VARCHAR(20) NOT NULL DEFAULT 'all' AFTER employee_id");
  }

  const [visibilityDateFilterColumn] = await db.execute(`SHOW COLUMNS FROM user_employee_visibility LIKE 'date_filter'`);
  if (visibilityDateFilterColumn.length === 0) {
    await db.execute("ALTER TABLE user_employee_visibility ADD COLUMN date_filter VARCHAR(30) NOT NULL DEFAULT 'all' AFTER lead_status_filter");
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS table_layouts (
      table_key VARCHAR(255) PRIMARY KEY,
      layout_json LONGTEXT NOT NULL,
      created_by INT NULL,
      updated_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS lead_view_orders (
      user_id INT NOT NULL,
      lead_id INT NOT NULL,
      sort_order BIGINT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, lead_id),
      INDEX idx_lead_view_orders_user_sort (user_id, sort_order),
      INDEX idx_lead_view_orders_lead_id (lead_id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS leads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL DEFAULT 1,
      contact VARCHAR(255) NOT NULL DEFAULT '',
      email VARCHAR(255) NOT NULL DEFAULT '',
      business_owner VARCHAR(255) NOT NULL DEFAULT '',
      business_name VARCHAR(255) NOT NULL DEFAULT '',
      source VARCHAR(255) NOT NULL DEFAULT '',
      service VARCHAR(255) NOT NULL DEFAULT '',
      notes TEXT NULL,
      is_date_marker TINYINT(1) NOT NULL DEFAULT 0,
      marker_date DATE NULL,
      sort_order BIGINT NULL,
      lead_value DECIMAL(10, 2) NOT NULL DEFAULT 0,
      \`lead\` VARCHAR(255) NULL,
      lead_status VARCHAR(100) NOT NULL DEFAULT 'pending',
      assigned_user INT NULL,
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_leads_assigned_user (assigned_user),
      INDEX idx_leads_company_sort (company_id, sort_order),
      INDEX idx_leads_company_assigned (company_id, assigned_user),
      INDEX idx_leads_created_by (created_by),
      INDEX idx_leads_status (lead_status)
    )
  `);

  const [leadCompanyColumn] = await db.execute(`SHOW COLUMNS FROM leads LIKE 'company_id'`);
  if (leadCompanyColumn.length === 0) {
    await db.execute('ALTER TABLE leads ADD COLUMN company_id INT NOT NULL DEFAULT 1 AFTER id');
  }

  const [leadCompanySortIndex] = await db.execute(`SHOW INDEX FROM leads WHERE Key_name = 'idx_leads_company_sort'`);
  if (leadCompanySortIndex.length === 0) {
    await db.execute('ALTER TABLE leads ADD INDEX idx_leads_company_sort (company_id, sort_order)');
  }

  const [leadCompanyAssignedIndex] = await db.execute(`SHOW INDEX FROM leads WHERE Key_name = 'idx_leads_company_assigned'`);
  if (leadCompanyAssignedIndex.length === 0) {
    await db.execute('ALTER TABLE leads ADD INDEX idx_leads_company_assigned (company_id, assigned_user)');
  }

  const [leadOwnerColumn] = await db.execute(`SHOW COLUMNS FROM leads LIKE 'lead_owner'`);
  if (leadOwnerColumn.length > 0) {
    await db.execute('ALTER TABLE leads CHANGE COLUMN lead_owner `lead` VARCHAR(255) NULL');
  }

  const [leadStatusColumn] = await db.execute(`SHOW COLUMNS FROM leads LIKE 'lead_status'`);
  if (
    leadStatusColumn.length > 0 &&
    (
      leadStatusColumn[0].Type.toLowerCase().startsWith('enum(') ||
      leadStatusColumn[0].Null === 'YES' ||
      leadStatusColumn[0].Default !== 'pending'
    )
  ) {
    await db.execute(
      "ALTER TABLE leads MODIFY COLUMN lead_status VARCHAR(100) NOT NULL DEFAULT 'pending'"
    );
  }

  const [leadNotesColumn] = await db.execute(`SHOW COLUMNS FROM leads LIKE 'notes'`);
  if (leadNotesColumn.length === 0) {
    await db.execute('ALTER TABLE leads ADD COLUMN notes TEXT NULL AFTER service');
  }

  const [leadIsDateMarkerColumn] = await db.execute(`SHOW COLUMNS FROM leads LIKE 'is_date_marker'`);
  if (leadIsDateMarkerColumn.length === 0) {
    await db.execute("ALTER TABLE leads ADD COLUMN is_date_marker TINYINT(1) NOT NULL DEFAULT 0 AFTER notes");
  }

  const [leadMarkerDateColumn] = await db.execute(`SHOW COLUMNS FROM leads LIKE 'marker_date'`);
  if (leadMarkerDateColumn.length === 0) {
    await db.execute('ALTER TABLE leads ADD COLUMN marker_date DATE NULL AFTER is_date_marker');
  }

  // Date-marker rows use assigned_user/created_by for ownership and should never display an Agent.
  await db.execute('UPDATE leads SET `lead` = NULL WHERE is_date_marker = 1 AND `lead` IS NOT NULL');

  const [leadSortOrderColumn] = await db.execute(`SHOW COLUMNS FROM leads LIKE 'sort_order'`);
  if (leadSortOrderColumn.length === 0) {
    await db.execute('ALTER TABLE leads ADD COLUMN sort_order BIGINT NULL AFTER marker_date');
  }

  await db.execute(`
    SET @lead_sort_order := 0
  `);

  await db.execute(`
    UPDATE leads
    SET sort_order = (@lead_sort_order := @lead_sort_order + 1)
    WHERE sort_order IS NULL
    ORDER BY created_at DESC, id DESC
  `);

  const [leadSourceColumn] = await db.execute(`SHOW COLUMNS FROM leads LIKE 'source'`);
  if (leadSourceColumn.length === 0) {
    await db.execute("ALTER TABLE leads ADD COLUMN source VARCHAR(255) NOT NULL DEFAULT '' AFTER business_name");
  }

  const [leadResponseColumn] = await db.execute(`SHOW COLUMNS FROM leads LIKE 'response'`);
  const [leadFollowUpColumn] = await db.execute(`SHOW COLUMNS FROM leads LIKE 'follow_up'`);

  if (leadResponseColumn.length > 0 || leadFollowUpColumn.length > 0) {
    const selectFields = ['id', 'notes'];
    if (leadResponseColumn.length > 0) {
      selectFields.push('response');
    }
    if (leadFollowUpColumn.length > 0) {
      selectFields.push('follow_up');
    }

    const [legacyLeadRows] = await db.execute(
      `SELECT ${selectFields.map((field) => `\`${field}\``).join(', ')} FROM leads`
    );

    for (const row of legacyLeadRows) {
      const mergedParts = [];
      const existingNotes = typeof row.notes === 'string' ? row.notes.trim() : '';
      if (existingNotes) {
        mergedParts.push(existingNotes);
      }

      const legacyResponse = typeof row.response === 'string' ? row.response.trim() : '';
      if (legacyResponse) {
        mergedParts.push(legacyResponse);
      }

      if (row.follow_up) {
        mergedParts.push(`Follow up: ${String(row.follow_up).slice(0, 10)}`);
      }

      const mergedNotes = mergedParts.join('\n\n');
      await db.execute(
        'UPDATE leads SET notes = ? WHERE id = ?',
        [mergedNotes || null, row.id],
      );
    }

    const [followUpIndex] = await db.execute(`SHOW INDEX FROM leads WHERE Key_name = 'idx_leads_follow_up'`);
    if (followUpIndex.length > 0) {
      await db.execute('ALTER TABLE leads DROP INDEX idx_leads_follow_up');
    }

    if (leadResponseColumn.length > 0) {
      await db.execute('ALTER TABLE leads DROP COLUMN response');
    }

    if (leadFollowUpColumn.length > 0) {
      await db.execute('ALTER TABLE leads DROP COLUMN follow_up');
    }
  }

  const [legacyTables] = await db.execute(`SHOW TABLES LIKE 'sales_records'`);
  const [clientJourneyTables] = await db.execute(`SHOW TABLES LIKE 'client_journeys'`);

  if (legacyTables.length > 0 && clientJourneyTables.length === 0) {
    await db.execute('RENAME TABLE sales_records TO client_journeys');
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS client_journeys (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL DEFAULT 1,
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
      INDEX idx_client_journeys_company_assigned (company_id, assigned_user),
      INDEX idx_client_journeys_billing_id (billing_id),
      INDEX idx_client_journeys_assigned_user (assigned_user),
      INDEX idx_client_journeys_status (status),
      INDEX idx_client_journeys_record_date (record_date)
    )
  `);

  const [clientJourneyCompanyColumn] = await db.execute(`SHOW COLUMNS FROM client_journeys LIKE 'company_id'`);
  if (clientJourneyCompanyColumn.length === 0) {
    await db.execute('ALTER TABLE client_journeys ADD COLUMN company_id INT NOT NULL DEFAULT 1 AFTER id');
  }

  const [clientJourneyCompanyIndex] = await db.execute(`SHOW INDEX FROM client_journeys WHERE Key_name = 'idx_client_journeys_company_assigned'`);
  if (clientJourneyCompanyIndex.length === 0) {
    await db.execute('ALTER TABLE client_journeys ADD INDEX idx_client_journeys_company_assigned (company_id, assigned_user)');
  }

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

  await normalizeStoredPhones({ table: 'leads', idColumn: 'id', phoneColumn: 'contact' });
  await normalizeStoredPhones({ table: 'client_journeys', idColumn: 'id', phoneColumn: 'phone' });

  await db.execute(`
    CREATE TABLE IF NOT EXISTS billings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL DEFAULT 1,
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
      INDEX idx_billings_company_assigned (company_id, assigned_user),
      INDEX idx_billings_invoice_date (invoice_date),
      INDEX idx_billings_payment_received_date (payment_received_date),
      INDEX idx_billings_assigned_user (assigned_user)
    )
  `);

  const [billingCompanyColumn] = await db.execute(`SHOW COLUMNS FROM billings LIKE 'company_id'`);
  if (billingCompanyColumn.length === 0) {
    await db.execute('ALTER TABLE billings ADD COLUMN company_id INT NOT NULL DEFAULT 1 AFTER id');
  }

  const [billingCompanyIndex] = await db.execute(`SHOW INDEX FROM billings WHERE Key_name = 'idx_billings_company_assigned'`);
  if (billingCompanyIndex.length === 0) {
    await db.execute('ALTER TABLE billings ADD INDEX idx_billings_company_assigned (company_id, assigned_user)');
  }

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
    LEFT JOIN leads l ON l.id = b.lead_id AND l.company_id = b.company_id
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
    LEFT JOIN client_journeys cj ON cj.billing_id = b.id AND cj.company_id = b.company_id
    WHERE cj.id IS NULL
  `);

  for (const billing of billingsWithoutJourneys) {
    const clientJourney = buildClientJourneyFromBilling(billing);
    await db.execute(`
      INSERT INTO client_journeys
      (company_id, lead_id, billing_id, record_date, client_name, business_name, credit_card_info, email, phone,
       sales, \`lead\`, service, status, paid, balance, total, assigned_user, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      billing.company_id || 1,
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
