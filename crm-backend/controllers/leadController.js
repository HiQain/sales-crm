import db from '../config/db.js';
import { isPhoneBlank, normalizeUsPhoneForStorage } from '../utils/phone.js';

const serializeLead = (lead) => {
  const normalizedContact = normalizeUsPhoneForStorage(lead.contact);

  return {
    ...lead,
    contact: normalizedContact ?? lead.contact,
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

export const getLeads = async (req, res) => {
  const { userId } = req.query;

  try {
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
  const payload = normalizeLeadPayload(req.body);

  if (!payload) {
    return res.status(400).json({ error: { message: 'Contact must be a valid US phone number in the format (240) 319-4630' } });
  }

  const {
    contact, email, business_owner, business_name, service, response,
    follow_up, lead_value, lead, lead_status, assigned_user
  } = payload;

  try {
    const [result] = await db.execute(`
      INSERT INTO leads 
      (contact, email, business_owner, business_name, service, response, follow_up, 
       lead_value, \`lead\`, lead_status, assigned_user, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      contact || '',
      email,
      business_owner,
      business_name,
      service,
      response,
      follow_up,
      lead_value || 0,
      lead,
      lead_status || 'pending',
      assigned_user || req.user.id,
      req.user.id
    ]);
    res.status(201).json(serializeLead({ id: result.insertId, ...payload }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to create lead' } });
  }
};

export const updateLead = async (req, res) => {
  const { id } = req.params;
  const updates = normalizeLeadPayload(req.body);

  if (!updates) {
    return res.status(400).json({ error: { message: 'Contact must be a valid US phone number in the format (240) 319-4630' } });
  }

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
