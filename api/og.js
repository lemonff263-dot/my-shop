const core = require('../lib/core');
module.exports = async (req, res) => {
  try {
    const origin = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);
    let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const r = await core.handleOg({ method: req.method, headers: req.headers, query: req.query || {}, id: (req.query || {}).id, body: body || {}, origin });
    Object.entries(r.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    res.status(r.status).send(r.body);
  } catch (e) { res.status(500).json({ error: e.message }); }
};
