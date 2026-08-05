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

export const getLeads = async (req, res) => {
  const { userId } = req.query;

  try {
    if (req.user?.role !== 'admin' && userId && Number(userId) !== Number(req.user.id)) {
      const [allowedUsers] = await db.execute(
        'SELECT 1 FROM user_employee_visibility WHERE user_id = ? AND employee_id = ? LIMIT 1',
        [userId, req.user.id],
      );

      if (allowedUsers.length === 0) {
        return res.status(403).json({ error: { message: 'You are not allowed to view these leads' } });
      }
    }

    let query = `SELECT * FROM leads WHERE 1=1`;
    const params = [];

    if (userId) {
      query += ` AND assigned_user = ?`;
      params.push(userId);
    }

    query += ` ORDER BY created_at DESC`;

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

  const payload = await attachAssignedUserFromLead(normalizedPayload);

  const {
    contact, email, business_owner, business_name, source, service, notes,
    is_date_marker, marker_date, lead_value, lead, lead_status, assigned_user
  } = payload;

  try {
    const [result] = await db.execute(`
      INSERT INTO leads 
      (contact, email, business_owner, business_name, source, service, notes,
       is_date_marker, marker_date, lead_value, \`lead\`, lead_status, assigned_user, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      lead_value || 0,
      lead || null,
      lead_status || 'pending',
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
    await db.execute('DELETE FROM leads WHERE id = ?', [id]);
    res.json({ message: 'Lead deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: { message: 'Failed to delete lead' } });
  }
};
