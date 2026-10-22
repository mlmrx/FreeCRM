import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(directory, entry.name)] : []);
}

describe('complete authored UI source catalog', () => {
  it('includes every explicit display message, including create, update and delete controls', () => {
    const source = JSON.parse(readFileSync('locales/source.json', 'utf8')) as Record<string, string>;
    const missing: string[] = [];
    const check = (value: string, file: string) => {
      const key = value.replace(/\s+/g, ' ').trim();
      if (/[A-Za-z]/.test(key) && !Object.hasOwn(source, key)) missing.push(`${file}: ${key}`);
    };
    for (const file of files('app')) {
      const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node: ts.Node) => {
        if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'text' && node.initializer && ts.isStringLiteral(node.initializer)) check(node.initializer.text, file);
        if (ts.isCallExpression(node) && node.expression.getText(ast) === 'text' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) check(node.arguments[0].text, file);
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
    expect(missing).toEqual([]);
    expect(source.Delete).toBe('Delete');
    expect(source.Update).toBe('Update');
  }, 15_000);
});
