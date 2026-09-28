import { lexSql, splitStatements } from '../check-supabase-artifacts.mjs';
import { extractMigrationTransaction } from '../test-research-cancellation-local.mjs';

export function bootstrapBody(sql) {
  const first = splitStatements(lexSql(sql).tokens)[0];
  return extractMigrationTransaction(/^BEGIN$/i.test(first ?? '') ? sql : `BEGIN;\n${sql}\nCOMMIT;`);
}

export async function applyMigrationAtomic(client, sql, checkpoint) {
  const body = bootstrapBody(sql);
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE postgres; SET LOCAL search_path = public');
    for (const statement of body) await client.query(statement);
    await client.query('RESET ROLE');
    await checkpoint();
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
