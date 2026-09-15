import { csvImportTemplates, csvTemplateHref } from '@/lib/csv-import-templates';
import { freeCrmRepositoryUrl } from '@/lib/public-config';
import styles from './csv-template-downloads.module.css';

export default function CsvTemplateDownloads() {
  return <aside className={styles.templates} aria-labelledby="csv-template-title">
    <div><h3 id="csv-template-title">Start with a small example</h3><p>Download a UTF-8 template, replace the fictional rows, and choose the matching record type below. Preview does not write records.</p></div>
    <ul>{csvImportTemplates.map((template) => <li key={template.objectType}><a href={csvTemplateHref(template.filename)} download={template.filename} type="text/csv" aria-label={`Download fictional ${template.label.toLowerCase()} CSV template`}>{template.label} <span>(CSV)</span><span aria-hidden="true"> ↓</span></a></li>)}</ul>
    <a className={styles.guide} href={`${freeCrmRepositoryUrl}/blob/main/docs/CSV_IMPORT.md`} target="_blank" rel="noreferrer noopener">Template fields and import guide <span aria-hidden="true">↗</span></a>
  </aside>;
}
