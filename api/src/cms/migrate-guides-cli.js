// npm run migrate:guides            copies all guides to Contentful
// npm run migrate:guides -- --dry-run   reads Contentful, writes nothing, prints what would happen
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { config } from '../config.js';
import { pool } from '../db/client.js';
import { createClient, syncGuide } from './migrateGuides.js';

const dryRun = process.argv.includes('--dry-run');
// Read here and not in config.js: only this script gets a token that can write.
// Without CONTENTFUL_MANAGEMENT_TOKEN it uses the token that `npx contentful-cli login` saved.
const savedCliToken = () => {
  try {
    return JSON.parse(readFileSync(join(homedir(), '.contentfulrc.json'), 'utf8')).managementToken;
  } catch {
    return undefined;
  }
};
const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN || savedCliToken();

if (!config.cmsSpaceId || !token) {
  console.error('Set CONTENTFUL_SPACE_ID in .env, and either CONTENTFUL_MANAGEMENT_TOKEN or run `npx contentful-cli login`.');
  process.exit(1);
}

try {
  const client = createClient({ spaceId: config.cmsSpaceId, environment: config.cmsEnvironment, token, dryRun });
  const locale = await client.defaultLocale();
  const { rows } = await pool.query(
    'select slug, title, region, difficulty, length_km, body_html, published from guides order by id',
  );
  console.log(`${dryRun ? '[dry run] ' : ''}Migrating ${rows.length} guides to ${config.cmsSpaceId}/${config.cmsEnvironment} (locale ${locale})`);

  const totals = { created: 0, updated: 0, unchanged: 0, failed: 0 };
  for (const [index, row] of rows.entries()) {
    const label = `[${index + 1}/${rows.length}] ${row.slug}`;
    try {
      const result = await syncGuide(row, client, locale);
      totals[result.action] += 1;
      console.log(`${label}: ${result.action}, publish ${result.publish}`);
      for (const warning of result.warnings) console.warn(`  warning: ${warning}`);
    } catch (err) {
      totals.failed += 1;
      console.error(`${label}: FAILED ${err.message}`);
    }
  }
  console.log(`Done: ${totals.created} created, ${totals.updated} updated, ${totals.unchanged} unchanged, ${totals.failed} failed`);
  if (totals.failed > 0) process.exitCode = 1;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
