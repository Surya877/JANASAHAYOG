import test from 'node:test';
import assert from 'node:assert/strict';

import { detectMediaType, createMediaPreview, revokeMediaPreview, detectLikelyCartoonOrIllustration, shouldBlockEvidence } from '../mediaUpload.js';

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
