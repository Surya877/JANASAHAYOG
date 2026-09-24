import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeImageForensics, createImageDetectionModel, buildFallbackEvidenceAssessment } from '../aiImageDetectionService.js';

test('analyzeImageForensics keeps typical camera captures in the low-risk band', () => {
  const result = analyzeImageForensics({
    fileName: 'IMG_20250101_1130.jpg',
    mimeType: 'image/jpeg',
    fileSizeBytes: 2200000,
    width: 4032,
    height: 3024,
    hasExif: true,
    source: 'camera',
    software: 'Apple iPhone',
    artifactHints: [],
  }, createImageDetectionModel());

  assert.ok(result.probability < 0.4);
  assert.equal(result.riskLevel, 'low');
  assert.equal(result.verdict, 'likely-authentic');
});

test('analyzeImageForensics flags suspicious AI-generation metadata as high risk', () => {
  const result = analyzeImageForensics({
    fileName: 'midjourney_generated_scene.png',
    mimeType: 'image/png',
    fileSizeBytes: 420000,
    width: 5000,
    height: 1000,
    hasExif: false,
    source: 'gallery',
    software: 'midjourney',
    artifactHints: ['synthetic smooth texture'],
  }, createImageDetectionModel());

  assert.ok(result.probability >= 0.5);
  assert.equal(result.riskLevel, 'high');
  assert.equal(result.verdict, 'suspicious-editing');
});

test('buildFallbackEvidenceAssessment varies by file signal rather than a fixed percentage', () => {
  const authentic = buildFallbackEvidenceAssessment({
    name: 'IMG_20240620_121530.jpg',
    type: 'image/jpeg',
    size: 2200000,
    hasExif: true,
    source: 'camera',
    software: 'Apple iPhone',
    artifactHints: [],
  });

  const suspicious = buildFallbackEvidenceAssessment({
    name: 'midjourney_generated_scene.png',
    type: 'image/png',
    size: 420000,
    hasExif: false,
    source: 'gallery',
    software: 'midjourney',
    artifactHints: ['synthetic smooth texture'],
  });

  assert.ok(authentic.aiProbability < suspicious.aiProbability);
  assert.notEqual(authentic.aiProbability, suspicious.aiProbability);
  assert.ok(authentic.aiProbability < 40);
  assert.ok(suspicious.aiProbability >= 50);
});
