# Expense Receipt Import — Feature Spec

## Overview

Add receipt/invoice import capability to the knk Expenses module. Supports three import flows: single receipt (photo or PDF), PDF invoice (vendor/supplier), and Amazon Business CSV bulk import. All flows feed into the existing expenses table.

---

## Schema Changes

Add one column to the expenses table:

```sql
ALTER TABLE expenses ADD COLUMN receipt_url TEXT;
```

Stores the Cloudinary URL of the uploaded receipt image or PDF for audit/IRS documentation purposes.

---

## IRS-Required Fields

The following fields must be captured per expense (already in schema, confirmed for IRS compliance):

- `vendor` — name of the store or supplier
- `date` — date of purchase
- `amount` — total amount
- `category` — expense category (e.g. Food & Supplies, Equipment, etc.)
- `description` — brief note to accountant (manually entered, not parsed)
- `receipt_url` — stored receipt image/PDF (Cloudinary)

---

## Import Flow 1: Single Receipt (Photo or PDF)

### Use Cases
- Phone photo of thermal receipt (Aldi, Restaurant Depot, BJ's, Walmart)
- Downloaded PDF receipt (BJ's account, Walmart Business, vendor invoices)
- Long receipts (foot-long thermal rolls) — support multi-photo upload

### UI (React — Expense Form)

Add a receipt drop zone at the top of the new expense form:

- Drag-and-drop area OR click to open file picker
- On mobile: use `<input type="file" accept="image/*,application/pdf" capture="environment">` to open rear camera directly
- Supported types: JPEG, PNG, HEIC, PDF
- Multi-file upload supported (for long receipts spanning multiple photos)
- On upload, show a loading spinner while OCR runs
- On success, pre-populate form fields below (user reviews before saving)
- Show receipt thumbnail/filename alongside the form for reference

**UI hint for long receipts:** Display a small tip — *"Long receipt? A PDF or emailed receipt will give better results."*

### Backend Route

```
POST /api/expenses/parse-receipt
Content-Type: multipart/form-data
Body: { files: File[] }
```

**Processing logic:**

1. Detect file type per upload (image vs PDF)
2. Upload file(s) to Cloudinary, store URL(s)
3. Convert file(s) to base64
4. Build Anthropic API message:
   - Images → `image` blocks (type: `image/jpeg` or `image/png`)
   - PDFs → `document` blocks (type: `application/pdf`)
   - Multiple files → multiple blocks in one message
5. Send to Anthropic API with structured extraction prompt (see Prompt section)
6. Parse JSON response
7. Return `{ parsed, receipt_url }` to frontend

**Response shape:**

```json
{
  "parsed": {
    "vendor": "Restaurant Depot",
    "date": "2025-03-15",
    "amount": 284.57,
    "category": "Food & Supplies",
    "line_items": []
  },
  "receipt_url": "https://res.cloudinary.com/..."
}
```

### Anthropic API Prompt

```
You are parsing a receipt or invoice for expense tracking. 
Extract the following fields and return ONLY valid JSON, no markdown, no preamble:

{
  "vendor": "store or supplier name",
  "date": "YYYY-MM-DD format",
  "amount": total amount as a number,
  "category": one of ["Food & Supplies", "Equipment", "Travel", "Utilities", "Other"],
  "line_items": [] 
}

If a field cannot be determined, use null.
Focus on: vendor name, purchase date, and total amount. 
These are the most important fields for IRS documentation.
```

**Model:** `claude-haiku-4-5-20251001` (sufficient for receipt parsing, lowest cost)  
**Estimated cost:** ~$0.01–0.02 per receipt  
**Estimated monthly cost at <20 receipts:** ~$0.10–0.40

---

## Import Flow 2: Amazon Business CSV Bulk Import

### Use Cases
- Monthly Amazon Business order history export
- Bulk import multiple orders at once instead of one-by-one

### How to Export from Amazon Business
1. Log in to Amazon Business
2. Go to **Orders** → **Order History Reports**
3. Select date range, download CSV

### UI (React — Expenses List Page)

Add an **"Import Amazon CSV"** button on the expenses list/index page (separate from the single receipt flow).

On click:
1. File picker opens (CSV only)
2. Upload CSV to server
3. Server parses and returns a **preview table** showing all rows
4. User can uncheck rows to exclude (duplicates, personal orders, etc.)
5. **Confirm Import** button saves all checked rows as expenses in bulk

### Backend Route

```
POST /api/expenses/import-amazon-csv
Content-Type: multipart/form-data
Body: { file: File }
```

**Processing logic:**

1. Parse CSV (no AI needed — Amazon CSV is already structured)
2. Map Amazon columns to expense schema:

| Amazon Column | Expense Field |
|---|---|
| Order Date | date |
| Seller | vendor |
| Item Total | amount |
| — | category = "Equipment" (default, user can edit) |
| Title / Items | description (truncated) |

3. Return preview array to frontend
4. On confirm, bulk insert all selected rows

**Note:** No Cloudinary upload for CSV imports — no receipt image is associated. `receipt_url` will be null.

---

## Import Flow 3: PDF Invoice (Vendor/Supplier)

Same as Flow 1 (single receipt) — handled by the same `/api/expenses/parse-receipt` endpoint.

PDF invoices from vendors typically have cleaner machine-readable text than photos, so parse accuracy will be higher and token usage lower.

---

## Category Auto-Suggestion

After parsing, auto-suggest category based on known vendors:

```javascript
const VENDOR_CATEGORIES = {
  'restaurant depot': 'Food & Supplies',
  'bj\'s': 'Food & Supplies',
  'walmart': 'Food & Supplies',
  'aldi': 'Food & Supplies',
  'amazon': 'Equipment',
};

function suggestCategory(vendor) {
  if (!vendor) return 'Other';
  const key = vendor.toLowerCase();
  for (const [name, cat] of Object.entries(VENDOR_CATEGORIES)) {
    if (key.includes(name)) return cat;
  }
  return 'Other';
}
```

User can always override the suggested category before saving.

---

## Description Field

**Not parsed from receipt.** Always manually entered by the user.

This is intentional — the description is business context ("supplies for March catering event") that the receipt itself cannot provide. The form should make this field prominent and required before saving.

Suggested placeholder: *"Brief note for accountant (required)"*

---

## Cloudinary Storage

- Upload receipt on parse (before user confirms save)
- If user cancels the expense form, the Cloudinary asset remains (acceptable — low volume)
- Store URL in `receipt_url` column on expense save
- Display thumbnail in expense detail/edit view for reference

Use existing Cloudinary integration patterns from the codebase (see other modules using Cloudinary).

---

## File: New Backend Routes

Model after existing routes (e.g. `square.js`):

- `routes/expenses-import.js` — contains both `/parse-receipt` and `/import-amazon-csv`
- Register in `server.js` or wherever routes are mounted

---

## Notes & Gotchas

- **HEIC files** (iOS default photo format): May need server-side conversion before sending to Anthropic API. Use `sharp` npm package: `sharp(heicBuffer).jpeg().toBuffer()`. Check if this is needed based on real-world uploads.
- **Multi-photo receipts**: Send all images as multiple blocks in a single Anthropic API call — do not make separate calls per image.
- **PDF size**: Anthropic API accepts PDFs natively. No pre-processing needed for standard invoice PDFs.
- **Amazon CSV column names**: May vary slightly by export format/region. Add defensive column mapping with fallbacks.
- **Duplicate prevention**: For Amazon CSV import, consider checking `date + amount + vendor` before inserting to avoid re-importing the same orders.
