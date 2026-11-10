// সব সার্ভার-লজিক এখানে (Netlify ও Vercel দুটোতেই একই কোড চলে)
const env = k => (process.env[k] || '').trim();
const res = (status, body, type = 'application/json', extra = {}) =>
  ({ status, headers: { 'content-type': type, ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = s => esc(s).replace(/"/g, '&quot;');
const FS = () => `https://firestore.googleapis.com/v1/projects/${env('FIREBASE_PROJECT_ID')}/databases/(default)/documents`;

function dec(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) { const o = {}; for (const k in (v.mapValue.fields || {})) o[k] = dec(v.mapValue.fields[k]); return o; }
  return null;
}
async function getDoc(path) {
  const r = await fetch(`${FS()}/${path}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('firestore ' + r.status);
  const d = await r.json(), o = {};
  for (const k in (d.fields || {})) o[k] = dec(d.fields[k]);
  return o;
}
async function adminToken() {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env('FIREBASE_API_KEY')}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: env('ADMIN_EMAIL'), password: env('ADMIN_PASSWORD'), returnSecureToken: true })
  });
  const j = await r.json();
  if (!j.idToken) throw new Error('admin login failed: ' + (j.error && j.error.message));
  return j.idToken;
}
async function setBool(path, field, value) {
  const token = await adminToken();
  const r = await fetch(`${FS()}/${path}?updateMask.fieldPaths=${field}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ fields: { [field]: { booleanValue: value } } })
  });
  if (!r.ok) throw new Error('write failed ' + r.status);
}
const tg = (method, body) =>
  fetch(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }).then(r => r.json());

// ---------- নতুন অর্ডারের নোটিফিকেশন ----------
async function handleNotify({ body, origin }) {
  const id = String((body && body.id) || '');
  if (!/^R[A-Z0-9]{6,14}$/.test(id)) return res(400, { ok: false, error: 'bad id' });
  const o = await getDoc('orders/' + id);
  if (!o) return res(404, { ok: false, error: 'not found' });
  if (o.notified) return res(200, { ok: true, dup: true });
  if (!o.createdAt || Date.now() - o.createdAt > 15 * 60 * 1000) return res(400, { ok: false, error: 'stale' });
  const items = (o.items || []).map(i => `• ${esc(i.name)} × ${i.qty} = ৳${i.price * i.qty}`).join('\n');
  const text = `🛒 <b>নতুন অর্ডার</b> #${id}\n\n👤 ${esc(o.name)}\n📞 ${esc(o.phone)}\n📍 ${esc(o.address)}, ${esc(o.upazila)}, ${esc(o.district)}\n\n${items}\n\n💰 মোট ৳${o.total} | অগ্রিম ৳${o.advance} | বাকি ৳${o.due}\n💳 ${esc(o.wallet)}${o.method === 'cod' ? ' (COD)' : ''} • ${esc(o.sender)} • Trx: ${esc(o.trx)}\n\n🔗 ${esc(origin)}/#/admin`;
  const r = await tg('sendMessage', { chat_id: env('TELEGRAM_CHAT_ID'), text, parse_mode: 'HTML', disable_web_page_preview: true });
  if (!r.ok) return res(502, { ok: false, error: r.description });
  try { await setBool('orders/' + id, 'notified', true); } catch (e) { /* নোটিফিকেশন গেছে, মার্ক না হলেও সমস্যা নেই */ }
  return res(200, { ok: true });
}

// ---------- টেলিগ্রাম বট (অন/অফ) ----------
const kb = { inline_keyboard: [[{ text: '🟢 অর্ডার চালু', callback_data: 'on' }, { text: '🔴 অর্ডার বন্ধ', callback_data: 'off' }]] };
const statusText = open => (open ? '🟢 ওয়েবসাইটে অর্ডার নেওয়া <b>চালু</b> আছে' : '🔴 ওয়েবসাইটে অর্ডার নেওয়া <b>বন্ধ</b> আছে') + '\n\nনিচের বাটনে চাপ দিন:';
async function isOpen() { const s = await getDoc('settings/main'); return !(s && s.orderOpen === false); }

