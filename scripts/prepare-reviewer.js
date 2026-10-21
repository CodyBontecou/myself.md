import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { hashPassword } from 'better-auth/crypto';
import { CloudStore } from '../server/cloud-store.js';
import { BillingStore } from '../server/billing-store.js';
import { PairingStore } from '../server/pairing-store.js';
import { HistoryStore } from '../server/history-store.js';
import { seedReviewerFixtures } from '../server/reviewer-fixtures.js';
import { reviewerEmail, reviewerUserId } from '../server/reviewer.js';
import { exportRows } from '../server/migration-rows.js';
import { Buffer } from 'node:buffer';

const quote = (/** @type {string} */ value) => `'${value.replaceAll("'", "''")}'`;
const directory = '.local/reviewer-login';
mkdirSync(directory, { recursive: true, mode: 0o700 });
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/,\s*([}\]])/g, '$1'));
const subject = `${config.vars.ACCOUNT_NAMESPACE}|${reviewerUserId}`;
const credentialsPath = `${directory}/credentials.json`;
const password = existsSync(credentialsPath)
  ? JSON.parse(readFileSync(credentialsPath, 'utf8')).password
  : randomBytes(32).toString('base64url');
const hash = await hashPassword(password);
writeFileSync(
  credentialsPath,
  JSON.stringify(
    {
      username: 'reviewer',
      email: reviewerEmail,
      password,
      userId: reviewerUserId,
      subject,
      loginURL: `${config.vars.OAUTH_ISSUER}/reviewer-login`,
    },
    null,
    2,
  ) + '\n',
  { mode: 0o600 },
);
const key = Buffer.from(
  parseEnv(readFileSync('.dev.vars', 'utf8')).CLOUD_ENCRYPTION_KEY ?? '',
  'hex',
);
const billing = new BillingStore(`${directory}/billing.sqlite`);
const pairing = new PairingStore(`${directory}/pairing.sqlite`);
const cloud = new CloudStore(`${directory}/cloud.sqlite`, key, null, (s) =>
  billing.cloudEntitlement(s),
);
const history = new HistoryStore(`${directory}/history.sqlite`, cloud);
try {
  const summary = await seedReviewerFixtures(
    { billing, pairing, cloud, history },
    subject,
    process.argv[2] ?? new Date().toISOString().slice(0, 10),
  );
  const tables = [
    exportRows(pairing.db, ['devices'], 'devices', 0),
    exportRows(billing.db, ['billing_grants'], 'billing_grants', 0),
    exportRows(cloud.db, ['exports'], 'exports', 0),
    exportRows(cloud.db, ['cloud_access'], 'cloud_access', 0),
    exportRows(history.db, ['activity'], 'activity', 0),
  ].map(({ name, columns, rows }) => ({ name, columns, rows }));
  writeFileSync(
    `${directory}/account-batch.json`,
    JSON.stringify({ id: 'reviewer-fictional-fixtures-v1', subject, tables }),
    { mode: 0o600 },
  );
  const now = Date.now();
  const sql = `${readFileSync('worker/migrations/reviewer-access.sql', 'utf8')}\nINSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (${quote(reviewerUserId)},'Fictional reviewer',${quote(reviewerEmail)},1,${now},${now});\nINSERT INTO account (id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES ('myselfmd-reviewer-credential',${quote(reviewerUserId)},'credential',${quote(reviewerUserId)},${quote(hash)},${now},${now});\nINSERT INTO reviewer_access VALUES (${quote(reviewerUserId)},1,${Math.floor(now / 1000)});\n`;
  writeFileSync(`${directory}/provision.sql`, sql, { mode: 0o600 });
  const revoke = `UPDATE reviewer_access SET enabled=0,token_valid_after=CAST(strftime('%s','now') AS INTEGER)+1 WHERE user_id=${quote(reviewerUserId)};\n${['oauthAccessToken', 'oauthRefreshToken', 'oauthConsent', 'session'].map((table) => `DELETE FROM ${table} WHERE userId=${quote(reviewerUserId)};`).join('\n')}\nDELETE FROM account WHERE userId=${quote(reviewerUserId)} AND providerId='credential';\n`;
  writeFileSync(`${directory}/revoke.sql`, revoke, { mode: 0o600 });
  writeFileSync(`${directory}/summary.json`, JSON.stringify(summary, null, 2) + '\n', {
    mode: 0o600,
  });
  console.log(
    `Prepared isolated reviewer identity, ${summary.exports} fictional exports and private credential/provisioning files in ${directory}. Nothing deployed or imported.`,
  );
} finally {
  history.db.close();
  cloud.db.close();
  pairing.db.close();
  billing.db.close();
}
