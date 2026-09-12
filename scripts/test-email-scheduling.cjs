// Runs the real route against an in-memory database and fake Resend transport.
// No credentials, network requests, or real emails are used.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const fixedNow = Date.parse('2026-09-12T01:00:00+02:00');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [fixedNow])); } static now() { return fixedNow; } }
let db, requests, remoteError, claimBlocked, remoteStatus;
const reset = () => {
  db = { sellers: [{ id: 'seller', subdomain: '4regn', email: 'owner@example.test' }],
    customers: Array.from({ length: 1000 }, (_, i) => ({ id: String(i), seller_id: 'seller', email: `person${i}@example.test`, first_name: 'Person', last_name: null, accepts_email_marketing: true })),
    marketing_email_settings: [], marketing_email_campaigns: [], marketing_email_campaign_recipients: [] };
  requests = []; remoteError = null; claimBlocked = false; remoteStatus = null;
};
const admin = { auth: { getUser: async () => ({ data: { user: { id: 'seller' } } }) }, from(table) {
  let filters = [], op = 'select', value, one = false, start = 0, end = Infinity, order;
  const q = {
    select() { return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; },
    in(k, v) { filters.push(r => v.includes(r[k])); return q; },
    not(k, _, v) { filters.push(r => r[k] !== v); return q; },
    order(k, opts) { order = [k, opts.ascending]; return q; },
    range(a, b) { start = a; end = b + 1; return q; }, limit(n) { end = n; return q; },
    single() { one = true; return q; }, maybeSingle() { one = true; return q; },
    insert(v) { op = 'insert'; value = v; return q; }, update(v) { op = 'update'; value = v; return q; },
    delete() { op = 'delete'; return q; },
    then(resolve, reject) {
      let rows = db[table].filter(r => filters.every(f => f(r)));
      if (order) rows.sort((a, b) => (a[order[0]] > b[order[0]] ? 1 : -1) * (order[1] ? 1 : -1));
      rows = rows.slice(start, end);
      if (op === 'insert') {
        rows = (Array.isArray(value) ? value : [value]).map(v => ({ id: `${table}-${db[table].length + 1}`, created_at: new Clock().toISOString(), updated_at: new Clock().toISOString(), ...v }));
        db[table].push(...rows);
      }
      if (op === 'update') {
        if (claimBlocked && value.status === 'sending') rows = [];
        rows.forEach(r => Object.assign(r, value));
      }
      if (op === 'delete') db[table] = db[table].filter(r => !rows.includes(r));
      return Promise.resolve({ data: one ? (rows[0] ? { ...rows[0] } : null) : rows.map(r => ({ ...r })), error: null, count: rows.length }).then(resolve, reject);
    },
  }; return q;
} };
const cache = {};
function load(file) {
  if (cache[file]) return cache[file].exports;
  const mod = { exports: {} }; cache[file] = mod;
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const req = id => {
    if (id === 'next/server') return { NextResponse: { json: (data, opts = {}) => ({ data, status: opts.status || 200 }) } };
    if (id.endsWith('supabase-admin')) return { getAdmin: () => admin };
    if (id === './email') return { getFourRegnResendFrom: () => '4REGN <info@4regn.com>' };
    if (id.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), id)) + '.ts');
    return require(id);
  };
  const transport = async (url, init) => {
    requests.push({ url, method: init.method || 'GET', body: JSON.parse(init.body || '{}') });
    if (remoteError && url.endsWith('/send')) {
      if (!remoteError.status) throw new Error('Network response lost');
      return { ok: false, status: remoteError.status, text: async () => '{"message":"Rejected"}' };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(remoteStatus && !init.method ? remoteStatus : { id: `remote-${requests.length}` }) };
  };
  vm.runInNewContext(`(function(require,module,exports,process,fetch){${code}\n})`, { console, Date: Clock, setTimeout, URL })(req, mod, mod.exports, { cwd: () => root, env: { FOUR_REGN_RESEND_MARKETING_API_KEY: 'mock' } }, transport);
  return mod.exports;
}
async function main() {
  const helper = load('lib/marketing-schedule.ts');
  assert.equal(helper.todayAtNineSast(), '2026-09-12T09:00');
  assert.equal(helper.parseMarketingSchedule('2026-09-12T09:00'), '2026-09-12T07:00:00.000Z');
  for (const bad of [null, '', '2026-02-30T09:00', '2026-09-12T00:59', '2026-09-12T01:00', '2026-09-12T09:00Z']) assert.throws(() => helper.parseMarketingSchedule(bad));
  console.log('PASS SAST conversion, morning default, invalid/past time validation');
  const api = load('app/api/dashboard/email-marketing/route.ts');
  let key = '4regn-r229-flash-sale-2026-09';
  const post = (action, extra = {}) => api.POST({ json: async () => ({ access_token: 'mock', template_key: key, action, ...extra }) });
  reset();
  const first = await post('create_draft', { recipient_limit: 575 });
  assert.equal(first.status, 200); assert.equal(first.data.total, 575);
  const batch1 = db.marketing_email_campaigns[0]; Object.assign(batch1, { status: 'draft', resend_broadcast_id: 'broadcast-1' });
  const firstEmails = new Set(db.marketing_email_campaign_recipients.map(r => r.email));
  const scheduled = await post('schedule', { campaign_id: batch1.id, confirmation: 'SCHEDULE 575', schedule_local: '2026-09-12T09:00' });
  assert.equal(scheduled.status, 200); assert.equal(batch1.status, 'scheduled'); assert.equal(batch1.sent_at, null);
  assert.equal(requests.find(r => r.url.endsWith('/send')).body.scheduled_at, '2026-09-12T07:00:00.000Z');
  const second = await post('create_draft', { recipient_limit: 575 });
  assert.equal(second.status, 200); assert.equal(second.data.total, 425);
  const batch2 = db.marketing_email_campaigns[1]; Object.assign(batch2, { status: 'draft', resend_broadcast_id: 'broadcast-2' });
  assert.ok(db.marketing_email_campaign_recipients.filter(r => r.campaign_id === batch2.id).every(r => !firstEmails.has(r.email)));
  assert.equal((await post('schedule', { campaign_id: batch2.id, confirmation: 'SCHEDULE 425', schedule_local: '2026-09-12T09:00' })).status, 200);
  assert.equal(batch2.scheduled_at, batch1.scheduled_at);
  assert.equal((await post('overview')).data.remainingCount, 0);
  assert.equal((await post('create_draft')).status, 409);
  assert.equal((await post('schedule', { campaign_id: batch2.id, confirmation: 'SCHEDULE 425', schedule_local: '2026-09-12T09:00' })).status, 409);
  console.log('PASS 575 + 425 disjoint recipients, same 9 AM schedule, reservations, duplicate rejection');
  Object.assign(batch2, { status: 'draft' }); requests = [];
  assert.equal((await post('schedule', { campaign_id: batch2.id, confirmation: 'SEND 425', schedule_local: '2026-09-12T09:00' })).status, 400);
  assert.equal((await post('schedule', { campaign_id: batch2.id, confirmation: 'SCHEDULE 425', schedule_local: '2026-09-12T00:00' })).status, 400);
  claimBlocked = true;
  assert.equal((await post('schedule', { campaign_id: batch2.id, confirmation: 'SCHEDULE 425', schedule_local: '2026-09-12T09:00' })).status, 409);
  assert.equal(requests.length, 0); claimBlocked = false;
  remoteError = { status: 422 };
  assert.equal((await post('schedule', { campaign_id: batch2.id, confirmation: 'SCHEDULE 425', schedule_local: '2026-09-12T09:00' })).status, 422);
  assert.equal(batch2.status, 'draft');
  remoteError = {};
  assert.equal((await post('schedule', { campaign_id: batch2.id, confirmation: 'SCHEDULE 425', schedule_local: '2026-09-12T09:00' })).status, 500);
  assert.equal(batch2.status, 'sending');
  remoteError = null; batch2.updated_at = '2026-09-11T22:00:00Z';
  remoteStatus = { status: 'scheduled', scheduled_at: '2026-09-12T07:00:00.000Z', sent_at: null };
  await post('overview'); assert.equal(batch2.status, 'scheduled');
  remoteStatus = { status: 'sent', scheduled_at: '2026-09-12T07:00:00.000Z', sent_at: '2026-09-12T07:00:01Z' };
  await post('overview'); assert.equal(batch2.status, 'sent');
  console.log('PASS confirmation, atomic claim, rejected/uncertain requests, remote status reconciliation');
  reset(); const draft = await post('create_draft', { recipient_limit: 1 });
  const batch = db.marketing_email_campaigns[0]; Object.assign(batch, { status: 'draft', resend_broadcast_id: 'immediate' });
  assert.equal((await post('send', { campaign_id: draft.data.campaign.id, confirmation: 'SEND 1' })).status, 200);
  assert.equal(batch.status, 'sent'); assert.deepEqual(requests.find(r => r.url.endsWith('/send')).body, {});
  requests = []; await post('test', { to: 'owner@example.test' });
  assert.ok(!requests[0].body.subject.includes('[TEST]')); assert.ok(requests[0].body.subject.includes('🛍️ FLASH SALE!!'));
  console.log('PASS immediate sending preserved and test email uses urgent subject without prefix');
  Object.assign(batch, { status: 'failed', last_error: 'Contact quota reached' });
  remoteStatus = { status: 'sent' }; requests = [];
  assert.equal((await post('recover_draft', { campaign_id: batch.id })).status, 409);
  assert.equal(batch.status, 'failed');
  remoteStatus = { status: 'draft' };
  assert.equal((await post('recover_draft', { campaign_id: batch.id })).status, 200);
  assert.equal(batch.status, 'draft');
  assert.equal(batch.last_error, 'Contact quota reached');
  assert.ok(requests.every(r => r.method === 'GET'));
  assert.equal((await post('recover_draft', { campaign_id: batch.id })).status, 409);
  console.log('PASS failed-batch recovery verifies Resend draft, preserves quota error, never sends or resets a sent broadcast');
  reset();
  await post('create_draft', { recipient_limit: 575 });
  db.marketing_email_campaigns[0].status = 'sent';
  await post('create_draft', { recipient_limit: 425 });
  db.marketing_email_campaigns[1].status = 'sent';
  key = '4regn-r229-flash-sale-reminder-2026-09-12';
  assert.equal((await post('overview')).data.remainingCount, 1000);
  const reminder = await post('create_draft', { recipient_limit: 575 });
  assert.equal(reminder.status, 200);
  assert.equal(reminder.data.total, 575);
  const saved = db.marketing_email_campaigns[2];
  assert.equal(saved.subject, '3 HOURS LEFT!! ⏰ 🛍️ FLASH SALE!! ⏰ 🛍️');
  assert.equal(saved.html_snapshot, db.marketing_email_campaigns[0].html_snapshot);
  assert.equal((await post('overview')).data.remainingCount, 425);
  console.log('PASS reminder reuses original content with a separate audience reservation and the requested subject');
}
main().catch(error => { console.error(error); process.exit(1); });
