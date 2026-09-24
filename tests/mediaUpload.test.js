import test from 'node:test';
import assert from 'node:assert/strict';

import { detectMediaType, createMediaPreview, revokeMediaPreview, detectLikelyCartoonOrIllustration, shouldBlockEvidence, getPriorityLevel, getPriorityScore, groupChallengesByArea, normalizePortalRole } from '../mediaUpload.js';
import { resolveApiBase } from '../apiClient.js';

test('detectMediaType identifies video by file type', () => {
  const file = { type: 'video/mp4', name: 'sample.mp4' };
  assert.equal(detectMediaType(file), 'video');
});

test('detectMediaType falls back to extension when mime type is missing', () => {
  const file = { type: '', name: 'sample.mov' };
  assert.equal(detectMediaType(file), 'video');
});

test('createMediaPreview returns a blob URL and revokeMediaPreview clears it', () => {
  const calls = [];
  const prevUrl = global.URL;
  global.URL = {
    createObjectURL: (blob) => {
      calls.push(['create', blob.name]);
      return `blob:preview-${blob.name}`;
    },
    revokeObjectURL: (url) => {
      calls.push(['revoke', url]);
    }
  };

  try {
    const file = { name: 'clip.mp4', type: 'video/mp4' };
    const previewUrl = createMediaPreview(file);

    assert.equal(previewUrl, 'blob:preview-clip.mp4');
    revokeMediaPreview(previewUrl);
    assert.deepEqual(calls, [
      ['create', 'clip.mp4'],
      ['revoke', 'blob:preview-clip.mp4']
    ]);
  } finally {
    global.URL = prevUrl;
  }
});

test('detectLikelyCartoonOrIllustration rejects character artwork names', () => {
  const result = detectLikelyCartoonOrIllustration({ name: 'mario_character_sheet.png' });
  assert.equal(result.suspicious, true);
  assert.match(result.reason, /character/i);
});

test('shouldBlockEvidence only blocks strong AI or near-duplicate matches', () => {
  assert.equal(shouldBlockEvidence({ aiProbability: 10, duplicateSimilarity: 0.82 }), false);
  assert.equal(shouldBlockEvidence({ aiProbability: 91, duplicateSimilarity: 0.2 }), true);
  assert.equal(shouldBlockEvidence({ aiProbability: 10, duplicateSimilarity: 0.99 }), true);
});

test('resolveApiBase prefers the browser origin in production deployments', () => {
  const prevWindow = global.window;
  global.window = { location: { origin: 'https://jansahyog.onrender.com' } };

  try {
    assert.equal(resolveApiBase(), 'https://jansahyog.onrender.com');
  } finally {
    global.window = prevWindow;
  }
});

test('getPriorityLevel ranks the most urgent reports as high priority', () => {
  const highPriority = { upvotes: 42, solutionsCount: 2, aiAudit: { aiProbability: 91 } };
  const lowPriority = { upvotes: 4, solutionsCount: 0, aiAudit: { aiProbability: 8 } };

  assert.equal(getPriorityLevel(highPriority).level, 'High Priority');
  assert.equal(getPriorityLevel(lowPriority).level, 'Low Priority');
  assert.ok(getPriorityScore(highPriority) > getPriorityScore(lowPriority));
});

test('groupChallengesByArea sorts districts by their combined urgency', () => {
  const items = [
    { district: 'Guntur', upvotes: 10, solutionsCount: 1, aiAudit: { aiProbability: 12 } },
    { district: 'Bapatla', upvotes: 18, solutionsCount: 3, aiAudit: { aiProbability: 90 } },
    { district: 'Bapatla', upvotes: 25, solutionsCount: 2, aiAudit: { aiProbability: 85 } },
  ];

  const grouped = groupChallengesByArea(items);
  assert.equal(grouped[0].area, 'Bapatla');
  assert.equal(grouped[0].priority.level, 'High Priority');
  assert.equal(grouped[1].area, 'Guntur');
});

test('normalizePortalRole keeps student and faculty signups consistent across the portal', () => {
  assert.equal(normalizePortalRole('ACADEMIC'), 'STUDENT');
  assert.equal(normalizePortalRole('student'), 'STUDENT');
  assert.equal(normalizePortalRole('Faculty'), 'FACULTY');
  assert.equal(normalizePortalRole('Citizen'), 'CITIZEN');
});
