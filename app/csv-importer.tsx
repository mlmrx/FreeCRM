'use client';

import { type ChangeEvent, type FormEvent, useMemo, useRef, useState } from 'react';
import {
  commitCsvImport,
  csvHeaderColumns,
  csvImportPayload,
  CsvImportRequestError,
  previewCsvImport,
  type CsvImportField,
  type CsvImportMapping,
  type CsvImportObjectType,
  type CsvImportPreview,
  type CsvImportReceipt,
  type CsvImportRowError,
} from '@/lib/csv-import-client';

const maximumCsvBytes = 256_000;

const mappingFields: Array<{ key: CsvImportField; label: string }> = [
  { key: 'name', label: 'Full or record name' },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'companyName', label: 'Company' },
  { key: 'status', label: 'Status' },
  { key: 'source', label: 'Source' },
  { key: 'tags', label: 'Tags' },
];

type CsvImporterProps = {
  refresh: () => Promise<unknown>;
  notify: (message: string, tone?: 'success' | 'error') => void;
};

function displayValue(value: string | null) {
  return value || '—';
}

function ImportErrors({ errors }: { errors: CsvImportRowError[] }) {
  if (!errors.length) return null;
  return <section className="csv-import-errors" aria-labelledby="csv-errors-title" role="alert">
    <h3 id="csv-errors-title">Fix {errors.length} row {errors.length === 1 ? 'error' : 'errors'} before import</h3>
    <ol>{errors.map((error, index) => <li key={`${error.row}-${error.code}-${index}`}><strong>Row {error.row}{error.field ? ` · ${error.field}` : ''}</strong><span>{error.message}</span></li>)}</ol>
  </section>;
}

function ImportPreview({ preview }: { preview: CsvImportPreview }) {
  return <section className="csv-import-preview" aria-labelledby="csv-preview-title">
    <div className="csv-preview-head">
      <div><p className="eyebrow">VALIDATION RESULT</p><h3 id="csv-preview-title">Review before anything is written</h3></div>
      <span className={preview.invalidRows ? 'csv-preview-state invalid' : 'csv-preview-state'}>{preview.invalidRows ? 'Needs attention' : 'Ready to import'}</span>
    </div>
    <div className="csv-preview-counts" aria-label="CSV preview counts">
      <span><strong>{preview.totalRows}</strong>Total rows</span>
      <span><strong>{preview.validRows}</strong>Valid rows</span>
      <span><strong>{preview.invalidRows}</strong>Invalid rows</span>
    </div>
    <div className="csv-inferred-mapping">
      <strong>Resolved mapping</strong>
      <p>{Object.entries(preview.mapping).map(([field, header]) => `${field} ← ${header}`).join(' · ') || 'No fields were resolved.'}</p>
    </div>
    {preview.preview.length > 0 && <div className="csv-preview-table" role="region" aria-label="First valid CSV rows. Scroll horizontally for every field." tabIndex={0}>
      <table>
        <caption>First {preview.preview.length} valid {preview.objectType} {preview.preview.length === 1 ? 'row' : 'rows'}</caption>
        <thead><tr><th scope="col">CSV row</th><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Phone</th><th scope="col">Company</th><th scope="col">Status</th></tr></thead>
        <tbody>{preview.preview.map((row) => <tr key={row.row}><th scope="row">{row.row}</th><td>{row.name}</td><td>{displayValue(row.email)}</td><td>{displayValue(row.phone)}</td><td>{displayValue(row.companyName)}</td><td>{displayValue(row.status)}</td></tr>)}</tbody>
      </table>
    </div>}
    <ImportErrors errors={preview.errors} />
  </section>;
}

