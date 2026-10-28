import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = fileURLToPath(new URL('../src/lib/data', import.meta.url));
const reports = JSON.parse(readFileSync(base + '/reports-4471.json', 'utf8'));
const notes = JSON.parse(readFileSync(base + '/desk-notes.json', 'utf8'));
const tenants = readdirSync(base + '/tenants').map((f) => JSON.parse(readFileSync(base + '/tenants/' + f, 'utf8')));
const byHandle = new Map(tenants.map((t) => [t.handle, t]));

const DATE_HINT = { 'booking-v2': 'DD/MM/YYYY', 'booking-v3': 'MM/DD/YYYY' };

function dayFirst(locale) {
  const order = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(Date.UTC(2026, 0, 2, 12)))
    .map((p) => p.type);
  return order.indexOf('day') < order.indexOf('month');
}

function causeOf(r, t) {
  if (!t || !dayFirst(t.locale)) return null;
  return r.channel === 'form' && DATE_HINT[t.form].startsWith('MM') ? 'hint' : 'parser';
}

// 1. raw vs unique
const ids = reports.map((r) => r.id);
const uniq = [...new Map(reports.map((r) => [r.id, r])).values()];
console.log('raw entries:', reports.length, '| unique ids:', uniq.length, '| dup ids:', reports.length - uniq.length);
const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
console.log('duplicate ids:', [...new Set(dupIds)].join(', '));

// 2. mergedInto distribution (unique)
const byMerged = {};
for (const r of uniq) byMerged[r.mergedInto] = (byMerged[r.mergedInto] ?? 0) + 1;
console.log('mergedInto distribution:', JSON.stringify(byMerged));

// 3. groups for ticket 4471
const merged = uniq.filter((r) => r.mergedInto === 4471);
console.log('merged into 4471 (unique):', merged.length);

const groups = new Map();
for (const r of merged) {
  const t = byHandle.get(r.tenant);
  const c = causeOf(r, t) ?? 'unplaced';
  if (!groups.has(c)) groups.set(c, []);
  groups.get(c).push(r);
}
for (const [c, rs] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const tags = rs.reduce((n, r) => ({ ...n, [r.meta.intakeTag]: (n[r.meta.intakeTag] ?? 0) + 1 }), {});
  const days = rs.map((r) => r.receivedAt.slice(0, 10)).sort();
  console.log(`\ncause=${c} reports=${rs.length} tenants=${new Set(rs.map((r) => r.tenant)).size} seen=${days[0]}..${days[days.length - 1]}`);
  console.log('  taggedAs:', JSON.stringify(tags));
  console.log('  channels:', JSON.stringify(rs.reduce((n, r) => ({ ...n, [r.channel]: (n[r.channel] ?? 0) + 1 }), {})));
  const perTenant = {};
  for (const r of rs) perTenant[r.tenant] = (perTenant[r.tenant] ?? 0) + 1;
  console.log('  perTenant:', JSON.stringify(perTenant));
}

// 4. unplaced detail
const unplaced = groups.get('unplaced') ?? [];
for (const r of unplaced) {
  const t = byHandle.get(r.tenant);
  console.log('unplaced:', r.id, '| tenant:', r.tenant, t ? 'known locale=' + t.locale + ' dayFirst=' + dayFirst(t.locale) : 'NO TENANT ON FILE', '| channel:', r.channel, '| subject:', r.subject);
}

// 5. oneDayMove notes
console.log('\noneDayMove ids:', notes.oneDayMove.join(', '));
for (const id of notes.oneDayMove) {
  const r = uniq.find((x) => x.id === id);
  if (!r) { console.log(id, 'NOT FOUND in export'); continue; }
  const t = byHandle.get(r.tenant);
  console.log(id, '| mergedInto:', r.mergedInto, '| cause:', causeOf(r, t), '| tenant:', r.tenant, '| channel:', r.channel, '| subject:', r.subject);
}

// 6. subjects of hint group (to describe the bug)
const hint = groups.get('hint') ?? [];
if (hint.length) {
  const subj = {};
  for (const r of hint) subj[r.subject] = (subj[r.subject] ?? 0) + 1;
  console.log('\nhint subjects:', JSON.stringify(subj, null, 1));
  console.log('hint sample body:', hint[0].body);
  console.log('hint tenants:', [...new Set(hint.map((r) => r.tenant))].join(', '));
}
