// Serverless function: receives feedback from the widget and files it as a
// GitHub issue (labeled "feedback") on the firstmile-configurator repo.
// "Open feedback" == open issues with the `feedback` label.
//
// Requires a Vercel env var FEEDBACK_GH_TOKEN: a fine-grained GitHub token
// scoped to ONLY this repo with Issues: Read and write.

const REPO = 'gauravdewani99/firstmile-configurator';

const VARIANT_NAMES = {
  A: 'v1 Lane-by-Lane',
  B: 'v2 Carrier-First',
  C: 'v3 Inline Grid',
  D: 'v4 Client Preferences',
  E: 'v5 Tabular',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = process.env.FEEDBACK_GH_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'Feedback backend not configured (missing FEEDBACK_GH_TOKEN).' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const text = String(body.text || '').trim();
  if (!text) { res.status(400).json({ error: 'Empty feedback.' }); return; }
  if (text.length > 5000) { res.status(400).json({ error: 'Feedback too long.' }); return; }

  const variant = String(body.variant || '');
  const client = String(body.client || '').slice(0, 120);
  const when = String(body.when || new Date().toISOString());
  const vLabel = VARIANT_NAMES[variant] || variant || 'unknown';

  const firstLine = text.split('\n')[0];
  const title = firstLine.length > 70 ? firstLine.slice(0, 67) + '…' : firstLine;

  const issueBody = [
    text,
    '',
    '---',
    `- **Variant:** ${vLabel}`,
    `- **Client:** ${client || '—'}`,
    `- **Submitted:** ${when}`,
    '',
    '_Filed automatically from the in-app feedback widget._',
  ].join('\n');

  try {
    const ghRes = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'firstmile-configurator-feedback',
      },
      body: JSON.stringify({
        title: `[feedback] ${title}`,
        body: issueBody,
        labels: ['feedback'],
      }),
    });

    if (!ghRes.ok) {
      const detail = await ghRes.text();
      res.status(502).json({ error: 'Could not file feedback.', status: ghRes.status, detail });
      return;
    }

    const issue = await ghRes.json();
    res.status(200).json({ ok: true, number: issue.number, url: issue.html_url });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach GitHub.', detail: String(err) });
  }
}
