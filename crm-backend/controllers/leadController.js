import db from '../config/db.js';
import { isPhoneBlank, normalizeUsPhoneForStorage } from '../utils/phone.js';

const serializeLead = (lead) => {
  const normalizedContact = normalizeUsPhoneForStorage(lead.contact);

  return {
    ...lead,
    contact: normalizedContact ?? lead.contact,
    is_date_marker: Boolean(lead.is_date_marker),
  };
};

const normalizeLeadPayload = (payload) => {
  const normalized = { ...payload };

  if ('contact' in normalized) {
    const formattedPhone = normalizeUsPhoneForStorage(normalized.contact);

    if (formattedPhone === null && !isPhoneBlank(normalized.contact)) {
      return null;
    }

    normalized.contact = formattedPhone ?? '';
  }

  return normalized;
};

const isAdmin = (user) => user?.role === 'admin';

const getLeadById = async (id) => {
  const [rows] = await db.execute(
    'SELECT id, assigned_user, created_by FROM leads WHERE id = ? LIMIT 1',
    [id],
  );

  return rows[0] ?? null;
};

const canManageLead = (user, lead) => {
  if (isAdmin(user)) {
    return true;
  }

  const currentUserId = Number(user?.id);
  return Number(lead?.assigned_user) === currentUserId || Number(lead?.created_by) === currentUserId;
};

const attachAssignedUserFromLead = async (payload) => {
  const normalized = { ...payload };

  if (!('lead' in normalized)) {
    return normalized;
  }

  const username = String(normalized.lead ?? '').trim();

  if (!username) {
    if (!('assigned_user' in normalized)) {
      normalized.assigned_user = null;
    }
    return normalized;
  }

  const [users] = await db.execute(
    'SELECT id FROM users WHERE username = ? LIMIT 1',
    [username],
  );

  if (users.length > 0) {
    normalized.assigned_user = users[0].id;
  }

  return normalized;
};

const LEADS_LAYOUT_KEY = 'leads:shared';

const normalizeLayoutPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const order = Array.isArray(payload.order) ? payload.order.map(String) : null;
  const visible = Array.isArray(payload.visible) ? payload.visible.map(String) : null;

  if (!order || !visible) {
    return null;
  }

  const widths = payload.widths && typeof payload.widths === 'object'
    ? Object.fromEntries(
        Object.entries(payload.widths).flatMap(([id, width]) => {
          const numericWidth = Number(width);
          return Number.isFinite(numericWidth) && numericWidth > 0
            ? [[String(id), numericWidth]]
            : [];
        }),
      )
    : {};

  const customColumns = Array.isArray(payload.customColumns)
    ? payload.customColumns.flatMap((column) => {
        if (!column || typeof column !== 'object') return [];

        const id = 'id' in column ? String(column.id ?? '').trim() : '';
        const label = 'label' in column ? String(column.label ?? '').trim() : '';
        return id && label ? [{ id, label }] : [];
      })
    : [];

  return {
    order,
    visible,
    widths,
    customColumns,
  };
};

