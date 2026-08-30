export type NameStatusEntry = { status: string; paths: string[] };
export function parseNameStatus(output: string): NameStatusEntry[];
export function modifiedMergedMigrations(entries: NameStatusEntry[]): NameStatusEntry[];
export function main(): void;
