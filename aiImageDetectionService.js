const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const DEFAULT_IMAGE_DETECTION_MODEL = {
  name: 'heuristic-forensics-model',
  provider: 'local-heuristic-analysis',
  version: '1.0.0',
  supports: ['image'],
};

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

export function analyzeImageForensics(input, model = DEFAULT_IMAGE_DETECTION_MODEL) {
  const fileName = normalizeText(input.fileName || '');
  const mimeType = normalizeText(input.mimeType || '');
  const size = Number(input.fileSizeBytes || 0);
  const width = Number(input.width || 0);
  const height = Number(input.height || 0);
  const source = normalizeText(input.source || 'gallery');
  const software = normalizeText(input.software || '');
  const artifactHints = Array.isArray(input.artifactHints) ? input.artifactHints.map((hint) => normalizeText(hint)) : [];

  let riskScore = 0;
  const findings = [];

  if (fileName.includes('ai') || fileName.includes('dalle') || fileName.includes('midjourney') || fileName.includes('stable') || fileName.includes('firefly') || fileName.includes('generated')) {
    riskScore += 24;
    findings.push({ label: 'Filename indicates generated content', severity: 'medium', detail: 'The file name includes AI-generation keywords.' });
  }

  if (software.includes('photoshop') || software.includes('canva') || software.includes('midjourney') || software.includes('stable diffusion') || software.includes('firefly')) {
    riskScore += 18;
    findings.push({ label: 'Editing or generative software detected', severity: 'high', detail: 'The upload metadata suggests image-editing or generative tools.' });
  }

  if (artifactHints.some((hint) => hint.includes('artificial') || hint.includes('smooth') || hint.includes('synthetic'))) {
    riskScore += 22;
    findings.push({ label: 'Texture anomalies observed', severity: 'medium', detail: 'The signal profile matches a smooth synthetic artifact pattern.' });
  }

  if (source === 'camera') {
    riskScore -= 6;
  }

  if (source === 'gallery') {
    riskScore += 8;
  }

  if (mimeType && !['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/bmp'].includes(mimeType)) {
    riskScore += 10;
    findings.push({ label: 'Unexpected file format', severity: 'medium', detail: 'The file type is outside the standard mobile photo formats.' });
  }

  if (width > 0 && height > 0) {
    const ratio = width / height;
    if (ratio > 3 || ratio < 0.34) {
      riskScore += 12;
      findings.push({ label: 'Aspect-ratio anomaly', severity: 'medium', detail: 'The image dimensions are unusually compressed or stretched for a natural capture.' });
    }
  }

  if (size > 0 && size < 180000) {
    riskScore += 10;
    findings.push({ label: 'Very small image footprint', severity: 'low', detail: 'The image is unusually small for a detailed evidence capture.' });
  }

  if (size > 14 * 1024 * 1024) {
    riskScore += 6;
    findings.push({ label: 'Large file size flagged', severity: 'low', detail: 'Large upscaled files can hide manipulation or repeated compression.' });
  }

  if (input.hasExif === false) {
    riskScore += 6;
    findings.push({ label: 'Missing camera metadata', severity: 'low', detail: 'The file does not include EXIF metadata, which often means it was copied or edited.' });
  }

  riskScore = clamp(riskScore, 0, 100);
  const probability = clamp(riskScore / 100, 0, 1);

  let verdict = 'likely-authentic';
  let riskLevel = 'low';
  if (probability > 0.65) {
    verdict = 'suspicious-editing';
    riskLevel = 'high';
  } else if (probability > 0.38) {
    verdict = 'needs-human-review';
    riskLevel = 'medium';
  }

  const recommendations = [
    'Check the file source and chain of custody before relying on the result.',
    'Compare the image against the original capture or device metadata when available.',
    'Ask for a second image taken in a different angle or lighting condition.',
  ];

  return {
    model: model.name,
    provider: model.provider,
    version: model.version,
    verdict,
    riskLevel,
    probability: Number(probability.toFixed(3)),
    confidence: Math.round(50 + probability * 45),
    summary: verdict === 'likely-authentic'
      ? 'No strong forensic indicators were detected in the supplied metadata.'
      : verdict === 'needs-human-review'
        ? 'The evidence needs a manual review because a few signals are inconsistent.'
        : 'The evidence shows several suspicious patterns and should be treated as high-risk until verified.',
    findings: findings.length ? findings : [{ label: 'No obvious manipulation markers', severity: 'info', detail: 'The uploaded file looks consistent with a standard mobile capture.' }],
    recommendations,
    metadata: {
      fileName: input.fileName || 'unknown-file',
      mimeType: mimeType || 'unknown',
      fileSizeBytes: size,
      width,
      height,
      source: source || 'unknown',
      hasExif: Boolean(input.hasExif),
    },
  };
}

export function createImageDetectionModel(overrides = {}) {
  return {
    ...DEFAULT_IMAGE_DETECTION_MODEL,
    ...overrides,
  };
}

export function buildFallbackEvidenceAssessment(fileLike = {}) {
  const analysis = analyzeImageForensics({
    fileName: fileLike.name || fileLike.fileName || 'unknown-image.jpg',
    mimeType: fileLike.type || fileLike.mimeType || 'image/jpeg',
    fileSizeBytes: Number(fileLike.size || fileLike.fileSizeBytes || 0),
    width: Number(fileLike.width || 0),
    height: Number(fileLike.height || 0),
    hasExif: Boolean(fileLike.hasExif ?? true),
    source: fileLike.source || 'camera',
    software: fileLike.software || '',
    artifactHints: Array.isArray(fileLike.artifactHints) ? fileLike.artifactHints : [],
  }, DEFAULT_IMAGE_DETECTION_MODEL);

  return {
    aiProbability: Number((analysis.probability * 100).toFixed(1)),
    authenticityScore: Number((100 - analysis.probability * 100).toFixed(1)),
    isSynthetic: analysis.riskLevel === 'high' || analysis.verdict === 'suspicious-editing',
    meanLaplacian: 0,
    flags: analysis.findings.map((item) => item.detail),
    summary: analysis.summary,
    verdict: analysis.verdict,
    riskLevel: analysis.riskLevel,
    confidence: analysis.confidence,
  };
}