const buildSharedLeadDateFilterSql = (columnName, filter) => {
  if (filter === 'last7Days') {
    return `${columnName} >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
  }

  if (filter === 'last3Months') {
    return `${columnName} >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)`;
  }

  if (filter === 'last6Months') {
    return `${columnName} >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)`;
  }

  if (filter === 'thisMonth') {
    return `YEAR(${columnName}) = YEAR(CURDATE()) AND MONTH(${columnName}) = MONTH(CURDATE())`;
  }

  if (filter === 'lastMonth') {
    return `YEAR(${columnName}) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND MONTH(${columnName}) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))`;
  }

  if (filter === 'thisYear') {
    return `YEAR(${columnName}) = YEAR(CURDATE())`;
  }

  if (filter === 'lastYear') {
    return `YEAR(${columnName}) = YEAR(CURDATE()) - 1`;
  }

  return '1=1';
};

const buildSharedLeadBrandFilterSql = (columnName, filter) => {
  if (filter === 'designSpartans') {
    return `${columnName} = 'Design Spartans'`;
  }

  if (filter === 'uslaw') {
    return `${columnName} = 'US Logo and Web'`;
  }

  return '1=1';
};

export const getLeads = async (req, res) => {
  const { userId } = req.query;

  try {
    let query = `SELECT leads.* FROM leads`;
    let params = [];
    const whereClauses = ['1=1'];

    if (isAdmin(req.user) && userId) {
      whereClauses.push('leads.assigned_user = ?');
      params.push(userId);
    } else if (!isAdmin(req.user)) {
      const [sharedRows] = await db.execute(
        'SELECT user_id, lead_status_filter, date_filter, brand_filter FROM user_employee_visibility WHERE employee_id = ? ORDER BY user_id ASC',
        [req.user.id],
      );

      query += ' LEFT JOIN lead_view_orders lead_view_order ON lead_view_order.lead_id = leads.id AND lead_view_order.user_id = ?';
      params = [req.user.id, req.user.id];

      const sharedClauses = sharedRows.flatMap((row) => {
        const sharedUserId = Number(row.user_id);
        if (!Number.isInteger(sharedUserId) || sharedUserId <= 0) {
          return [];
        }

        const statusFilter = String(row.lead_status_filter || 'all');
        const dateFilter = String(row.date_filter || 'all');
        const brandFilter = String(row.brand_filter || 'all');
        const clauseParts = ['leads.assigned_user = ?'];
        const clauseParams = [sharedUserId];

        if (statusFilter === 'paid') {
          clauseParts.push("leads.lead_status = 'paid'");
        } else if (statusFilter === 'unpaid') {
          clauseParts.push("leads.lead_status <> 'paid'");
        }

        clauseParts.push(buildSharedLeadDateFilterSql('leads.created_at', dateFilter));
        clauseParts.push(buildSharedLeadBrandFilterSql('leads.brand', brandFilter));

        return [{
          clause: `(${clauseParts.join(' AND ')})`,
          params: clauseParams,
        }];
      });

      if (sharedClauses.length > 0) {
        whereClauses.push(`(leads.assigned_user = ? OR ${sharedClauses.map((entry) => entry.clause).join(' OR ')})`);
        params.push(...sharedClauses.flatMap((entry) => entry.params));
      } else {
        whereClauses.push('leads.assigned_user = ?');
      }
    }

    query += ` WHERE ${whereClauses.join(' AND ')}`;

    if (isAdmin(req.user)) {
      query += ` ORDER BY leads.sort_order ASC, leads.created_at DESC, leads.id DESC`;
    } else {
      query += ` ORDER BY COALESCE(lead_view_order.sort_order, 1000000000 + leads.sort_order) ASC, leads.created_at DESC, leads.id DESC`;
    }

    const [leads] = await db.execute(query, params);
    res.json(leads.map(serializeLead));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to fetch leads' } });
  }
};

export const createLead = async (req, res) => {
  const normalizedPayload = normalizeLeadPayload(req.body);

  if (!normalizedPayload) {
    return res.status(400).json({ error: { message: 'Contact must be a valid US phone number in the format (240) 319-4630' } });
  }

  const roleScopedPayload = isAdmin(req.user)
    ? normalizedPayload
    : {
        ...normalizedPayload,
        assigned_user: req.user.id,
        lead: req.user.username ?? normalizedPayload.lead ?? null,
      };

  const payload = await attachAssignedUserFromLead(roleScopedPayload);

  const {
    contact, email, business_owner, business_name, source, service, notes,
    is_date_marker, marker_date, lead_value, lead, lead_status, brand, assigned_user
  } = payload;

  try {
    const sortOrderQuery = is_date_marker
      ? 'SELECT COALESCE(MIN(sort_order), 1) AS edgeSortOrder FROM leads'
      : 'SELECT COALESCE(MAX(sort_order), 0) AS edgeSortOrder FROM leads';
    const [sortOrderRows] = await db.execute(sortOrderQuery);
    const edgeSortOrder = Number(sortOrderRows[0]?.edgeSortOrder ?? (is_date_marker ? 1 : 0));
    const nextSortOrder = is_date_marker ? edgeSortOrder - 1 : edgeSortOrder + 1;

    const [result] = await db.execute(`
      INSERT INTO leads 
      (contact, email, business_owner, business_name, source, service, notes,
       is_date_marker, marker_date, sort_order, lead_value, \`lead\`, lead_status, brand, assigned_user, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      contact || '',
      email || '',
      business_owner || '',
      business_name || '',
      source || '',
      service || '',
      notes,
      is_date_marker ? 1 : 0,
      marker_date || null,
      nextSortOrder,
      lead_value || 0,
      lead || null,
      lead_status || 'pending',
      brand || '',
      Object.prototype.hasOwnProperty.call(payload, 'assigned_user') ? assigned_user ?? null : req.user.id,
      req.user.id
    ]);
    const [rows] = await db.execute('SELECT * FROM leads WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json(serializeLead(rows[0] ?? { id: result.insertId, ...payload }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to create lead' } });
  }
};

export const updateLead = async (req, res) => {
  const { id } = req.params;
  const normalizedUpdates = normalizeLeadPayload(req.body);

  if (!normalizedUpdates) {
    return res.status(400).json({ error: { message: 'Contact must be a valid US phone number in the format (240) 319-4630' } });
  }

  const updates = await attachAssignedUserFromLead(normalizedUpdates);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: { message: 'No fields to update' } });
  }

  try {
    const lead = await getLeadById(id);
    if (!lead) {
      return res.status(404).json({ error: { message: 'Lead not found' } });
    }

    if (!canManageLead(req.user, lead)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }

    if (!isAdmin(req.user)) {
      updates.assigned_user = req.user.id;
      if ('lead' in updates) {
        updates.lead = req.user.username ?? updates.lead;
      }
    }

    const setClause = Object.keys(updates).map(key => `\`${key}\` = ?`).join(', ');
    const values = [...Object.values(updates), id];

    await db.execute(`UPDATE leads SET ${setClause} WHERE id = ?`, values);

    res.json({ message: 'Lead updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to update lead' } });
  }
};

