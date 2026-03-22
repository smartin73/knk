// Import historical income from a FileMaker CSV export into income_entries.
// Usage (run from server/ directory):
//   node scripts/import-income.js fm_income.csv
//   node scripts/import-income.js fm_income.csv --dry-run
//
// CSV columns expected: Account, Category, Income, Date, Description

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import pool, { query } from '../src/db/pool.js';

// ── Args ──────────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2).filter(a => a !== '--dry-run');
const dryRun  = process.argv.includes('--dry-run');
const filePath = args[0];

if (!filePath) {
  console.error('Usage: node scripts/import-income.js fm_income.csv [--dry-run]');
  process.exit(1);
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// MM/DD/YYYY → YYYY-MM-DD
function normalizeDate(raw) {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

// Strip $ signs, commas, and whitespace then parse float
function parseAmount(raw) {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : n;
}

// Returns true if description looks like a Square-imported sale (already in system)
function looksLikeSquareSale(description) {
  if (!description) return false;
  const d = description.toLowerCase();
  return d === 'square sale' || d.includes('square sale');
}

// ── Event matching ────────────────────────────────────────────────────────────

// Cache events to avoid repeated DB hits
let eventsCache = null;

async function loadEvents() {
  if (eventsCache) return eventsCache;
  const { rows } = await query(`SELECT id, event_name, event_date::text AS event_date FROM events`);
  eventsCache = rows;
  return rows;
}

async function findEventId(date, description) {
  const events = await loadEvents();

  // 1. Match by exact date — if exactly one event on that day, use it
  const byDate = events.filter(e => e.event_date === date);
  if (byDate.length === 1) return { id: byDate[0].id, how: 'date' };

  // 2. If multiple on same date, try to narrow by name match in description
  if (byDate.length > 1 && description) {
    const desc = description.toLowerCase();
    const nameMatches = byDate.filter(e =>
      e.event_name.toLowerCase().split(/\s+/).some(word =>
        word.length >= 4 && desc.includes(word)
      )
    );
    if (nameMatches.length === 1) return { id: nameMatches[0].id, how: 'date+name' };
  }

  // 3. No date match — try ILIKE on description keywords against all events
  if (description) {
    const words = description.split(/\s+/).filter(w => w.length >= 5);
    for (const word of words) {
      const matches = events.filter(e =>
        e.event_name.toLowerCase().includes(word.toLowerCase())
      );
      if (matches.length === 1) return { id: matches[0].id, how: `name:"${word}"` };
    }
  }

  return { id: null, how: null };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (dryRun) console.log('── DRY RUN — no changes will be written ──\n');

  let raw;
  try {
    raw = readFileSync(resolve(filePath), 'utf8');
  } catch (e) {
    console.error('Could not read file:', e.message);
    process.exit(1);
  }

  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    console.error('CSV appears empty or has no data rows.');
    process.exit(1);
  }

  // Parse headers, strip BOM
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').trim());

  function col(row, name) {
    const idx = headers.indexOf(name);
    return idx !== -1 ? (row[idx] || '').trim() : '';
  }

  // Tracking
  let totalProcessed = 0;
  let inserted       = 0;
  const skipped      = [];   // { row, reason }
  const noEventMatch = [];   // { date, description, amount }
  const eventMatched = [];   // { date, description, eventName, how }

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 2) continue;

    totalProcessed++;

    const account     = col(row, 'Account');
    const description = col(row, 'Description');
    const rawDate     = col(row, 'Date');
    const rawAmount   = col(row, 'Income');

    const date   = normalizeDate(rawDate);
    const amount = parseAmount(rawAmount);

    // ── Skip conditions ───────────────────────────────────────────────────────

    if (!amount || amount === 0) {
      skipped.push({ line: i + 1, description, reason: 'amount is 0 or missing' });
      continue;
    }

    if (!date) {
      skipped.push({ line: i + 1, description, reason: `unparseable date: "${rawDate}"` });
      continue;
    }

    if (looksLikeSquareSale(description)) {
      skipped.push({ line: i + 1, description, reason: 'looks like Square sale — already imported' });
      continue;
    }

    // ── Event matching ────────────────────────────────────────────────────────

    const { id: eventId, how } = await findEventId(date, description);

    if (eventId) {
      const eventsLocal = await loadEvents();
      const ev = eventsLocal.find(e => e.id === eventId);
      eventMatched.push({ date, description, amount, eventName: ev?.event_name, how });
    } else {
      noEventMatch.push({ date, description, amount });
    }

    // ── Insert ────────────────────────────────────────────────────────────────

    if (!dryRun) {
      await query(
        `INSERT INTO income_entries (source, amount, date, event_id, description, notes)
         VALUES ('manual', $1, $2, $3, $4, $5)`,
        [amount, date, eventId, description || null, account || null]
      );
    }

    inserted++;
  }

  // ── Report ────────────────────────────────────────────────────────────────

  console.log('\n── Results ──────────────────────────────────────────────────────');
  console.log(`Total rows processed:  ${totalProcessed}`);
  console.log(`Inserted:              ${inserted}${dryRun ? ' (dry run — not written)' : ''}`);
  console.log(`Skipped:               ${skipped.length}`);
  console.log(`Matched to event:      ${eventMatched.length}`);
  console.log(`No event match:        ${noEventMatch.length}`);

  if (skipped.length > 0) {
    console.log('\n── Skipped ──────────────────────────────────────────────────────');
    for (const s of skipped) {
      console.log(`  Line ${String(s.line).padStart(3)}  "${s.description}"  → ${s.reason}`);
    }
  }

  if (eventMatched.length > 0) {
    console.log('\n── Matched to event ─────────────────────────────────────────────');
    for (const r of eventMatched) {
      console.log(`  ${r.date}  $${Number(r.amount).toFixed(2).padStart(8)}  "${r.description}"  → "${r.eventName}"  [${r.how}]`);
    }
  }

  if (noEventMatch.length > 0) {
    console.log('\n── No event match (review manually) ─────────────────────────────');
    for (const r of noEventMatch) {
      console.log(`  ${r.date}  $${Number(r.amount).toFixed(2).padStart(8)}  "${r.description}"`);
    }
  }

  console.log('─────────────────────────────────────────────────────────────────\n');

  await pool.end();
}

main().catch(e => {
  console.error('Fatal error:', e);
  pool.end();
  process.exit(1);
});
