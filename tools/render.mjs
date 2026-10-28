// Renders the kb page `incidents/4471-split` as the desk will see it:
// the runbook frame + CauseTable + QueueTimeline + Callout + RenderStamp,
// computed from the same data the desk's components use.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';

const repo = 'C:/Users/admin/Desktop/course/s01e01/work/repo';
const dataDir = repo + '/support-kb/src/lib/data';
const reports = JSON.parse(readFileSync(dataDir + '/reports-4471.json', 'utf8'));
const notes = JSON.parse(readFileSync(dataDir + '/desk-notes.json', 'utf8'));
const tenants = readdirSync(dataDir + '/tenants').map((f) => JSON.parse(readFileSync(dataDir + '/tenants/' + f, 'utf8')));
const byHandle = new Map(tenants.map((t) => [t.handle, t]));

const DATE_HINT = { 'booking-v2': 'DD/MM/YYYY', 'booking-v3': 'MM/DD/YYYY' };
function dayFirst(locale) {
  const order = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(Date.UTC(2026, 0, 2, 12))).map((p) => p.type);
  return order.indexOf('day') < order.indexOf('month');
}
function causeOf(r, t) {
  if (!t || !dayFirst(t.locale)) return null;
  return r.channel === 'form' && DATE_HINT[t.form].startsWith('MM') ? 'hint' : 'parser';
}
function uniqueById(rs) { return [...new Map(rs.map((r) => [r.id, r])).values()]; }
function groupByCause(rs, tenantOf) {
  const byCause = new Map();
  for (const r of rs) {
    const cause = causeOf(r, tenantOf(r)) ?? 'unplaced';
    byCause.set(cause, [...(byCause.get(cause) ?? []), r]);
  }
  return [...byCause.entries()].map(([cause, rs2]) => {
    const days = rs2.map((r) => r.receivedAt.slice(0, 10)).sort();
    return {
      cause, reports: rs2,
      taggedAs: rs2.reduce((n, r) => ({ ...n, [r.meta.intakeTag]: (n[r.meta.intakeTag] ?? 0) + 1 }), {}),
      tenants: new Set(rs2.map((r) => r.tenant)).size,
      firstSeen: days[0], lastSeen: days[days.length - 1],
      mergedInto: [...new Set(rs2.flatMap((r) => (r.mergedInto ? [r.mergedInto] : [])))],
    };
  }).sort((a, b) => b.reports.length - a.reports.length);
}
const ticketCause = (groups, ticket) => groups.find((g) => g.mergedInto.includes(ticket))?.cause ?? null;
const readAs = (g, ids) => g.reports.filter((r) => ids.includes(r.id)).length;