async function handleTelegram({ method, headers, query, body, origin }) {
  if (method === 'GET') {            // একবার ব্রাউজারে খুললেই ওয়েবহুক সেট হবে
    if (!env('SETUP_KEY') || query.setup !== env('SETUP_KEY')) return res(403, { error: 'forbidden' });
    const w = await tg('setWebhook', { url: origin + '/api/telegram', secret_token: env('TELEGRAM_WEBHOOK_SECRET'), allowed_updates: ['message', 'callback_query'] });
    const c = await tg('setMyCommands', { commands: [{ command: 'menu', description: 'অর্ডার অন/অফ মেনু' }, { command: 'status', description: 'বর্তমান অবস্থা' }] });
    return res(200, { webhook: w, commands: c });
  }
  if (!env('TELEGRAM_WEBHOOK_SECRET') || headers['x-telegram-bot-api-secret-token'] !== env('TELEGRAM_WEBHOOK_SECRET')) return res(401, { error: 'bad secret' });
  const u = body || {}, cb = u.callback_query, msg = cb ? cb.message : u.message;
  const chat = msg && msg.chat && String(msg.chat.id);
  if (!chat || chat !== env('TELEGRAM_CHAT_ID')) return res(200, { ok: true, ignored: true });   // অন্য কেউ হলে কিছুই করবে না
  try {
    if (cb) {
      let open = await isOpen();
      if (cb.data === 'on' || cb.data === 'off') { open = cb.data === 'on'; await setBool('settings/main', 'orderOpen', open); }
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: open ? 'অর্ডার চালু হয়েছে ✅' : 'অর্ডার বন্ধ হয়েছে ⛔' });
      await tg('editMessageText', { chat_id: chat, message_id: msg.message_id, text: statusText(open), parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
    } else {
      const t = String(msg.text || '').trim().split(/[\s@]/)[0].toLowerCase();
      let open = await isOpen();
      if (t === '/on' || t === '/off') { open = t === '/on'; await setBool('settings/main', 'orderOpen', open); }
      await tg('sendMessage', { chat_id: chat, text: statusText(open), parse_mode: 'HTML', reply_markup: kb });
    }
  } catch (e) {
    await tg('sendMessage', { chat_id: chat, text: '⚠️ ত্রুটি: ' + esc(e.message) });
  }
  return res(200, { ok: true });
}

// ---------- প্রোডাক্ট লিংক শেয়ার প্রিভিউ (/p/ID) ----------
const setMeta = (html, key, val) => {
  const tag = `<meta property="${key}" content="${attr(val)}">`;
  const re = new RegExp(`<meta (?:property|name)="${key}"[^>]*>`);
  return re.test(html) ? html.replace(re, () => tag) : html.replace('</head>', () => tag + '</head>');
};
async function handleOg({ id, origin }) {
  const back = res(302, '', 'text/plain', { location: '/#/p/' + (id || '') });
  if (!/^[\w-]{1,40}$/.test(id || '')) return back;
  try {
    const [p, page] = await Promise.all([getDoc('products/' + id), fetch(origin + '/index.html').then(r => r.ok ? r.text() : Promise.reject())]);
    let html = page;
    if (p && p.name) {
      const price = Number(p.offer) || Number(p.price) || 0, img = (p.images || [])[0] || '';
      const desc = String(p.desc || '').replace(/\s+/g, ' ').slice(0, 150) || 'এখনই অর্ডার করুন — সারা বাংলাদেশে ডেলিভারি';
      html = html.replace(/<title>.*?<\/title>/, () => `<title>${esc(p.name)}</title>`);
      html = setMeta(html, 'og:title', p.name + (price ? ` — ৳${price}` : ''));
      html = setMeta(html, 'og:description', desc);
      html = setMeta(html, 'description', desc);
      html = setMeta(html, 'og:url', `${origin}/p/${id}`);
      if (/^https:\/\//.test(img)) html = setMeta(html, 'og:image', img);
    }
    return res(200, html, 'text/html; charset=utf-8', { 'cache-control': 'public, max-age=0, s-maxage=60' });
  } catch (e) { return back; }
}

module.exports = { handleNotify, handleTelegram, handleOg };
