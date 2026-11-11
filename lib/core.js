// সব সার্ভার-লজিক এখানে (Netlify ও Vercel দুটোতেই একই কোড চলে)
let cfg = {}; try { cfg = require('./config'); } catch (e) {}
const env = k => String(process.env[k] || cfg[k] || '').trim();
// টেলিগ্রাম secret-এ শুধু A-Z a-z 0-9 _ - চলে, তাই বাকি চিহ্ন বাদ দেওয়া হয়
const SECRET = () => env('TELEGRAM_WEBHOOK_SECRET').replace(/[^A-Za-z0-9_-]/g, '');
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
const FSN = () => `projects/${env('FIREBASE_PROJECT_ID')}/databases/(default)/documents`;
async function getDocRaw(path) {
  const r = await fetch(`${FS()}/${path}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('firestore ' + r.status);
  const d = await r.json(), o = {};
  for (const k in (d.fields || {})) o[k] = dec(d.fields[k]);
  return { data: o, updateTime: d.updateTime };
}
let LAST_ORIGIN = '';
async function adminToken() {
  const url = m => `https://identitytoolkit.googleapis.com/v1/accounts:${m}?key=${encodeURIComponent(env('FIREBASE_API_KEY'))}`;
  const call = async m => (await fetch(url(m), {
    method: 'POST', headers: { 'content-type': 'application/json', ...(LAST_ORIGIN ? { referer: LAST_ORIGIN + '/' } : {}) },
    body: JSON.stringify({ email: env('ADMIN_EMAIL'), password: env('ADMIN_PASSWORD'), returnSecureToken: true })
  })).json();
  const j = await call('signInWithPassword');
  if (j.idToken) return j.idToken;
  const msg = (j.error && j.error.message) || 'unknown';
  // ইউজারই না থাকলে (বা পাসওয়ার্ড ভুল হলে) Firebase একই ত্রুটি দেয় — তাই একবার ইউজার বানানোর চেষ্টা করা হয়
  if (/INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND/.test(msg)) {
    const s = await call('signUp');
    if (s.idToken) return s.idToken;
    const m2 = (s.error && s.error.message) || '';
    if (/EMAIL_EXISTS/.test(m2)) throw new Error('admin login failed: ইউজার আছে কিন্তু পাসওয়ার্ড মিলছে না — ADMIN_PASSWORD (Netlify Environment variables বা lib/config.js) ঠিক করুন');
    throw new Error('admin login failed: ' + msg + (m2 ? ' / ' + m2 : ''));
  }
  throw new Error('admin login failed: ' + msg);
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
  LAST_ORIGIN = origin || LAST_ORIGIN;
  const id = String((body && body.id) || '');
  if (!/^R[A-Z0-9]{6,14}$/.test(id)) return res(400, { ok: false, error: 'bad id' });
  const o = await getDoc('orders/' + id);
  if (!o) return res(404, { ok: false, error: 'not found' });
  if (o.notified) return res(200, { ok: true, dup: true });
  if (!o.createdAt || Date.now() - o.createdAt > 15 * 60 * 1000) return res(400, { ok: false, error: 'stale' });
  const items = (o.items || []).map(i => `• ${esc(i.name)} × ${i.qty} = ৳${i.price * i.qty}`).join('\n');
  const text = `🛒 <b>নতুন অর্ডার</b> #${id}\n\n👤 ${esc(o.name)}\n📞 ${esc(o.phone)}\n📍 ${esc(o.address)}, ${esc(o.upazila)}, ${esc(o.district)}\n\n${items}\n\n💰 মোট ৳${o.total} | অগ্রিম ৳${o.advance} | বাকি ৳${o.due}\n💳 ${esc(o.wallet)}${o.method === 'cod' ? ' (COD)' : ''} • ${esc(o.sender)} • Trx: ${esc(o.trx)}\n\n🔗 ${esc(origin)}/#/admin`;
  const kb = { inline_keyboard: [[{ text: '✅ কনফার্ম', callback_data: 'cf:' + id }, { text: '❌ রিজেক্ট', callback_data: 'rj:' + id }]] };
  const r = await tg('sendMessage', { chat_id: env('TELEGRAM_CHAT_ID'), text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
  if (!r.ok) return res(502, { ok: false, error: r.description });
  try { await setBool('orders/' + id, 'notified', true); } catch (e) { /* নোটিফিকেশন গেছে, মার্ক না হলেও সমস্যা নেই */ }
  return res(200, { ok: true });
}

// ---------- টেলিগ্রাম বট: শুধু অর্ডার কনফার্ম / রিজেক্ট ----------
const STL = { pending: 'অপেক্ষমাণ', confirmed: 'কনফার্মড', processing: 'প্রস্তুত হচ্ছে', shipped: 'কুরিয়ারে', delivered: 'ডেলিভারি সম্পন্ন', cancelled: 'বাতিল' };
const PID = /^[\w-]{1,40}$/;
const authHdr = tk => ({ 'content-type': 'application/json', authorization: 'Bearer ' + tk });
async function fsFail(r, what) {
  const j = await r.json().catch(() => ({}));
  const e = new Error((j.error && j.error.message) || (what + ' ' + r.status));
  e.precond = /precondition|FAILED_PRECONDITION|ABORTED/i.test(JSON.stringify(j));
  return e;
}
// কনফার্ম: স্ট্যাটাস 'confirmed' + স্টক কাটা — অ্যাডমিন প্যানেলের মতোই, একবারেই (atomic)
async function confirmOrder(id, raw) {
  const o = raw.data, tk = await adminToken(), now = Date.now();
  const hist = [...(o.history || []), { s: 'confirmed', t: now }].map(h => ({ mapValue: { fields: { s: { stringValue: String(h.s) }, t: { integerValue: String(Math.round(+h.t || now)) } } } }));
  const writes = [{
    update: { name: `${FSN()}/orders/${id}`, fields: { status: { stringValue: 'confirmed' }, history: { arrayValue: { values: hist } }, cut: { booleanValue: true } } },
    updateMask: { fieldPaths: ['status', 'history', 'cut'] },
    currentDocument: { updateTime: raw.updateTime }
  }];
  if (!o.cut) for (const i of (o.items || [])) {
    if (!PID.test(String(i.id || '')) || !(await getDoc('products/' + i.id))) continue;   // মুছে ফেলা প্রোডাক্ট বাদ
    const q = Math.min(Math.max(1, Math.floor(+i.qty || 0)), 999);
    writes.push({ transform: { document: `${FSN()}/products/${i.id}`, fieldTransforms: [{ fieldPath: 'stock', increment: { integerValue: String(-q) } }] } });
  }
  const r = await fetch(`${FS()}:commit`, { method: 'POST', headers: authHdr(tk), body: JSON.stringify({ writes }) });
  if (!r.ok) throw await fsFail(r, 'commit');
}
// রিজেক্ট: অর্ডার ডিলিট
async function rejectOrder(id, raw) {
  const tk = await adminToken();
  const r = await fetch(`${FS()}/orders/${id}?currentDocument.updateTime=${encodeURIComponent(raw.updateTime)}`, { method: 'DELETE', headers: authHdr(tk) });
  if (!r.ok) throw await fsFail(r, 'delete');
}

async function handleTelegram({ method, headers, query, body, origin }) {
  LAST_ORIGIN = origin || LAST_ORIGIN;
  if (method === 'GET') {            // একবার ব্রাউজারে খুললেই ওয়েবহুক সেট হবে
    if (!env('SETUP_KEY') || query.setup !== env('SETUP_KEY')) return res(403, { error: 'forbidden' });
    const w = await tg('setWebhook', { url: origin + '/api/telegram', secret_token: SECRET(), allowed_updates: ['message', 'callback_query'] });
    const c = await tg('deleteMyCommands', {});   // পুরনো /menu /status কমান্ড মুছে ফেলা হয়
    return res(200, { webhook: w, commands: c });
  }
  if (!SECRET() || headers['x-telegram-bot-api-secret-token'] !== SECRET()) return res(401, { error: 'bad secret' });
  const u = body || {}, cb = u.callback_query;
  if (!cb) return res(200, { ok: true, ignored: true });                 // মেসেজ/কমান্ডে কিছুই করবে না — শুধু বাটন কাজ করে
  const msg = cb.message, chat = msg && msg.chat && String(msg.chat.id);
  const say = (text, alert) => tg('answerCallbackQuery', { callback_query_id: cb.id, ...(text ? { text: String(text).slice(0, 190), show_alert: !!alert } : {}) }).catch(() => {});
  if (!chat || chat !== env('TELEGRAM_CHAT_ID')) { await say(); return res(200, { ok: true, ignored: true }); }   // অন্য কেউ হলে কিছুই করবে না
  const m = /^(cf|rj):(R[A-Z0-9]{6,14})$/.exec(String(cb.data || ''));
  if (!m) { await say(); return res(200, { ok: true, ignored: true }); }  // পুরনো অন/অফ বাটন ইত্যাদি
  const act = m[1], id = m[2];
  const finish = line => tg('editMessageText', { chat_id: chat, message_id: msg.message_id, text: (msg.text || '') + '\n\n' + line, entities: msg.entities, disable_web_page_preview: true }).catch(() => {});
  try {
    const raw = await getDocRaw('orders/' + id);
    if (!raw) { await say('⚠️ অর্ডারটি আর নেই (আগেই মুছে গেছে)', true); await finish('🗑 অর্ডারটি আর নেই'); return res(200, { ok: true }); }
    const st = raw.data.status;
    if (st !== 'pending') { const l = STL[st] || st; await say('এই অর্ডার ইতিমধ্যে "' + l + '" অবস্থায় আছে', true); await finish('ℹ️ বর্তমান স্ট্যাটাস: ' + l); return res(200, { ok: true }); }
    if (act === 'cf') { await confirmOrder(id, raw); await say('✅ অর্ডার কনফার্ম হয়েছে'); await finish('✅ কনফার্ম করা হয়েছে'); }
    else { await rejectOrder(id, raw); await say('🗑 অর্ডার রিজেক্ট করে মুছে ফেলা হয়েছে'); await finish('❌ রিজেক্ট করা হয়েছে — অর্ডার মুছে ফেলা হয়েছে'); }
  } catch (e) {
    await say(e.precond ? '⚠️ অর্ডারটি এইমাত্র বদলে গেছে, আবার চেষ্টা করুন' : '⚠️ ত্রুটি: ' + e.message, true);
  }
  return res(200, { ok: true });
}

// ---------- প্রোডাক্ট লিংক শেয়ার প্রিভিউ (/p/ID) ----------
// ফেসবুক/হোয়াটসঅ্যাপ/টেলিগ্রামের বটকে ছোট প্রিভিউ পেজ দেওয়া হয়; সাধারণ ভিজিটর সঙ্গে সঙ্গে সাইটে চলে যায় (দ্রুত)
const BOT = /facebookexternalhit|facebot|whatsapp|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|pinterest|skypeuripreview|googlebot|bingbot|embedly|viber|applebot/i;
async function handleOg({ id, origin, headers }) {
  const back = res(302, '', 'text/plain', { location: id ? '/#/p/' + id : '/' });
  if (!/^[\w-]{1,40}$/.test(id || '')) return back;
  if (!BOT.test((headers && headers['user-agent']) || '')) return back;
  try {
    const p = await getDoc('products/' + id);
    if (!p || !p.name) return back;
    const price = Number(p.offer) || Number(p.price) || 0;
    const desc = String(p.desc || '').replace(/\s+/g, ' ').slice(0, 150) || 'এখনই অর্ডার করুন — সারা বাংলাদেশে ডেলিভারি';
    const first = (p.images || [])[0] || '';
    const img = /^https:\/\//.test(first) ? first : (first || p.thumb) ? `${origin}/api/img?p=${id}` : '';
    const url = `${origin}/p/${id}`, title = p.name + (price ? ` — ৳${price}` : '');
    const html = `<!doctype html><html lang="bn"><head><meta charset="utf-8"><title>${esc(title)}</title><meta name="description" content="${attr(desc)}"><meta property="og:type" content="product"><meta property="og:title" content="${attr(title)}"><meta property="og:description" content="${attr(desc)}"><meta property="og:url" content="${attr(url)}">${img ? `<meta property="og:image" content="${attr(img)}"><meta name="twitter:card" content="summary_large_image">` : ''}<meta http-equiv="refresh" content="0;url=/#/p/${id}"></head><body><a href="/#/p/${id}">${esc(p.name)}</a></body></html>`;
    return res(200, html, 'text/html; charset=utf-8', { 'cache-control': 'public, max-age=300' });
  } catch (e) { return back; }
}

// ---------- শেয়ার প্রিভিউর ছবি (ফ্রি মোডের ছবি এখান থেকে যায়) ----------
async function handleImg({ query }) {
  const id = String((query && query.p) || '');
  if (!/^[\w-]{1,40}$/.test(id)) return res(400, { error: 'bad id' });
  try {
    const p = await getDoc('products/' + id);
    if (!p) return res(404, { error: 'not found' });
    let src = (p.images || [])[0] || '';
    if (src.startsWith('fs:')) { const im = await getDoc('imgs/' + src.slice(3)); src = (im && im.d) || ''; }
    if (!src.startsWith('data:')) src = p.thumb || '';
    const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(src);
    if (!m) return res(404, { error: 'no image' });
    return { status: 200, headers: { 'content-type': m[1], 'cache-control': 'public, max-age=86400' }, body: m[2], b64: true };
  } catch (e) { return res(500, { error: 'img' }); }
}

// ---------- বট নিজে নিজে সেট হয় (প্রতিদিন একবার সাইট থেকে ডাকা হয়) ----------
async function handlePing({ origin }) {
  try {
    const want = origin + '/api/telegram', i = await tg('getWebhookInfo', {}), r = (i && i.result) || {};
    if (i && i.ok && (!r.url || (r.last_error_message && r.url !== want))) {
      const w = await tg('setWebhook', { url: want, secret_token: SECRET(), allowed_updates: ['message', 'callback_query'] });
      await tg('deleteMyCommands', {});
      return res(200, { ok: true, set: !!w.ok });
    }
    return res(200, { ok: true, set: false });
  } catch (e) { return res(200, { ok: false }); }
}

module.exports = { handleNotify, handleTelegram, handleOg, handleImg, handlePing };