// desk-ref (port of desk-ref.ts)
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function fnv1a(text, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
function deskRef(signature) {
  const t = signature.trim();
  const a = fnv1a(t, 0x811c9dc5);
  const b = fnv1a(t, 0x9e3779b9);
  let bits = (BigInt(a) << 8n) | BigInt(b & 0xff);
  let out = '';
  for (let i = 0; i < 8; i++) { out = ALPHABET[Number(bits & 31n)] + out; bits >>= 5n; }
  return `DR-${out.slice(0, 4)}-${out.slice(4)}`;
}

// staleness (port of staleness.ts)
const STALE_AFTER_DAYS = 180;
const REVIEWED = '2026-10-28';
const daysSince = (d, now = new Date()) => Math.floor((now.getTime() - new Date(d).getTime()) / 86_400_000);

// frontmatter
const TITLE = '#4471 split · what the 412 reports actually show';
const OWNER = 'Piotr (with harness Cline)';
const STATUS = 'proposed';
const SIGNATURE = 'Piotr + Cline';
const ref = deskRef(SIGNATURE);
console.log('desk ref for signature', JSON.stringify(SIGNATURE), '=', ref);

// CauseTable
const merged = uniqueById(reports).filter((r) => r.mergedInto === 4471);
const groups = groupByCause(merged, (r) => byHandle.get(r.tenant));
const owner = ticketCause(groups, 4471);
const tags = (g) => Object.entries(g.taggedAs).sort((a, b) => b[1] - a[1]).map(([tag, n]) => `${tag} ×${n}`).join(' · ');
const causeTable = `
<p class="sum"><strong>${merged.length}</strong> reports merged into #4471 · <strong>${groups.length}</strong> ${groups.length === 1 ? 'cause' : 'causes'}</p>
<table>
  <thead><tr><th>cause</th><th>reports</th><th>tagged as</th><th>tenants</th><th>seen</th><th></th></tr></thead>
  <tbody>
    ${groups.map((g) => `
    <tr${g.cause !== owner ? ' class="wrong"' : ''}>
      <td><code>${g.cause}</code></td><td>${g.reports.length}</td><td class="tags">${tags(g)}</td>
      <td>${g.tenants}</td><td>${g.firstSeen} → ${g.lastSeen}</td>
      <td>${g.cause === owner ? '#4471' : 'not this ticket — no ticket of its own'}</td>
    </tr>`).join('')}
  </tbody>
</table>
${groups.map((g) => {
  const moved = readAs(g, notes.oneDayMove);
  return moved ? `\n<p class="note">${moved} reports read as a one-day move; filed under <code>${g.cause}</code> by tenant.</p>` : '';
}).join('')}`;

// QueueTimeline
const WEEK = 7 * 86_400_000;
const day = (iso) => Date.parse(iso.slice(0, 10));
const from = '2026-03-30', to = '2026-10-05';
const start = day(from);
const count = Math.ceil((day(to) - start) / WEEK);
const rows = Array.from({ length: count }, (_, i) => ({ at: start + i * WEEK, received: 0, merged: 0 }));
const weekOf = (iso) => rows[Math.floor((day(iso) - start) / WEEK)];
for (const r of uniqueById(reports)) {
  if (r.mergedInto !== 4471) continue;
  const rIn = weekOf(r.receivedAt); if (rIn) rIn.received++;
  const rM = r.mergedAt ? weekOf(r.mergedAt) : undefined; if (rM) rM.merged++;
}
const max = Math.max(...rows.flatMap((w) => [w.received, w.merged]));
const label = (ms) => new Date(ms).toISOString().slice(5, 10);
const h = (n) => (n / max) * 100;
const timeline = `
<figure>
  <svg viewBox="0 0 ${rows.length * 24} 140" role="img" aria-label="reports received and merged into #4471, per week">
    ${rows.map((w, i) => `
    <rect class="in" x="${i * 24 + 2}" y="${110 - h(w.received)}" width="9" height="${h(w.received)}" />
    <rect class="merged" x="${i * 24 + 12}" y="${110 - h(w.merged)}" width="9" height="${h(w.merged)}" />
    ${i % 4 === 0 ? `<text x="${i * 24 + 12}" y="128">${label(w.at)}</text>` : ''}`).join('')}
  </svg>
  <figcaption><span class="key in"></span> received · <span class="key merged"></span> merged into #4471 · per week</figcaption>
</figure>`;

// page body (matches the .svx source)
const age = daysSince(REVIEWED);
const stale = age > STALE_AFTER_DAYS;
const body = `
<p>#4471 was merged as one issue: &ldquo;the parser reads dates month first&rdquo;. Run the desk&rsquo;s own
logic (<code>src/lib/kb/causes.ts</code>) over the export and the ticket turns out to hold <strong>two
different bugs</strong>. One of them has no ticket of its own.</p>
<aside class="warn">Two causes in one ticket: <code>parser</code> (379 reports) and <code>hint</code> (33 reports).
The <code>hint</code> reports were merged into the wrong place — different bug, different fix.</aside>
<h2>What #4471 contains</h2>
${causeTable}
<p>The <code>hint</code> group is three tenants only — <code>alder.physio</code>, <code>copper.studio</code>,
<code>pale.harbour</code> — the ones running <code>booking-v3</code>. Their form prints <code>MM/DD/YYYY</code>
under the date field, their people type what the hint tells them, and the form reads it the tenant&rsquo;s way.
That is not the shared parser flipping month and day; it is the form&rsquo;s own hint. It needs its own ticket
and its own fix.</p>
<h2>The queue since April</h2>
${timeline}
<h2>Tickets filed</h2>
<p>One ticket per problem, filed in
<a href="https://github.com/sabakp01/mega-s01e03-what-it-shows">github.com/sabakp01/mega-s01e03-what-it-shows</a>:</p>
<ul>
<li><strong>parser</strong> — dates read month first for day-first tenants — <strong>379 reports</strong> — <a href="https://github.com/sabakp01/mega-s01e03-what-it-shows/issues/1">issue #1</a></li>
<li><strong>hint</strong> — booking-v3 prints <code>MM/DD/YYYY</code> for day-first tenants — <strong>33 reports</strong> — <a href="https://github.com/sabakp01/mega-s01e03-what-it-shows/issues/2">issue #2</a></li>
</ul>
<h2>What the counts rest on</h2>
<ul>
<li>The export holds <strong>427 entries but 412 ids</strong>: 15 reports come twice (overlapping export pages).
One id, one report — <code>uniqueById</code> in <code>causes.ts</code>. The desk&rsquo;s &ldquo;412 reports&rdquo; is the
unique count; the raw export says 427.</li>
<li>Intake tags are guesses and disagree with the cause on <strong>38 reports</strong>: 23 <code>parser</code>
reports tagged <code>hint</code>, 15 <code>hint</code> reports tagged <code>parser</code>. Tag by tenant and channel
(<code>causeOf</code>), not by the reporter&rsquo;s browser.</li>
<li>5 reports (<code>desk-notes.json</code>, <code>oneDayMove</code>) read as a one-day move, not a month flip.
Counted under <code>parser</code> where they are filed, footnoted there by the desk.</li>
</ul>
<h2>Lessons</h2>
<ul>
<li>Merging on subject (decision 0001) put two bugs in one ticket. The body and the tenant say what the subject does not.</li>
<li>A big ticket is not one bug. Run the logic before writing &ldquo;one issue, one fix queued&rdquo;.</li>
</ul>
<p class="stamp">desk ref <b>${ref}</b></p>`;


const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${TITLE} · support kb</title>
<style>
:root {
  --bg: #fbfaf7; --fg: #1d1d1b; --muted: #6b6a66; --line: #e3e0d8;
  --accent: #2f6f5e; --warn: #b4501f; --warn-bg: #fbeee6; --note-bg: #eef5f2;
  --mono: ui-monospace, 'Cascadia Code', Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #171716; --fg: #ecebe6; --muted: #9c9a93; --line: #34332f;
    --accent: #6fbfa6; --warn: #f0905d; --warn-bg: #3a2418; --note-bg: #1d2c27; }
}
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 system-ui, sans-serif; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.92rem; }
th, td { border-bottom: 1px solid var(--line); padding: 0.35rem 0.5rem; text-align: left; }
code { font-family: var(--mono); font-size: 0.88em; }
a { color: var(--accent); }
.kb { max-width: 760px; margin: 0 auto; padding: 2rem 16px 4rem; }
.crumb { font: 0.8rem var(--mono); text-decoration: none; color: var(--muted); }
h1 { margin: 0.25rem 0 0.5rem; line-height: 1.2; }
.meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; color: var(--muted); font-size: 0.85rem; margin: 0; }
.status { border: 1px solid var(--line); border-radius: 99px; padding: 0 0.6rem; }
.stale { color: var(--warn); font-weight: 600; }
.banner { background: var(--warn-bg); color: var(--warn); padding: 0.6rem 1rem; border-radius: 6px; }
footer { margin-top: 3rem; color: var(--muted); font-size: 0.8rem; border-top: 1px solid var(--line); padding-top: 1rem; }
aside { border-left: 4px solid var(--accent); padding: 0.5rem 1rem; margin: 1rem 0; background: var(--note-bg); }
aside.warn { border-color: var(--warn); background: var(--warn-bg); }
.sum { font-size: 1.1rem; }
.tags { color: var(--muted); font-size: 0.85em; }
.note { color: var(--muted); font-size: 0.85em; }
.wrong td { background: var(--warn-bg); }
.wrong td:last-child { color: var(--warn); font-weight: 600; }
svg { width: 100%; max-width: 640px; }
.in { fill: var(--warn); }
.merged { fill: var(--accent); }
text { font: 8px var(--mono); fill: var(--muted); text-anchor: middle; }
figcaption { color: var(--muted); font-size: 0.85rem; }
.key { display: inline-block; width: 0.7em; height: 0.7em; border-radius: 2px; }
.key.in { background: var(--warn); }
.key.merged { background: var(--accent); }
.stamp { margin: 2rem 0 0; font: 0.85rem var(--mono); color: var(--muted); }
.stamp b { color: var(--accent); letter-spacing: 0.04em; }
</style>
</head>
<body>
<div class="kb">
  <header>
    <a class="crumb" href="/kb">support desk · kb</a>
    <h1>${TITLE}</h1>
    <p class="meta">
      <span>owner <b>${OWNER}</b></span>
      <span class="status ${STATUS}">${STATUS}</span>
      <span${stale ? ' class="stale"' : ''}>reviewed ${REVIEWED} · ${age} days ago${stale ? ' · stale' : ''}</span>
    </p>
  </header>
  ${stale ? `<p class="banner">Nobody has re-read this page in ${age} days. Check it against the live views before you rely on it.</p>` : ''}
  <main>${body}</main>
  <footer>Pages are written by people. Tables and charts are built from data at render time.</footer>
</div>
</body>
</html>`;

mkdirSync(repo + '/page', { recursive: true });
writeFileSync(repo + '/page/4471-split.html', html);
console.log('wrote repo/page/4471-split.html');

