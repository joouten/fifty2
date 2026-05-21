#!/usr/bin/env node
// Promote a Play Console release from one track to another via the Play
// Developer API. Reuses the service account from eas.json.
//
// Usage (dry-run — inspect only):
//   node scripts/promote-play-release.mjs <versionCode> <fromTrack> <toTrack>
//   node scripts/promote-play-release.mjs 8 internal alpha
//
// Add --commit to actually apply the change:
//   node scripts/promote-play-release.mjs 8 internal alpha --commit
//
// Notes:
//   - Promoting copies the release (versionCodes, notes, name, status) into
//     the target track. The source track is left untouched.
//   - If the target track ID isn't found, the script lists all available
//     tracks so you can pick the right ID (Play Console allows custom track
//     names like "alpha", "closed-testing-2", etc.).

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const APP_ID = 'com.jouten.fifty2app';

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const positional = args.filter((a) => !a.startsWith('--'));
const [versionCodeArg, fromTrackArg, toTrackArg] = positional;
if (!versionCodeArg || !fromTrackArg || !toTrackArg) {
  console.error('Usage: node scripts/promote-play-release.mjs <versionCode> <fromTrack> <toTrack> [--commit]');
  process.exit(2);
}
const VERSION_CODE = String(versionCodeArg);
const FROM_TRACK = String(fromTrackArg);
const TO_TRACK = String(toTrackArg);

const easJson = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'eas.json'), 'utf8'));
const keyPathRel = easJson?.submit?.production?.android?.serviceAccountKeyPath;
const keyPath = resolve(PROJECT_ROOT, keyPathRel);
const creds = JSON.parse(readFileSync(keyPath, 'utf8'));

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

async function getAccessToken() {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(creds.private_key);
  const jwt = `${unsigned}.${b64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`oauth token error ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function api(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${url}\n  -> ${res.status} ${res.statusText}\n  ${text}`);
    err.status = res.status;
    err.responseText = text;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

function summarizeRelease(r) {
  return {
    name: r.name,
    status: r.status,
    versionCodes: r.versionCodes,
    notes: (r.releaseNotes || []).map((n) => ({ lang: n.language, preview: (n.text || '').slice(0, 60) })),
  };
}

const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${APP_ID}`;
const token = await getAccessToken();
console.log(`auth ok as ${creds.client_email}`);

const edit = await api(token, 'POST', `${base}/edits`);
console.log(`opened edit ${edit.id}${COMMIT ? '' : ' (dry-run — will not be committed)'}`);

// Read source
const sourceTrack = await api(token, 'GET', `${base}/edits/${edit.id}/tracks/${FROM_TRACK}`);
const sourceRelease = (sourceTrack.releases || []).find((r) => (r.versionCodes || []).includes(VERSION_CODE));
if (!sourceRelease) {
  console.error(`no release with versionCode ${VERSION_CODE} on track ${FROM_TRACK}`);
  console.error('available on source track:', JSON.stringify(sourceTrack.releases?.map(summarizeRelease), null, 2));
  process.exit(1);
}
console.log(`\nSOURCE TRACK [${FROM_TRACK}] release to promote:`);
console.log(JSON.stringify(summarizeRelease(sourceRelease), null, 2));

// Read destination — handle 404 gracefully (track doesn't exist or wrong name)
let destTrack;
try {
  destTrack = await api(token, 'GET', `${base}/edits/${edit.id}/tracks/${TO_TRACK}`);
} catch (err) {
  if (err.status === 404) {
    console.error(`\ntarget track "${TO_TRACK}" not found. Listing all available tracks:`);
    const allTracks = await api(token, 'GET', `${base}/edits/${edit.id}/tracks`);
    console.error(JSON.stringify(allTracks, null, 2));
    process.exit(1);
  }
  throw err;
}
console.log(`\nDESTINATION TRACK [${TO_TRACK}] current state:`);
console.log(JSON.stringify({ releases: (destTrack.releases || []).map(summarizeRelease) }, null, 2));

// Play Developer API constraint: a track's `releases` array reflects the
// CURRENT state, not historical. Only one `completed` release is allowed per
// track. Prior completed releases on the target track move to history
// automatically when we PUT a new one — we don't (and can't) include them.
// Drafts and in-progress releases are also dropped here, matching Play
// Console UI semantics where a new release replaces any pending state.
const promotedRelease = {
  name: sourceRelease.name,
  versionCodes: sourceRelease.versionCodes,
  status: sourceRelease.status, // typically 'completed' for an immediate promotion
  releaseNotes: sourceRelease.releaseNotes,
};
// If the same versionCode is already the active completed release on dest, no-op
const alreadyOnDest = (destTrack.releases || []).some(
  (r) => r.status === 'completed' && (r.versionCodes || []).includes(VERSION_CODE),
);
if (alreadyOnDest) {
  console.log(`\nNOOP: versionCode ${VERSION_CODE} is already the active completed release on ${TO_TRACK}. Nothing to do.`);
  process.exit(0);
}
const newReleases = [promotedRelease];

console.log(`\nPROPOSED PUT body for [${TO_TRACK}]:`);
console.log(JSON.stringify({ track: TO_TRACK, releases: newReleases.map(summarizeRelease) }, null, 2));

if (!COMMIT) {
  console.log('\n--- DRY RUN ---');
  console.log('No changes applied. Re-run with --commit to apply.');
  process.exit(0);
}

await api(token, 'PUT', `${base}/edits/${edit.id}/tracks/${TO_TRACK}`, {
  track: TO_TRACK,
  releases: newReleases,
});
console.log(`PUT ok`);

await api(token, 'POST', `${base}/edits/${edit.id}:commit`);
console.log(`edit committed — versionCode ${VERSION_CODE} promoted ${FROM_TRACK} -> ${TO_TRACK}`);