export const deleteLead = async (req, res) => {
  const { id } = req.params;
  try {
    const lead = await getLeadById(id);
    if (!lead) {
      return res.status(404).json({ error: { message: 'Lead not found' } });
    }

    if (!canManageLead(req.user, lead)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }

    await db.execute('DELETE FROM leads WHERE id = ?', [id]);
    res.json({ message: 'Lead deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: { message: 'Failed to delete lead' } });
  }
};

export const reorderLeads = async (req, res) => {
  const leadIds = Array.isArray(req.body?.leadIds)
    ? req.body.leadIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    : [];

  if (leadIds.length === 0) {
    return res.status(400).json({ error: { message: 'No lead ids provided' } });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const placeholders = leadIds.map(() => '?').join(', ');
    const [rows] = await connection.execute(
      `SELECT id, assigned_user, created_by, sort_order FROM leads WHERE id IN (${placeholders})`,
      leadIds,
    );

    if ((rows).length !== leadIds.length) {
      await connection.rollback();
      return res.status(400).json({ error: { message: 'Some lead ids are invalid' } });
    }

    if (isAdmin(req.user)) {
      for (let index = 0; index < leadIds.length; index += 1) {
        await connection.execute(
          'UPDATE leads SET sort_order = ? WHERE id = ?',
          [index + 1, leadIds[index]],
        );
      }
    } else {
      const [sharedRows] = await connection.execute(
        'SELECT user_id FROM user_employee_visibility WHERE employee_id = ? ORDER BY user_id ASC',
        [req.user.id],
      );
      const visibleUserIds = new Set([
        Number(req.user.id),
        ...sharedRows.map((row) => Number(row.user_id)),
      ]);

      const allRowsVisible = rows.every((row) => visibleUserIds.has(Number(row.assigned_user)));
      if (!allRowsVisible) {
        await connection.rollback();
        return res.status(403).json({ error: { message: 'Forbidden' } });
      }

      await connection.execute(
        'DELETE FROM lead_view_orders WHERE user_id = ?',
        [req.user.id],
      );

      for (let index = 0; index < leadIds.length; index += 1) {
        await connection.execute(
          'INSERT INTO lead_view_orders (user_id, lead_id, sort_order) VALUES (?, ?, ?)',
          [req.user.id, leadIds[index], index + 1],
        );
      }
    }

    await connection.commit();
    res.json({ message: 'Lead order updated successfully' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to update lead order' } });
  } finally {
    connection.release();
  }
};

export const getLeadLayout = async (_req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT layout_json FROM table_layouts WHERE table_key = ? LIMIT 1',
      [LEADS_LAYOUT_KEY],
    );

    if (rows.length === 0) {
      return res.json(null);
    }

    const parsed = JSON.parse(rows[0].layout_json);
    const layout = normalizeLayoutPayload(parsed);
    res.json(layout);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to fetch lead layout' } });
  }
};

export const updateLeadLayout = async (req, res) => {
  const layout = normalizeLayoutPayload(req.body);

  if (!layout) {
    return res.status(400).json({ error: { message: 'Invalid layout payload' } });
  }

  try {
    await db.execute(`
      INSERT INTO table_layouts (table_key, layout_json, created_by, updated_by)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        layout_json = VALUES(layout_json),
        updated_by = VALUES(updated_by)
    `, [
      LEADS_LAYOUT_KEY,
      JSON.stringify(layout),
      req.user?.id ?? null,
      req.user?.id ?? null,
    ]);

    res.json({ message: 'Lead layout updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to update lead layout' } });
  }
};
