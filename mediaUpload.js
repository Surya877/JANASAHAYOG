const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'm4v', 'webm', 'ogg', 'mkv', '3gp'];

export const detectMediaType = (file) => {
  if (!file) return 'image';

  const type = (file.type || '').toLowerCase();
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('image/')) return 'image';

  const name = (file.name || '').toLowerCase();
  if (VIDEO_EXTENSIONS.some((ext) => name.endsWith(`.${ext}`))) return 'video';
  if (IMAGE_EXTENSIONS.some((ext) => name.endsWith(`.${ext}`))) return 'image';

  return 'image';
};

export const shouldBlockEvidence = ({ aiProbability = 0, duplicateSimilarity = 0, aiThreshold = 85, duplicateThreshold = 0.97 } = {}) => {
  const aiValue = Number(aiProbability) || 0;
  const duplicateValue = Number(duplicateSimilarity) || 0;
  return aiValue >= aiThreshold || duplicateValue >= duplicateThreshold;
};

export const normalizePortalRole = (role = 'CITIZEN') => {
  const normalized = String(role || 'CITIZEN').trim().toUpperCase();

  if (normalized === 'ACADEMIC') return 'STUDENT';
  if (['CITIZEN', 'STUDENT', 'FACULTY', 'INDUSTRY', 'ADMIN'].includes(normalized)) return normalized;
  return 'CITIZEN';
};

export const getPriorityScore = (challenge = {}) => {
  const aiProbability = Number(challenge?.aiAudit?.aiProbability ?? challenge?.aiProbability ?? 0) || 0;
  const upvotes = Number(challenge?.upvotes ?? 0) || 0;
  const solutionsCount = Number(challenge?.solutionsCount ?? 0) || 0;
  const urgency = Number(challenge?.urgency ?? 0) || 0;
  return Math.round(aiProbability * 1.5 + upvotes * 1.2 + solutionsCount * 6 + urgency * 10);
};

export const getPriorityLevel = (challenge = {}) => {
  const score = getPriorityScore(challenge);

  if (score >= 120) {
    return {
      level: 'High Priority',
      badgeClass: 'bg-rose-100 text-rose-800 border border-rose-300',
      score
    };
  }

  if (score >= 70) {
    return {
      level: 'Medium Priority',
      badgeClass: 'bg-amber-100 text-amber-800 border border-amber-300',
      score
    };
  }

  return {
    level: 'Low Priority',
    badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    score
  };
};

export const groupChallengesByArea = (challenges = []) => {
  const map = new Map();

  for (const challenge of challenges) {
    const area = challenge?.district || 'Unknown Area';
    const current = map.get(area) || { area, items: [], totalScore: 0 };
    current.items.push(challenge);
    current.totalScore += getPriorityScore(challenge);
    map.set(area, current);
  }

  return [...map.values()]
    .map((entry) => ({
      ...entry,
      priority: getPriorityLevel({
        upvotes: entry.items.reduce((sum, item) => sum + Number(item?.upvotes || 0), 0),
        solutionsCount: entry.items.reduce((sum, item) => sum + Number(item?.solutionsCount || 0), 0),
        aiAudit: {
          aiProbability: Math.max(...entry.items.map((item) => Number(item?.aiAudit?.aiProbability || item?.aiProbability || 0)), 0)
        }
      }),
      challengeCount: entry.items.length,
      dominantCategory: entry.items[0]?.category || 'General'
    }))
    .sort((a, b) => b.totalScore - a.totalScore);
};

export const detectLikelyCartoonOrIllustration = (file, imageElement = null) => {
  const name = (file?.name || '').toLowerCase();
  const suspiciousTokens = [
    'cartoon', 'anime', 'character', 'illustration', 'avatar', 'sprite', 'clipart',
    'comic', 'manga', 'logo', 'render', 'poster', 'sketch', 'nft', 'artwork'
  ];

  const matchedToken = suspiciousTokens.find((token) => name.includes(token));
  if (matchedToken) {
    return {
      suspicious: true,
      reason: `Non-camera character/illustration asset detected ("${matchedToken}")`
    };
  }

  if (!imageElement || typeof document === 'undefined') {
    return { suspicious: false, reason: null };
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imageElement, 0, 0, 128, 128);
    const data = ctx.getImageData(0, 0, 128, 128).data;

    let brightnessSum = 0;
    let edgeCount = 0;
    let totalPixels = 0;

    for (let y = 1; y < 127; y++) {
      for (let x = 1; x < 127; x++) {
        const idx = (y * 128 + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        brightnessSum += lum;

        const leftLum = 0.2126 * data[idx - 4] + 0.7152 * data[idx - 3] + 0.0722 * data[idx - 2];
        const topLum = 0.2126 * data[idx - 512] + 0.7152 * data[idx - 511] + 0.0722 * data[idx - 510];
        const diff = Math.abs(lum - leftLum) + Math.abs(lum - topLum);

        if (diff > 40) edgeCount += 1;
        totalPixels += 1;
      }
    }

    const avgBrightness = brightnessSum / totalPixels;
    const edgeDensity = edgeCount / totalPixels;

    if (avgBrightness > 180 && edgeDensity < 0.08) {
      return {
        suspicious: true,
        reason: 'Flat stylized art detected with cartoon-like edge density and high brightness'
      };
    }
  } catch (error) {
    // Ignore pixel-level checks for unsupported browsers; name-based detection still protects the flow.
  }

  return { suspicious: false, reason: null };
};

export const createMediaPreview = (file) => {
  if (!file || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return null;
  }

  return URL.createObjectURL(file);
};

export const revokeMediaPreview = (previewUrl) => {
  if (previewUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(previewUrl);
  }
};
