const core = require('../../lib/core');
const adapt = fn => async event => {
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (e) {}
    const q = event.queryStringParameters || {};
    const r = await fn({ method: event.httpMethod, headers: event.headers || {}, query: q, id: q.id, body, origin: new URL(event.rawUrl).origin });
    return { statusCode: r.status, headers: r.headers, body: r.body };
  } catch (e) { return { statusCode: 500, body: JSON.stringify({ error: e.message }) }; }
};
module.exports = { core, adapt };
