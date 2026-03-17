import { Router } from 'express';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';
import nodemailer from 'nodemailer';
import { query } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FORMS_DIR = path.join(__dirname, '..', '..', 'tax-forms');

const router = Router();
router.use(requireAuth, requireAdmin);

// ── Helpers ───────────────────────────────────────────────

async function getSettings() {
  const { rows } = await query(
    `SELECT key, value FROM settings WHERE key IN (
      'smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','smtp_to',
      'tax_business_name','tax_address','tax_city_state_zip',
      'tax_ein','tax_ri_account','tax_owner_title'
    )`
  );
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return map;
}

async function getGrossSales(month) {
  const [year, mon] = month.split('-');
  const start = `${year}-${mon}-01`;
  const lastDay = new Date(year, parseInt(mon, 10), 0);
  const end = lastDay.toISOString().split('T')[0];
  const { rows } = await query(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total
     FROM income_entries WHERE date >= $1 AND date <= $2`,
    [start, end]
  );
  return parseFloat(rows[0].total);
}

function setField(form, name, value) {
  try { form.getTextField(name).setText(String(value)); } catch {}
}

async function buildSTR(grossSales, month, settings) {
  const pdfBytes = await readFile(path.join(FORMS_DIR, 'str.pdf'));
  const pdfDoc  = await PDFDocument.load(pdfBytes);
  const form    = pdfDoc.getForm();

  const [year, mon] = month.split('-');
  const last = new Date(year, parseInt(mon, 10), 0);
  const periodEnd = `${String(last.getMonth() + 1).padStart(2, '0')}/${String(last.getDate()).padStart(2, '0')}/${last.getFullYear()}`;
  const amt = grossSales.toFixed(2);

  setField(form, 'GrossSales[0]',        amt);
  setField(form, 'GrossSales-00',         amt);
  setField(form, 'Exempt[0]',             amt);
  setField(form, 'Exempt-00',             amt);
  setField(form, 'TotalDeductions[0]',    amt);
  setField(form, 'TotalDeductions-00',    amt);
  setField(form, 'TaxableSales[0]',       '0.00');
  setField(form, 'TaxableSales-00',       '0.00');
  setField(form, 'Due[0]',               '0.00');
  setField(form, 'Due-00',               '0.00');
  setField(form, 'PeriodEnd[0]',          periodEnd);
  setField(form, 'AccountID[0]',          settings.tax_ri_account || '');

  try { form.flatten(); } catch {}
  return pdfDoc.save();
}

async function buildMTM(grossSales, month, settings) {
  const pdfBytes = await readFile(path.join(FORMS_DIR, 'mtm.pdf'));
  const pdfDoc  = await PDFDocument.load(pdfBytes);
  const form    = pdfDoc.getForm();

  const [year, mon] = month.split('-');
  const monthName = new Date(year, parseInt(mon, 10) - 1, 1)
    .toLocaleString('en-US', { month: 'long' });
  const period = `${monthName} ${year}`;
  const today  = new Date().toLocaleDateString('en-US');

  setField(form, 'Name[0]',           settings.tax_business_name || '');
  setField(form, 'Address[0]',        settings.tax_address || '');
  setField(form, 'CityStateZIP[0]',   settings.tax_city_state_zip || '');
  setField(form, 'FedID[0]',          settings.tax_ein || '');
  setField(form, 'Period[0]',         period);
  setField(form, 'AmountDue[0]',      '0');
  setField(form, 'AmountDueCents[0]', '00');
  setField(form, 'Title[0]',          settings.tax_owner_title || 'Owner');
  setField(form, 'SignatureDate[0]',  today);

  try { form.flatten(); } catch {}
  return pdfDoc.save();
}

// ── Shared send logic (also used by cron) ────────────────

export async function sendTaxForms(month) {
  const [settings, grossSales] = await Promise.all([getSettings(), getGrossSales(month)]);
  if (!settings.smtp_host || !settings.smtp_to) {
    throw new Error('SMTP settings not configured. Set smtp_host and smtp_to in Settings.');
  }

  const [strBytes, mtmBytes] = await Promise.all([
    buildSTR(grossSales, month, settings),
    buildMTM(grossSales, month, settings),
  ]);

  const [year, mon] = month.split('-');
  const monthLabel = new Date(year, parseInt(mon, 10) - 1, 1)
    .toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const transporter = nodemailer.createTransport({
    host:   settings.smtp_host,
    port:   parseInt(settings.smtp_port || '587', 10),
    secure: parseInt(settings.smtp_port || '587', 10) === 465,
    auth: { user: settings.smtp_user, pass: settings.smtp_pass },
  });

  await transporter.sendMail({
    from:    settings.smtp_from || settings.smtp_user,
    to:      settings.smtp_to,
    subject: `RI Tax Forms — ${monthLabel}`,
    text:    `RI T-204 (STR) and T-204M (MTM) for ${monthLabel}.\n\nGross Sales: $${grossSales.toFixed(2)}\nTax Due: $0.00 (baked goods exempt)`,
    attachments: [
      { filename: `RI-STR-${month}.pdf`, content: Buffer.from(strBytes), contentType: 'application/pdf' },
      { filename: `RI-MTM-${month}.pdf`, content: Buffer.from(mtmBytes), contentType: 'application/pdf' },
    ],
  });

  return { month, gross_sales: grossSales };
}

// ── Routes ────────────────────────────────────────────────

// GET /tax/preview?month=YYYY-MM
router.get('/preview', async (req, res) => {
  try {
    const month = req.query.month || priorMonth();
    const [settings, grossSales] = await Promise.all([getSettings(), getGrossSales(month)]);
    const [strBytes, mtmBytes] = await Promise.all([
      buildSTR(grossSales, month, settings),
      buildMTM(grossSales, month, settings),
    ]);
    res.json({
      month,
      gross_sales: grossSales,
      str_pdf: Buffer.from(strBytes).toString('base64'),
      mtm_pdf: Buffer.from(mtmBytes).toString('base64'),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

// POST /tax/send  body: { month: 'YYYY-MM' }
router.post('/send', async (req, res) => {
  try {
    const month = req.body.month || req.query.month;
    if (!month) return res.status(400).json({ error: 'month required' });
    const result = await sendTaxForms(month);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

function priorMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default router;
