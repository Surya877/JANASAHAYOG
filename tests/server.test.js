import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';

const BASE_URL = 'http://127.0.0.1:3001';
const projectRoot = process.cwd();
let serverProcess;

before(async () => {
  serverProcess = spawn(process.execPath, [path.join(projectRoot, 'server.js')], {
    cwd: projectRoot,
    stdio: 'inherit'
  });

  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) return;
    } catch {
      // keep polling until server becomes ready
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Backend server did not start in time.');
});

after(() => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
});

test('health endpoint responds successfully', async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.status, 'ok');
  assert.equal(payload.app, 'JANSAHYOG');
});

test('demo citizen login works', async () => {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'CITIZEN', email: 'v.ramanjaneyulu@guntur.org' })
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.role, 'CITIZEN');
  assert.equal(payload.fullName, 'V. Ramanjaneyulu');
});

test('challenge creation persists to the backend', async () => {
  const response = await fetch(`${BASE_URL}/api/challenges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Production-grade backend persistence check',
      category: 'Water Resources',
      district: 'Bapatla',
      mandal: 'Nizampatnam Coast',
      state: 'Andhra Pradesh',
      problemBackground: 'Validate backend challenge creation pipeline.',
      submittedBy: 'System Test',
      submitterRole: 'Citizen Submitter',
      evidenceUrl: 'https://example.com/evidence.jpg',
      evidenceType: 'image',
      evidenceFilename: 'backend_check.jpg',
      gps: { lat: 15.9, lng: 80.6, accuracy: 5 },
      aiAudit: { aiProbability: 2.3, authenticityScore: 97.7, verdict: 'GENUINE_CAMERA_CAPTURE' },
      embedding512: Array(512).fill(0.1),
      upvotes: 1,
      solutionsCount: 0
    })
  });

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.ok(payload.id);
  assert.equal(payload.title, 'Production-grade backend persistence check');
});
