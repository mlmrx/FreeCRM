# CSV onboarding

FREE CRM imports contacts, companies, and leads without sending the file to a third-party processor. The request is parsed inside the authenticated deployment and committed to the caller's resolved workspace. Request data cannot select a workspace.

## Safe workflow

1. Send the CSV as `mode: "preview"` and inspect every reported row error.
2. Correct the source file or provide an explicit header mapping.
3. Send the identical data as `mode: "commit"` with a new, stable `Idempotency-Key` header.
4. Refresh the workspace only after the commit response identifies the imported record IDs.

A commit is all-or-nothing. It will not silently discard invalid rows, cross a profile capability boundary, exceed a workspace limit, or create a second copy when the same idempotency key and request are retried. Use a new key for changed content.

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
