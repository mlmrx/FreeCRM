# CSV onboarding

FREE CRM imports contacts, companies, and leads without sending the file to a third-party processor. The request is parsed inside the authenticated deployment and committed to the caller's resolved workspace. Request data cannot select a workspace.

## Safe workflow

1. Send the CSV as `mode: "preview"` and inspect every reported row error.
2. Correct the source file or provide an explicit header mapping.
3. Send the identical data as `mode: "commit"` with a new, stable `Idempotency-Key` header.
4. Refresh the workspace only after the commit response identifies the imported record IDs.

A commit is all-or-nothing. It will not silently discard invalid rows, cross a profile capability boundary, exceed a workspace limit, or create a second copy when the same idempotency key and request are retried. Use a new key for changed content.

## Download a template

In **Integrations → Import CRM records**, download the Contacts, Companies, or
Leads template. These UTF-8 CSV files contain two fictional rows, not workspace
data. Replace those rows and choose the same record type in the importer.
Downloading a template and running a preview do not create records.

The same public, read-only downloads are available on your own installation:

- `/templates/import/freecrm-contacts-template.csv`
- `/templates/import/freecrm-companies-template.csv`
- `/templates/import/freecrm-leads-template.csv`

Responses use `text/csv; charset=utf-8` and an attachment filename. The fixed
examples have no formulas, macros, external URLs, credentials, or real people.
Example email addresses use the reserved `.test` domain. Keep phone columns as
text when editing in a spreadsheet so leading zeroes are not lost.

Each template contains every canonical field exactly once:

| Field | Required? | Meaning |
| --- | --- | --- |
| `name` | A name is required | Full person or record name. Contacts and leads may instead use `firstName` and/or `lastName`. |
| `firstName` | Optional | Used to construct a person name when `name` is empty. Leave blank for companies. |
| `lastName` | Optional | Used with `firstName` when `name` is empty. Leave blank for companies. |
| `email` | Optional | An email address; fictional examples must be replaced before real use. |
| `phone` | Optional | Phone text; keep formatting in your source file. |
| `companyName` | Optional for people | Company or organization name. Company auto-detection prefers this column over `name`; the company template keeps both identical. Remove this column or explicitly map `name` if you only want to use the record-name column. |
| `status` | Optional | A status accepted for that record type; templates use `active` for contacts, `prospect` for companies, and `new` for leads. Preview validates it. |
| `source` | Optional | Where the record came from. Blank values use `CSV import`. |
| `tags` | Optional | Labels separated by semicolons or pipes within one cell. |

Delete unused optional columns or leave their values empty. Do not duplicate
headers. The templates do not change parser behavior, link existing companies,
convert leads, or bypass validation. This page is the shared field and API
reference; the template generator is `lib/csv-import-templates.ts`.

## Request

```http
POST /api/v1/imports/csv
Content-Type: application/json
Idempotency-Key: 6cd44b58-61fd-46bc-9cf0-54f5961a5230

{
  "mode": "preview",
  "objectType": "contact",
  "csv": "Full Name,Email,Company,Tags\nAda Lovelace,ada@example.com,Analytical Engines,founder;vip"
}
```

Supported object types are `contact`, `company`, and `lead`. Common headings such as `Full Name`, `First Name`, `Email Address`, `Phone Number`, `Company`, `Stage`, `Source`, and `Tags` are inferred case-insensitively. Tags inside one cell may be separated with semicolons or pipes. Non-empty columns that are not mapped become custom fields.

For unusual headings, map fields explicitly:

```json
{
  "mode": "preview",
  "objectType": "lead",
  "csv": "Given,Family,Work mail\nKatherine,Johnson,katherine@example.com",
  "mapping": {
    "firstName": "Given",
    "lastName": "Family",
    "email": "Work mail"
  }
}
```

The supported mapping keys are `name`, `firstName`, `lastName`, `email`, `phone`, `companyName`, `status`, `source`, and `tags`.

## Limits and privacy

- 40 data rows, 64 columns, 256,000 encoded bytes, and 4,096 characters per cell per request.
- Preview and commit responses use `Cache-Control: no-store`.
- The audit event records the import count, not the CSV payload or contact details.
- The idempotency ledger stores a SHA-256 request hash and the bounded commit receipt, not the source CSV.
- CSV files can contain personal information. Keep the source file protected and delete unnecessary copies after confirming the import and a recovery backup.
