'use strict';

const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const DEFAULT_SHEET_ID = '1JWbd7AulICEu59jPKIAoWuw2OeLn7G-GNRGDIgHy_gY';

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

function extractPaperId(raw) {
  var s = (raw || '').trim();
  if (!s || s.startsWith('#')) return null;
  // Handle full Semantic Scholar URLs
  var match = s.match(/semanticscholar\.org\/paper\/[^/]+\/([A-Za-z0-9]+)/);
  if (match) return match[1];
  // Handle bare IDs
  if (/^[A-Za-z0-9]{8,}$/.test(s)) return s;
  return null;
}

async function getSeedPaperIds(sheetId, auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'A:A'
  });
  const rows = response.data.values || [];
  return rows.slice(1)
    .map(row => extractPaperId(row[0]))
    .filter(Boolean);
}

async function getRecommendations(paperIds) {
  const url = 'https://api.semanticscholar.org/recommendations/v1/papers/?limit=100&fields=title,authors,year,abstract,url,publicationDate,journal,citationCount';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ positivePaperIds: paperIds })
  });
  if (!response.ok) throw new Error('Semantic Scholar API failed: ' + response.status);
  const data = await response.json();
  return data.recommendedPapers || [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const auth = await getAuth();
    const sheetId = req.query.sheetId || DEFAULT_SHEET_ID;

    const paperIds = await getSeedPaperIds(sheetId, auth);
    if (!paperIds.length) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json({ papers: [], noSeeds: true });
    }

    const papers = await getRecommendations(paperIds);

    const cutoffYear = new Date().getFullYear() - 1;
    const filtered = papers.filter(p => p.year && p.year >= cutoffYear);

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
    res.status(200).json({ papers: filtered });
  } catch (error) {
    console.error('Literature API error:', error);
    res.status(500).json({ error: 'Unable to load literature', detail: error.message });
  }
};
