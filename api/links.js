'use strict';

const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const DEFAULT_SHEET_ID = '1UhXUtTgSbsptv6beh0Hm_FgCAI6ahXDAZP-AO7pAB5Q';

let authClient;

async function getAuth() {
  if (authClient) return authClient;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || '';
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) throw new Error('Google credentials not configured.');
  authClient = new google.auth.JWT(clientEmail, null, privateKey, SCOPES);
  await authClient.authorize();
  return authClient;
}

function findCol(headers, ...candidates) {
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => (h || '').toLowerCase().trim() === candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function getCategories(sheetId, auth) {
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const tabs = (meta.data.sheets || [])
    .map(s => s.properties.title)
    .filter(t => t && !t.startsWith('_'));

  const categories = await Promise.all(tabs.map(async (tabTitle) => {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${tabTitle}'!A:D`
    });
    const rows = response.data.values || [];
    if (rows.length < 2) return { title: tabTitle, links: [] };

    const headers = rows[0];
    const titleCol = findCol(headers, 'title', 'name', 'resource');
    const urlCol = findCol(headers, 'url', 'link', 'resource link', 'website');
    const descCol = findCol(headers, 'description', 'notes', 'summary', 'details');

    const links = rows.slice(1)
      .map(row => {
        const title = (titleCol >= 0 ? row[titleCol] : '') || '';
        const url = (urlCol >= 0 ? row[urlCol] : '') || '';
        const description = (descCol >= 0 ? row[descCol] : '') || '';
        if (!url.trim() && !title.trim()) return null;
        return {
          title: title.trim() || url.trim(),
          url: url.trim(),
          description: description.trim(),
          domain: url.trim() ? extractDomain(url.trim()) : ''
        };
      })
      .filter(Boolean);

    return { title: tabTitle, links };
  }));

  return categories.filter(c => c.links.length > 0);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const auth = await getAuth();
    const sheetId = req.query.sheetId || DEFAULT_SHEET_ID;
    const categories = await getCategories(sheetId, auth);
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
    res.status(200).json({ categories });
  } catch (error) {
    console.error('Links API error:', error);
    res.status(500).json({ error: 'Unable to load links', detail: error.message });
  }
};
