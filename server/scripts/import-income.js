// Import historical income from a FileMaker CSV export into income_entries.
// Usage (run from server/ directory):
//   node scripts/import-income.js fm_income.csv
//   node scripts/import-income.js fm_income.csv --dry-run
//
// CSV columns expected: Account, Category, Income, Date, Description, isEvent, Source

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import pool, { query } from '../src/db/pool.js';

// ── Args ──────────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2).filter(a => a !== '--dry-run');
const dryRun   = process.argv.includes('--dry-run');
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

// Strip $, commas, whitespace then parse float
function parseAmount(raw) {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : n;
}

// ── Event lookup (cached) ─────────────────────────────────────────────────────

const eventByFmUuid = new Map();

async function loadEvents() {
  if (eventByFmUuid.size > 0) return;
  const { rows } = await query(
    `SELECT id, event_name, fm_uuid FROM events WHERE fm_uuid IS NOT NULL`
  );
  for (const r of rows) eventByFmUuid.set(r.fm_uuid.toLowerCase(), r);
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

  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').trim());

  function col(row, name) {
    const idx = headers.indexOf(name);
    return idx !== -1 ? (row[idx] || '').trim() : '';
  }

  await loadEvents();

  // Tracking
  let totalProcessed = 0;
  let inserted       = 0;
  const skipped      = [];   // { line, description, reason }
  let   eventMatched = 0;
  const unmatchedFmUuids = new Map(); // fm_uuid → { description, date }

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 2) continue;

    totalProcessed++;

    const account     = col(row, 'Account');
    const description = col(row, 'Description');
    const rawDate     = col(row, 'Date');
    const rawAmount   = col(row, 'Income');
    const isEvent     = col(row, 'isEvent');
    const source      = col(row, 'Source') || 'manual';

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

    // ── Event matching ────────────────────────────────────────────────────────

    let eventId = null;
    let fmUuid  = null;

    if (isEvent) {
      fmUuid = isEvent.toLowerCase();
      const ev = eventByFmUuid.get(fmUuid);
      if (ev) {
        eventId = ev.id;
        eventMatched++;
      } else {
        if (!unmatchedFmUuids.has(fmUuid)) {
          unmatchedFmUuids.set(fmUuid, { description, date });
        }
      }
    }

    // ── Insert ────────────────────────────────────────────────────────────────

    if (dryRun) {
      console.log(`  ${date}  $${Number(amount).toFixed(2).padStart(8)}  [${source}]  "${description}"${eventId ? `  → event ${eventByFmUuid.get(fmUuid)?.event_name}` : ''}`);
    } else {
      await query(
        `INSERT INTO income_entries (source, amount, date, event_id, description, account)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [source, amount, date, eventId, description || null, account || null]
      );
    }

    inserted++;
  }

  // ── Report ────────────────────────────────────────────────────────────────

  console.log('\n── Results ──────────────────────────────────────────────────────');
  console.log(`Total rows processed:  ${totalProcessed}`);
  console.log(`Inserted:              ${inserted}${dryRun ? ' (dry run — not written)' : ''}`);
  console.log(`Skipped:               ${skipped.length}`);
  console.log(`Matched to event:      ${eventMatched}`);
  console.log(`Unmatched isEvent:     ${unmatchedFmUuids.size}`);

  if (skipped.length > 0) {
    console.log('\n── Skipped ──────────────────────────────────────────────────────');
    for (const s of skipped) {
      console.log(`  Line ${String(s.line).padStart(3)}  "${s.description}"  → ${s.reason}`);
    }
  }

  if (unmatchedFmUuids.size > 0) {
    console.log('\n── Unmatched isEvent values (no knk event with this fm_uuid) ────');
    for (const [fmUuid, { description, date }] of unmatchedFmUuids) {
      console.log(`  ${date}  "${description}"  fm_uuid: ${fmUuid}`);
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