export default function CsvImporter({ refresh, notify }: CsvImporterProps) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [objectType, setObjectType] = useState<CsvImportObjectType>('contact');
  const [mapping, setMapping] = useState<CsvImportMapping>({});
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [previewSignature, setPreviewSignature] = useState('');
  const [receipt, setReceipt] = useState<CsvImportReceipt | null>(null);
  const [refreshWarning, setRefreshWarning] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [requestRowErrors, setRequestRowErrors] = useState<CsvImportRowError[]>([]);
  const [busy, setBusy] = useState<'file' | 'preview' | 'commit' | 'refresh' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const columns = useMemo(() => preview?.columns ?? csvHeaderColumns(csv), [csv, preview]);
  const currentSignature = useMemo(() => JSON.stringify(csvImportPayload('preview', csv, objectType, mapping)), [csv, objectType, mapping]);
  const previewIsCurrent = Boolean(preview && previewSignature === currentSignature);

  const resetValidation = (clearMapping = false) => {
    setPreview(null);
    setPreviewSignature('');
    setReceipt(null);
    setRefreshWarning(false);
    setRequestError('');
    setRequestRowErrors([]);
    if (clearMapping) setMapping({});
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    resetValidation(true);
    setBusy('file');
    try {
      if (file.size > maximumCsvBytes) throw new Error('That file exceeds the 256,000-byte import limit. Split it into smaller batches.');
      setCsv(await file.text());
      setFileName(file.name);
    } catch (error) {
      setCsv('');
      setFileName('');
      setRequestError(error instanceof Error ? error.message : 'That CSV file could not be read.');
    } finally {
      setBusy(null);
    }
  };

  const updateMapping = (field: CsvImportField, header: string) => {
    setMapping((current) => {
      const next = { ...current };
      if (header) next[field] = header;
      else delete next[field];
      return next;
    });
    setPreview(null);
    setPreviewSignature('');
    setReceipt(null);
    setRefreshWarning(false);
    setRequestError('');
    setRequestRowErrors([]);
  };

  const runPreview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRequestError('');
    setRequestRowErrors([]);
    setReceipt(null);
    setBusy('preview');
    try {
      const result = await previewCsvImport(csv, objectType, mapping);
      setPreview(result);
      setPreviewSignature(currentSignature);
    } catch (error) {
      setPreview(null);
      setPreviewSignature('');
      setRequestError(error instanceof Error ? error.message : 'The CSV preview could not be completed.');
      if (error instanceof CsvImportRequestError) setRequestRowErrors(error.rowErrors);
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    if (!preview || !previewIsCurrent || preview.invalidRows > 0 || preview.validRows < 1) return;
    setRequestError('');
    setRequestRowErrors([]);
    setBusy('commit');
    let result: CsvImportReceipt;
    try {
      result = await commitCsvImport(csv, objectType, mapping);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'The CSV import could not be committed. Retry safely from this preview.');
      if (error instanceof CsvImportRequestError) setRequestRowErrors(error.rowErrors);
      notify(error instanceof Error ? error.message : 'The CSV import could not be committed.', 'error');
      setBusy(null);
      return;
    }

    // Finalize the committed state before refreshing. The idempotency helper has
    // cleared its key after success, so a refresh failure must never invite a
    // second commit of the same CSV.
    setReceipt(result);
    setRefreshWarning(false);
    setCsv('');
    setFileName('');
    setMapping({});
    setPreview(null);
    setPreviewSignature('');
    if (fileInput.current) fileInput.current.value = '';
    setBusy('refresh');
    try {
      const refreshed = await refresh();
      if (!refreshed) throw new Error('Snapshot refresh returned no workspace.');
      notify(`${result.imported} ${result.objectType} ${result.imported === 1 ? 'record' : 'records'} imported.`);
    } catch {
      setRefreshWarning(true);
      notify('Import succeeded, but the workspace view did not refresh. Reload the workspace before continuing.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return <section className="csv-import-panel panel" aria-labelledby="csv-import-title">
    <header>
      <span className="integration-logo csv" aria-hidden="true">CSV</span>
      <div><p className="eyebrow">LOCAL FILE → YOUR DATA PLANE</p><h2 id="csv-import-title">Import CRM records</h2><p>Preview validates without writing records. Commit is atomic: every valid row imports together, or none do.</p></div>
      <span className="truth-badge">Working now</span>
    </header>
    <form className="csv-import-form" onSubmit={runPreview}>
      <div className="csv-import-source">
        <label className="csv-file-control" htmlFor="csv-import-file"><span>Choose a CSV file</span><input ref={fileInput} id="csv-import-file" type="file" accept=".csv,text/csv,text/plain" disabled={Boolean(busy)} onChange={(event) => void chooseFile(event)} /><small>{fileName || 'Up to 40 data rows and 256,000 UTF-8 bytes per batch.'}</small></label>
        <label htmlFor="csv-object-type"><span>Record type</span><select id="csv-object-type" value={objectType} disabled={Boolean(busy)} onChange={(event) => { setObjectType(event.target.value as CsvImportObjectType); resetValidation(true); }}><option value="contact">Contacts</option><option value="company">Companies</option><option value="lead">Leads</option></select><small>One record type per atomic import.</small></label>
      </div>
      <label className="csv-text-control" htmlFor="csv-import-text"><span>Or paste CSV text</span><textarea id="csv-import-text" value={csv} spellCheck={false} disabled={Boolean(busy)} aria-describedby="csv-import-privacy" placeholder={'name,email,company\nAda Lovelace,ada@example.com,Analytical Engines'} onChange={(event) => { setCsv(event.target.value); setFileName(fileName ? `${fileName} · edited` : ''); resetValidation(true); }} /><small id="csv-import-privacy">The preview request goes only to this FREE CRM deployment and does not create CRM records.</small></label>

      {columns.length > 0 && <fieldset className="csv-mapping-fields">
        <legend>Optional field mappings</legend>
        <p>Auto-detection recognizes common headings. Choose an exact CSV column only when you want to override it, then preview again.</p>
        <div>{mappingFields.map((field) => <label key={field.key} htmlFor={`csv-map-${field.key}`}><span>{field.label}</span><select id={`csv-map-${field.key}`} value={mapping[field.key] ?? ''} disabled={Boolean(busy)} onChange={(event) => updateMapping(field.key, event.target.value)}><option value="">{preview?.mapping[field.key] ? `Auto → ${preview.mapping[field.key]}` : 'Auto-detect'}</option>{columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>)}</div>
      </fieldset>}

      <div className="csv-import-actions">
        <button className="secondary-button" type="submit" disabled={Boolean(busy) || !csv.trim()}>{busy === 'preview' ? 'Validating…' : preview ? 'Preview again' : 'Preview import'}</button>
        <span>Preview first. No partial imports.</span>
      </div>
    </form>

    <div className="csv-import-status" aria-live="polite" aria-atomic="true">{busy === 'file' ? 'Reading CSV file…' : busy === 'preview' ? 'Validating CSV rows…' : busy === 'commit' ? 'Importing the validated batch…' : busy === 'refresh' ? 'Import complete. Refreshing the workspace view…' : receipt ? refreshWarning ? `${receipt.imported} records were imported. Reload the workspace to see the latest snapshot.` : `${receipt.imported} records imported and the workspace snapshot refreshed.` : ''}</div>
    {requestError && <div className="csv-request-error" role="alert"><strong>CSV import stopped</strong><span>{requestError}</span><small>An ambiguous server failure can be retried from the same preview; FREE CRM reuses the same idempotency key.</small></div>}
    <ImportErrors errors={requestRowErrors} />
    {preview && <ImportPreview preview={preview} />}
    {preview && <footer className="csv-commit-bar"><div><strong>{preview.invalidRows ? 'Commit is locked' : `${preview.validRows} records are ready`}</strong><span>{preview.invalidRows ? 'Correct the source CSV, paste it again, and run a fresh preview.' : `This writes ${preview.validRows} ${preview.objectType} ${preview.validRows === 1 ? 'record' : 'records'} to your current workspace.`}</span></div><button className="primary-button" type="button" disabled={Boolean(busy) || !previewIsCurrent || preview.invalidRows > 0 || preview.validRows < 1} onClick={() => void commit()}>{busy === 'commit' ? 'Importing…' : `Import ${preview.validRows} ${preview.validRows === 1 ? 'record' : 'records'}`}</button></footer>}
    {receipt && <div className={`csv-import-receipt${refreshWarning ? ' refresh-warning' : ''}`} role="status"><span aria-hidden="true">✓</span><div><strong>Import complete</strong><p>{receipt.imported} {receipt.objectType} {receipt.imported === 1 ? 'record was' : 'records were'} committed atomically. {refreshWarning ? 'The follow-up snapshot could not be loaded; reload this workspace before continuing. Do not import the same file again.' : 'The workspace data shown elsewhere has been refreshed.'}</p></div></div>}
  </section>;
}
