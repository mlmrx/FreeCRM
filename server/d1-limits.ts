import { D1_RPC_MAX_BATCH_STATEMENTS } from '@/lib/d1-rpc-protocol';

/** Application ceiling; the Vercel RPC reserves two more D1 queries for replay safety. */
export const D1_MAX_QUERIES_PER_INVOCATION = D1_RPC_MAX_BATCH_STATEMENTS;

export function assertD1BatchSize<T extends D1PreparedStatement[]>(statements: T, operation: string): T {
  if (statements.length > D1_MAX_QUERIES_PER_INVOCATION) {
    throw new Error(`${operation} requires ${statements.length} D1 queries; the portable per-invocation limit is ${D1_MAX_QUERIES_PER_INVOCATION}.`);
  }
  return statements;
}
