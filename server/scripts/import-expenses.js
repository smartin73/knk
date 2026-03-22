// Import historical expenses from a FileMaker CSV export into expense_entries.
// Usage (run from server/ directory):
//   node scripts/import-expenses.js fm_expenses.csv
//   node scripts/import-expenses.js fm_expenses.csv --dry-run
//
// CSV columns expected: Account, Category, Expense, Date, Description

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import pool, { query } from '../src/db/pool.js';

// ── Args ──────────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2).filter(a => a !== '--dry-run');
const dryRun   = process.argv.includes('--dry-run');
const filePath = args[0];

if (!filePath) {
  console.error('Usage: node scripts/import-expenses.js fm_expenses.csv [--dry-run]');
  process.exit(1);
}

// ── Category mapping ──────────────────────────────────────────────────────────

const CATEGORY_MAP = {
  'Ingredients':         'Ingredients',
  'Recipe Development':  'Supplies',
  'Kitchen':             'Equipment',
  'Packaging':           'Packaging',
  'Licensing':           'Fees',
  'Dining':              'Other',
  'Retail':              'Supplies',
  'Shipping':            'Other',
  'Website':             'Marketing',
  'Insurance':           'Fees',
  'Credit Cards':        'Fees',
};

function mapCategory(raw) {
  if (!raw) return { category: 'Other', unmapped: true };
  const mapped = CATEGORY_MAP[raw.trim()];
  if (mapped) return { category: mapped, unmapped: false };
  return { category: 'Other', unmapped: true };
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

  // Tracking
  let totalProcessed = 0;
  let inserted       = 0;
  const skipped      = [];   // { line, description, reason }
  const unmapped     = [];   // { line, fmCategory, description }

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 2) continue;

    totalProcessed++;

    const account     = col(row, 'Account');
    const fmCategory  = col(row, 'Category');
    const description = col(row, 'Description');
    const rawDate     = col(row, 'Date');
    const rawAmount   = col(row, 'Expense');

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

    // ── Category mapping ──────────────────────────────────────────────────────

    const { category, unmapped: isUnmapped } = mapCategory(fmCategory);
    if (isUnmapped) {
      unmapped.push({ line: i + 1, fmCategory: fmCategory || '(empty)', description });
    }

    // ── Insert ────────────────────────────────────────────────────────────────

    if (dryRun) {
      console.log(`  ${date}  $${Number(amount).toFixed(2).padStart(8)}  [${category}${isUnmapped ? ` ← "${fmCategory}"` : ''}]  "${description}"`);
    } else {
      await query(
        `INSERT INTO expense_entries (category, amount, date, description, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [category, amount, date, description || null, account || null]
      );
    }

    inserted++;
  }

  // ── Report ────────────────────────────────────────────────────────────────

  console.log('\n── Results ──────────────────────────────────────────────────────');
  console.log(`Total rows processed:  ${totalProcessed}`);
  console.log(`Inserted:              ${inserted}${dryRun ? ' (dry run — not written)' : ''}`);
  console.log(`Skipped:               ${skipped.length}`);
  console.log(`Unmapped categories:   ${unmapped.length}`);

  if (skipped.length > 0) {
    console.log('\n── Skipped ──────────────────────────────────────────────────────');
    for (const s of skipped) {
      console.log(`  Line ${String(s.line).padStart(3)}  "${s.description}"  → ${s.reason}`);
    }
  }

  if (unmapped.length > 0) {
    console.log('\n── Unmapped categories (mapped to "Other") ──────────────────────');
    for (const u of unmapped) {
      console.log(`  Line ${String(u.line).padStart(3)}  FM category: "${u.fmCategory}"  "${u.description}"`);
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
