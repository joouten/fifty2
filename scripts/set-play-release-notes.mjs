#!/usr/bin/env node
// Set "What's new" release notes on a Play Console release via the
// Play Developer Edits API. Uses the same service account JSON wired
// into eas.json's submit.production.android.serviceAccountKeyPath.
//
// EAS Submit for Android does not push release notes during `eas submit`;
// this script fills that gap.
//
// Usage:
//   node scripts/set-play-release-notes.mjs <versionCode> "<notes>"
//   node scripts/set-play-release-notes.mjs 8 "v1.0.1: Visual polish."
//
// Reads serviceAccountKeyPath from eas.json so it stays in sync with
// the submit config. Track and locale are constants below.

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const APP_ID = 'com.jouten.fifty2app';
const TRACK = 'internal';
const LOCALE = 'en-US';

const [, , versionCodeArg, notesArg] = process.argv;
if (!versionCodeArg || !notesArg) {
  console.error('Usage: node scripts/set-play-release-notes.mjs <versionCode> "<notes>"');
  process.exit(2);
}
const VERSION_CODE = String(versionCodeArg);
const NOTES = String(notesArg);

const easJson = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'eas.json'), 'utf8'));
const keyPathRel = easJson?.submit?.production?.android?.serviceAccountKeyPath;
if (!keyPathRel) {
  console.error('eas.json submit.production.android.serviceAccountKeyPath is not set');
  process.exit(2);
}
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
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url}\n  -> ${res.status} ${res.statusText}\n  ${text}`);
  return text ? JSON.parse(text) : {};
}

const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${APP_ID}`;

const token = await getAccessToken();
console.log(`auth ok as ${creds.client_email}`);

const edit = await api(token, 'POST', `${base}/edits`);
console.log(`opened edit ${edit.id}`);

const trackState = await api(token, 'GET', `${base}/edits/${edit.id}/tracks/${TRACK}`);
const targetRelease = (trackState.releases || []).find((r) => (r.versionCodes || []).includes(VERSION_CODE));
if (!targetRelease) {
  console.error(`no release with versionCode ${VERSION_CODE} on track ${TRACK}`);
  console.error('available:', JSON.stringify(trackState.releases?.map((r) => ({ versionCodes: r.versionCodes, status: r.status })), null, 2));
  process.exit(1);
}
console.log(`found release: status=${targetRelease.status} versionCodes=${targetRelease.versionCodes.join(',')}`);

const updatedReleases = trackState.releases.map((r) =>
  r === targetRelease ? { ...r, releaseNotes: [{ language: LOCALE, text: NOTES }] } : r,
);

await api(token, 'PUT', `${base}/edits/${edit.id}/tracks/${TRACK}`, {
  track: TRACK,
  releases: updatedReleases,
});
console.log(`set notes [${LOCALE}]: ${NOTES.slice(0, 80)}${NOTES.length > 80 ? '…' : ''}`);

await api(token, 'POST', `${base}/edits/${edit.id}:commit`);
console.log('edit committed');
