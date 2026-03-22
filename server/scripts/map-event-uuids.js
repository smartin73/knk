// Populate fm_uuid on the events table by matching FileMaker events to knk events by date.
// Usage (run from server/ directory):
//   node scripts/map-event-uuids.js fm_events.csv
//   node scripts/map-event-uuids.js fm_events.csv --dry-run

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import pool, { query } from '../src/db/pool.js';

// ── Args ─────────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2).filter(a => a !== '--dry-run');
const dryRun  = process.argv.includes('--dry-run');
const filePath = args[0];

if (!filePath) {
  console.error('Usage: node scripts/map-event-uuids.js fm_events.csv [--dry-run]');
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

  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^\uFEFF/, '')); // strip BOM

  function col(row, name) {
    const idx = headers.indexOf(name);
    return idx !== -1 ? row[idx] : null;
  }

  const fmEvents = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 2) continue;
    fmEvents.push({
      fm_uuid:    col(row, 'event_pk_uuid'),
      rawDate:    col(row, 'eventDate'),
      eventName:  col(row, 'eventName'),
    });
  }

  console.log(`Loaded ${fmEvents.length} FM event(s) from ${filePath}\n`);

  // ── Process each FM event ─────────────────────────────────────────────────

  const noMatch        = [];
  const multipleMatch  = [];
  const alreadySet     = [];
  let   updated        = 0;

  for (const fm of fmEvents) {
    const { fm_uuid, rawDate, eventName } = fm;

    if (!fm_uuid) {
      console.warn(`  ⚠ Row has no event_pk_uuid — skipping: ${eventName}`);
      continue;
    }

    const date = normalizeDate(rawDate);
    if (!date) {
      console.warn(`  ⚠ Could not parse date "${rawDate}" for "${eventName}" — skipping`);
      continue;
    }

    // Find knk events on this date that don't already have fm_uuid set
    const { rows: candidates } = await query(
      `SELECT id, event_name, fm_uuid FROM events WHERE event_date = $1`,
      [date]
    );

    if (candidates.length === 0) {
      noMatch.push({ fm_uuid, date, eventName });
      continue;
    }

    if (candidates.length > 1) {
      multipleMatch.push({
        fm_uuid, date, eventName,
        matches: candidates.map(r => r.event_name),
      });
      continue;
    }

    const knk = candidates[0];

    if (knk.fm_uuid) {
      alreadySet.push({ fm_uuid, date, eventName, existing: knk.fm_uuid });
      continue;
    }

    // Single clean match — update
    if (!dryRun) {
      await query(
        `UPDATE events SET fm_uuid = $1 WHERE id = $2`,
        [fm_uuid, knk.id]
      );
    }

    console.log(`  ✓ ${date}  "${knk.event_name}"${dryRun ? '  [dry run]' : ''}`);
    updated++;
  }

  // ── Report ────────────────────────────────────────────────────────────────

  console.log('\n── Results ──────────────────────────────────────────────────────');
  console.log(`FM events processed:     ${fmEvents.length}`);
  console.log(`Matched and updated:     ${updated}${dryRun ? ' (dry run — not written)' : ''}`);
  console.log(`Already had fm_uuid:     ${alreadySet.length} (skipped)`);
  console.log(`No match:                ${noMatch.length}`);
  console.log(`Multiple matches:        ${multipleMatch.length}`);

  if (alreadySet.length > 0) {
    console.log('\n── Already set (skipped) ────────────────────────────────────────');
    for (const r of alreadySet) {
      console.log(`  ${r.date}  "${r.eventName}"  existing fm_uuid: ${r.existing}`);
    }
  }

  if (noMatch.length > 0) {
    console.log('\n── No match ─────────────────────────────────────────────────────');
    for (const r of noMatch) {
      console.log(`  ${r.date}  "${r.eventName}"  fm_uuid: ${r.fm_uuid}`);
    }
  }

  if (multipleMatch.length > 0) {
    console.log('\n── Multiple matches ─────────────────────────────────────────────');
    for (const r of multipleMatch) {
      console.log(`  ${r.date}  "${r.eventName}"  fm_uuid: ${r.fm_uuid}`);
      for (const name of r.matches) {
        console.log(`    → "${name}"`);
      }
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
