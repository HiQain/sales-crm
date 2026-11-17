// Clients are the parent record for Client Journey rows (and their Billings / Leads).
// A row is linked to a client once, when it is created; later syncs never re-link it, so a
// row the user moved to another client stays there. Rules for picking a client by name:
//   1. a client the caller already knows (picked in the UI, or remembered on the lead),
//   2. otherwise the most recently used client with the same name,
//   3. otherwise a new client.

const cleanName = (value) => String(value ?? '').trim().slice(0, 255);
const sameName = (a, b) => cleanName(a).toLowerCase() === cleanName(b).toLowerCase();

const touchClient = (conn, clientId) =>
  conn.execute('UPDATE clients SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', [clientId]);

export const createClient = async (conn, companyId, name, userId = null) => {
  const [result] = await conn.execute(
    'INSERT INTO clients (company_id, name, created_by, last_used_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
    [companyId, cleanName(name), userId],
  );
  return result.insertId;
};

export const getClient = async (conn, companyId, clientId) => {
  if (!clientId) return null;
  const [rows] = await conn.execute(
    'SELECT id, name FROM clients WHERE id = ? AND company_id = ? LIMIT 1',
    [clientId, companyId],
  );
  return rows[0] ?? null;
};

export const findOrCreateClient = async (conn, companyId, name, userId = null) => {
  const clean = cleanName(name);
  if (!clean) return null;

  const [rows] = await conn.execute(
    `SELECT id FROM clients WHERE company_id = ? AND LOWER(TRIM(name)) = LOWER(?)
     ORDER BY last_used_at DESC, id DESC LIMIT 1`,
    [companyId, clean],
  );

  if (rows.length > 0) {
    await touchClient(conn, rows[0].id);
    return rows[0].id;
  }

  return createClient(conn, companyId, clean, userId);
};

// Points a journey, its billing and its lead at a client, and sets the rows' client_name text
// to the client's name so every tab shows the same name.
export const assignJourneyClient = async (conn, companyId, journeyId, clientId) => {
  const client = await getClient(conn, companyId, clientId);
  if (!client) return null;

  const [rows] = await conn.execute(
    'SELECT lead_id, billing_id FROM client_journeys WHERE id = ? AND company_id = ? LIMIT 1',
    [journeyId, companyId],
  );
  if (rows.length === 0) return null;
  const { lead_id: leadId, billing_id: billingId } = rows[0];

  await conn.execute(
    'UPDATE client_journeys SET client_id = ?, client_name = ? WHERE id = ? AND company_id = ?',
    [client.id, client.name, journeyId, companyId],
  );
  if (billingId) {
    await conn.execute(
      'UPDATE billings SET client_id = ?, client_name = ? WHERE id = ? AND company_id = ?',
      [client.id, client.name, billingId, companyId],
    );
  }
  if (leadId) {
    // The lead remembers its client, so a re-paid lead comes back to the same client.
    await conn.execute(
      'UPDATE leads SET client_id = ? WHERE id = ? AND company_id = ?',
      [client.id, leadId, companyId],
    );
  }

  await touchClient(conn, client.id);
  return client.id;
};

// Makes sure a journey (and its billing / lead) is linked to a client.
// - preferredClientId: a client the user picked explicitly; always wins.
// - relinkByName: the user edited the client name text on this row, so move the row to the
//   client with that name (or a new one) if it no longer matches its current client.
export const linkJourneyClient = async (conn, companyId, journeyId, {
  preferredClientId = null,
  relinkByName = false,
  userId = null,
} = {}) => {
  const [rows] = await conn.execute(`
    SELECT cj.client_id, cj.client_name, cj.lead_id, cj.billing_id,
           c.name AS linked_name, l.client_id AS lead_client_id, b.client_id AS billing_client_id
    FROM client_journeys cj
    LEFT JOIN clients c ON c.id = cj.client_id AND c.company_id = cj.company_id
    LEFT JOIN leads l ON l.id = cj.lead_id AND l.company_id = cj.company_id
    LEFT JOIN billings b ON b.id = cj.billing_id AND b.company_id = cj.company_id
    WHERE cj.id = ? AND cj.company_id = ?
    LIMIT 1
  `, [journeyId, companyId]);

  const journey = rows[0];
  if (!journey) return null;

  let targetId = null;

  if (preferredClientId && await getClient(conn, companyId, preferredClientId)) {
    targetId = Number(preferredClientId);
  } else if (journey.client_id && journey.linked_name != null) {
    targetId = relinkByName && !sameName(journey.client_name, journey.linked_name)
      ? await findOrCreateClient(conn, companyId, journey.client_name, userId)
      : journey.client_id;
  } else {
    const remembered = journey.lead_client_id || journey.billing_client_id;
    targetId = remembered && await getClient(conn, companyId, remembered)
      ? remembered
      : await findOrCreateClient(conn, companyId, journey.client_name, userId);
  }

  if (!targetId) return null; // no client name at all

  const needsUpdate = targetId !== journey.client_id
    || (journey.billing_id && journey.billing_client_id !== targetId)
    || (journey.lead_id && journey.lead_client_id !== targetId);

  if (needsUpdate) {
    await assignJourneyClient(conn, companyId, journeyId, targetId);
  }

  return targetId;
};

export const linkJourneyClientByBillingId = async (conn, companyId, billingId, options) => {
  const [rows] = await conn.execute(
    'SELECT id FROM client_journeys WHERE billing_id = ? AND company_id = ? LIMIT 1',
    [billingId, companyId],
  );
  return rows[0] ? linkJourneyClient(conn, companyId, rows[0].id, options) : null;
};

export const linkJourneyClientByLeadId = async (conn, companyId, leadId, options) => {
  const [rows] = await conn.execute(
    'SELECT id FROM client_journeys WHERE lead_id = ? AND company_id = ? LIMIT 1',
    [leadId, companyId],
  );
  return rows[0] ? linkJourneyClient(conn, companyId, rows[0].id, options) : null;
};

// Startup safety net: links any rows that still have no client (existing data, or rows written
// by a path that does not link). One client per distinct name per company.
export const backfillClientLinks = async (db) => {
  const [groups] = await db.execute(`
    SELECT company_id, MIN(TRIM(client_name)) AS name
    FROM client_journeys
    WHERE client_id IS NULL AND TRIM(client_name) <> ''
    GROUP BY company_id, LOWER(TRIM(client_name))
  `);

  for (const group of groups) {
    const clientId = await findOrCreateClient(db, group.company_id, group.name);
    await db.execute(
      `UPDATE client_journeys SET client_id = ?
       WHERE company_id = ? AND client_id IS NULL AND LOWER(TRIM(client_name)) = LOWER(?)`,
      [clientId, group.company_id, group.name],
    );
  }

  await db.execute(`
    UPDATE billings b
    JOIN client_journeys cj ON cj.billing_id = b.id AND cj.company_id = b.company_id
    SET b.client_id = cj.client_id
    WHERE b.client_id IS NULL AND cj.client_id IS NOT NULL
  `);

  await db.execute(`
    UPDATE leads l
    JOIN client_journeys cj ON cj.lead_id = l.id AND cj.company_id = l.company_id
    SET l.client_id = cj.client_id
    WHERE l.client_id IS NULL AND cj.client_id IS NOT NULL
  `);
};
