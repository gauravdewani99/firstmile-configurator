// Serverless datastore for saved flows.
// Reuses FEEDBACK_GH_TOKEN (has `gist` scope) and keeps a single private GitHub Gist
// as a tiny JSON database. No extra provisioning needed.
//
//   GET    /api/flows            → { flows: [...] }
//   POST   /api/flows            → upsert a flow (keyed by client|variant); body { name, client, variant, state }
//   DELETE /api/flows?id=<id>    → remove a flow

const TOKEN = process.env.FEEDBACK_GH_TOKEN;
const DB_MARKER = 'firstmile-configurator :: saved flows DB';
const DB_FILE = 'flows.json';
let cachedGistId = null; // warm-invocation cache

function gh(path, opts = {}) {
  return fetch('https://api.github.com' + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'firstmile-configurator-flows',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

async function findOrCreateGist() {
  if (cachedGistId) return cachedGistId;
  const listed = await gh('/gists?per_page=100');
  if (listed.ok) {
    const gists = await listed.json();
    const found = Array.isArray(gists) && gists.find(g => g.description === DB_MARKER);
    if (found) { cachedGistId = found.id; return found.id; }
  }
  const created = await gh('/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: DB_MARKER,
      public: false,
      files: { [DB_FILE]: { content: JSON.stringify({ flows: [] }, null, 2) } },
    }),
  });
  if (!created.ok) throw new Error('gist create failed: ' + created.status + ' ' + (await created.text()));
  const g = await created.json();
  cachedGistId = g.id;
  return g.id;
}

async function readFlows(gistId) {
  const res = await gh('/gists/' + gistId);
  if (!res.ok) return [];
  const g = await res.json();
  const file = g.files && g.files[DB_FILE];
  if (!file) return [];
  let content = file.content;
  if (file.truncated && file.raw_url) content = await (await fetch(file.raw_url)).text();
  try { return JSON.parse(content).flows || []; } catch { return []; }
}

async function writeFlows(gistId, flows) {
  const res = await gh('/gists/' + gistId, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [DB_FILE]: { content: JSON.stringify({ flows }, null, 2) } } }),
  });
  if (!res.ok) throw new Error('gist write failed: ' + res.status + ' ' + (await res.text()));
}

export default async function handler(req, res) {
  if (!TOKEN) { res.status(500).json({ error: 'Flows backend not configured (FEEDBACK_GH_TOKEN missing).' }); return; }
  try {
    const gistId = await findOrCreateGist();

    if (req.method === 'GET') {
      const flows = await readFlows(gistId);
      res.status(200).json({ flows });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      body = body || {};
      const name = String(body.name || '').trim();
      const client = String(body.client || '').trim();
      const variant = String(body.variant || '').trim();
      if (!name || !variant) { res.status(400).json({ error: 'name and variant are required' }); return; }

      const flows = await readFlows(gistId);
      const key = client + '|' + variant;
      const idx = flows.findIndex(f => (f.client + '|' + f.variant) === key);
      const record = {
        id: idx >= 0 ? flows[idx].id : ('f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
        name, client, variant,
        state: body.state || {},
        savedAt: new Date().toISOString(),
      };
      if (idx >= 0) flows[idx] = record; else flows.unshift(record);
      await writeFlows(gistId, flows);
      res.status(200).json({ ok: true, flow: record });
      return;
    }

    if (req.method === 'DELETE') {
      const id = String((req.query && req.query.id) || '');
      if (!id) { res.status(400).json({ error: 'id required' }); return; }
      const flows = await readFlows(gistId);
      await writeFlows(gistId, flows.filter(f => f.id !== id));
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(502).json({ error: 'Flows backend error', detail: String(err) });
  }
}
