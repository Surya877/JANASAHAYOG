import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Optional runtime imports — loaded dynamically so server can run without
// installing these packages when running quick tests locally.
let dotenv;
let bcrypt;
let jwt;
let MongoClient;
try {
  const _d = await import('dotenv');
  const d = _d.default ?? _d;
  d.config();
  dotenv = d;
} catch (e) {
  // dotenv not installed — ignore for local demo
}

try {
  bcrypt = (await import('bcryptjs')).default;
} catch (e) {
  bcrypt = null;
}

try {
  jwt = (await import('jsonwebtoken')).default;
} catch (e) {
  jwt = null;
}

try {
  MongoClient = (await import('mongodb')).MongoClient;
} catch (e) {
  MongoClient = null;
}

const app = express();
const PORT = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFile = path.join(__dirname, 'server-data.json');


// MongoDB optional integration. If MONGO_URI is provided, the server will
// use MongoDB for persistence. Otherwise it falls back to file-backed store
// to preserve current demo/test behavior.
const MONGO_URI = process.env.MONGO_URI || null;
let mongoClient = null;
let mongoDb = null;
let useMongo = false;
async function initMongo() {
  if (!MONGO_URI) return;
  try {
    mongoClient = new MongoClient(MONGO_URI, { maxPoolSize: 10 });
    await mongoClient.connect();
    mongoDb = mongoClient.db(process.env.MONGO_DB_NAME || 'jansahyog');
    useMongo = true;
    console.log('Connected to MongoDB', process.env.MONGO_DB_NAME || 'jansahyog');
    try {
      // Seed collections if empty
      const usersCol = mongoDb.collection('users');
      const challengesCol = mongoDb.collection('challenges');
      const solutionsCol = mongoDb.collection('solutions');
      const teamsCol = mongoDb.collection('teams');
      const bookmarksCol = mongoDb.collection('bookmarks');
      const notificationsCol = mongoDb.collection('notifications');

      const usersCount = await usersCol.countDocuments();
      if (!usersCount) {
        await usersCol.insertMany(defaultUsers.map(u => ({ ...u })));
        console.log('Seeded users collection');
      }

      const challengesCount = await challengesCol.countDocuments();
      if (!challengesCount) {
        await challengesCol.insertMany(defaultChallenges.map(c => ({ ...c })));
        console.log('Seeded challenges collection');
      }

      const solutionsCount = await solutionsCol.countDocuments();
      if (!solutionsCount) {
        await solutionsCol.insertMany(defaultSolutions.map(s => ({ ...s })));
        console.log('Seeded solutions collection');
      }

      const teamsCount = await teamsCol.countDocuments();
      if (!teamsCount) {
        await teamsCol.insertMany(defaultTeams.map(t => ({ ...t })));
        console.log('Seeded teams collection');
      }

      const bmCount = await bookmarksCol.countDocuments();
      if (!bmCount) {
        await bookmarksCol.insertMany(defaultBookmarks.map(b => ({ ...b })));
        console.log('Seeded bookmarks collection');
      }

      const nCount = await notificationsCol.countDocuments();
      if (!nCount) {
        await notificationsCol.insertMany(defaultNotifications.map(n => ({ ...n })));
        console.log('Seeded notifications collection');
      }
    } catch (seedErr) {
      console.warn('Mongo seeding warning:', seedErr.message || seedErr);
    }
  } catch (err) {
    console.warn('MongoDB connection failed, falling back to file store:', err.message);
    useMongo = false;
  }
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Optional security and logging middleware (loaded dynamically)
let helmet = null;
let morgan = null;
let rateLimit = null;
try {
  helmet = (await import('helmet')).default;
  morgan = (await import('morgan')).default;
  rateLimit = (await import('express-rate-limit')).default;

  // Configure Helmet with a conservative CSP for production
  const helmetOptions = {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'wss:', 'https:'],
        fontSrc: ["'self'", 'https:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      }
    },
    crossOriginEmbedderPolicy: false
  };

  app.use(helmet(helmetOptions));
  app.use(morgan('combined'));

  // Global rate limiter (configurable via env)
  const globalMax = Number(process.env.RATE_LIMIT_MAX || 200);
  const globalWindow = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
  const globalLimiter = rateLimit({ windowMs: globalWindow, max: globalMax, standardHeaders: true, legacyHeaders: false });
  app.use(globalLimiter);

  // Auth route limiter
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many auth requests, try again later' }, standardHeaders: true, legacyHeaders: false });
  app.use('/api/auth', authLimiter);

} catch (e) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Required security/logging packages (helmet,morgan,express-rate-limit) are missing in production:', e.message || e);
    process.exit(1);
  }
  // optional packages missing — continue without them in development
}

// Simple JWT verification middleware (uses jwt if available). When Mongo
// and JWT are active we enforce Authorization: Bearer <token> on protected routes.
function requireAuth(req, res, next) {
  if (!jwt || !useMongo) return next();
  const auth = req.headers.authorization || '';
  const [, token] = auth.split(' ');
  if (!token) return res.status(401).json({ error: 'Authorization required' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.auth = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// File upload endpoint (if multer available) — stores in ./uploads and returns path
let multer = null;
try {
  multer = (await import('multer')).default;
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const storage = multer.diskStorage({ destination: uploadDir, filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g,'_')}`) });
  const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
  app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    // Basic file type whitelist
      const allowed = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/heic', 'image/heif', 'image/tiff',
      'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/3gpp', 'video/x-matroska', 'video/avi', 'video/mpeg'
    ];
    const mimetype = (req.file.mimetype || '').toLowerCase();
    const originalName = (req.file.originalname || '').toLowerCase();
    const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif', '.tif', '.tiff', '.mp4', '.mov', '.m4v', '.webm', '.avi', '.3gp', '.mkv'];
    const hasAllowedExt = allowedExt.some((ext) => originalName.endsWith(ext));
    if (!allowed.includes(mimetype) && !hasAllowedExt) {
      try { fs.unlinkSync(path.join(uploadDir, req.file.filename)); } catch (e) {}
      return res.status(400).json({ error: 'Unsupported file type' });
    }
    // respond with public path
    const publicPath = `/uploads/${req.file.filename}`;
    res.status(201).json({ filename: req.file.filename, url: publicPath });
  });
  // Serve uploads statically
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
} catch (e) {
  // multer not available — skip upload endpoint
}

const defaultUsers = [
  {
    id: 'u-citizen',
    fullName: 'V. Ramanjaneyulu',
    email: 'v.ramanjaneyulu@guntur.org',
    phone: '9440123456',
    role: 'CITIZEN',
    district: 'Bapatla',
    designation: 'Coastal Farmers Association'
  },
  {
    id: 'u-student',
    fullName: 'Akhil Varma',
    email: 'akhil.varma@andhrauniv.edu.in',
    role: 'STUDENT',
    institution: 'Andhra University College of Engineering',
    department: 'Electronics & Communication'
  },
  {
    id: 'u-faculty',
    fullName: 'Dr. Meera Nair',
    email: 'meera.nair@andhrauniv.edu.in',
    role: 'FACULTY',
    institution: 'Andhra University College of Engineering',
    department: 'Sustainable Systems Lab'
  },
  {
    id: 'u-industry',
    fullName: 'R. K. Sundaram',
    email: 'rk.sundaram@tatacsrfund.org',
    role: 'INDUSTRY',
    company: 'Tata Social Outreach and CSR Foundation',
    designation: 'VP - Technology Grants'
  },
  {
    id: 'u-admin',
    fullName: 'Admin JanSahyog',
    email: 'admin@jansahyog.in',
    role: 'ADMIN',
    institution: 'National Social Innovation Desk',
    designation: 'Platform Administrator'
  }
];

const defaultChallenges = [
  {
    id: 'CH-AP-BAPATLA-01',
    title: 'Continuous Dissolved Oxygen & Salinity Telemetry for Brackish Shrimp Ponds',
    category: 'Water Resources',
    district: 'Bapatla',
    mandal: 'Nizampatnam Coast',
    state: 'Andhra Pradesh',
    pincode: '522314',
    submittedBy: 'V. Ramanjaneyulu',
    submitterRole: 'Aquaculture Community Representative',
    submittedAt: '2026-09-20 10:30',
    status: 'OPEN_FOR_SOLUTIONS',
    problemBackground: 'Coastal aquaculture shrimp ponds in Nizampatnam face sudden midnight dissolved oxygen crashes below 2.5 mg/L and abrupt salinity shifts during tidal ingress. Without real-time telemetry, small-scale farmers face total pond mortality.',
    evidenceUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=800&q=80',
    evidenceType: 'image',
    evidenceFilename: 'nizampatnam_shrimp_pond_field.jpg',
    tensorVectorId: 'TT-VEC-BAP-091',
    embedding512: Array.from({ length: 512 }, (_, index) => Number(((index % 17) / 17).toFixed(5))),
    gps: { lat: 15.9082, lng: 80.6698, accuracy: 4.8 },
    aiAudit: {
      aiProbability: 1.4,
      authenticityScore: 98.6,
      verdict: 'GENUINE_CAMERA_CAPTURE',
      details: 'TwoTensors Model ViT-B/16: Verified authentic CMOS Bayer noise pattern.'
    },
    upvotes: 42,
    solutionsCount: 2
  }
];

const defaultSolutions = [
  {
    id: 'SOL-2026-01',
    challengeId: 'CH-AP-BAPATLA-01',
    leadInnovator: 'Akhil Varma',
    teamName: 'Team AquaSense',
    leadInstitution: 'Andhra University College of Engineering',
    title: 'AquaSense-LoRa: Dual-Wiper Optical DO & Turbidity Buoy with Sub-GHz Mesh',
    abstract: 'An autonomous floating buoy measuring dissolved oxygen and pH with self-cleaning motorized wipers to prevent algae fouling, transmitting telemetry over a 12km LoRa mesh to farmer handsets.',
    currentStage: 'Hardware Prototype',
    supportVotes: 44
  }
];

const defaultTeams = [];
const defaultBookmarks = [];
const defaultNotifications = [];

async function readStore() {
  try {
    if (useMongo && mongoDb) {
      // Read from Mongo collections
      const users = await mongoDb.collection('users').find({}).toArray();
      const challenges = await mongoDb.collection('challenges').find({}).sort({ submittedAt: -1 }).toArray();
      const solutions = await mongoDb.collection('solutions').find({}).sort({ id: -1 }).toArray();
      return { users: users.length ? users : defaultUsers, challenges: challenges.length ? challenges : defaultChallenges, solutions: solutions.length ? solutions : defaultSolutions };
    }

    if (!fs.existsSync(dataFile)) {
      const initial = {
        users: defaultUsers,
        challenges: defaultChallenges,
        solutions: defaultSolutions
      };
      fs.writeFileSync(dataFile, JSON.stringify(initial, null, 2));
      return initial;
    }

    const raw = fs.readFileSync(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      users: parsed.users || defaultUsers,
      challenges: parsed.challenges || defaultChallenges,
      solutions: parsed.solutions || defaultSolutions,
      teams: parsed.teams || defaultTeams,
      bookmarks: parsed.bookmarks || defaultBookmarks,
      notifications: parsed.notifications || defaultNotifications
    };
  } catch (error) {
    console.error('Failed to read store:', error);
    return { users: defaultUsers, challenges: defaultChallenges, solutions: defaultSolutions, teams: defaultTeams, bookmarks: defaultBookmarks, notifications: defaultNotifications };
  }
}

function writeStore(store) {
  try {
    if (useMongo && mongoDb) {
      // Write-through: replace collections with provided arrays (safe for demo)
      const u = mongoDb.collection('users');
      const c = mongoDb.collection('challenges');
      const s = mongoDb.collection('solutions');
      // simple replace strategy for demo; in production use upserts and proper schema
      u.deleteMany({});
      c.deleteMany({});
      s.deleteMany({});
      if (Array.isArray(store.users) && store.users.length) u.insertMany(store.users.map(x => ({ ...x })));
      if (Array.isArray(store.challenges) && store.challenges.length) c.insertMany(store.challenges.map(x => ({ ...x })));
      if (Array.isArray(store.solutions) && store.solutions.length) s.insertMany(store.solutions.map(x => ({ ...x })));
      // additional collections
      const t = mongoDb.collection('teams');
      const b = mongoDb.collection('bookmarks');
      const n = mongoDb.collection('notifications');
      t.deleteMany({});
      b.deleteMany({});
      n.deleteMany({});
      if (Array.isArray(store.teams) && store.teams.length) t.insertMany(store.teams.map(x => ({ ...x })));
      if (Array.isArray(store.bookmarks) && store.bookmarks.length) b.insertMany(store.bookmarks.map(x => ({ ...x })));
      if (Array.isArray(store.notifications) && store.notifications.length) n.insertMany(store.notifications.map(x => ({ ...x })));
      return;
    }

    fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('Failed to write store:', err);
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'JANSAHYOG', timestamp: new Date().toISOString() });
});

const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.post('/api/auth/login', (req, res) => {
  const { role, email, phone, password } = req.body || {};

  // If Mongo is enabled and email+password provided, attempt real auth
  if (useMongo && mongoDb && (email || phone)) {
    (async () => {
      try {
        const usersColl = mongoDb.collection('users');
        const query = {};
        if (email) query.email = { $regex: new RegExp(`^${String(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
        if (phone) query.phone = String(phone);
        if (role) query.role = role;
        const user = await usersColl.findOne(query);
        if (!user) return res.status(401).json({ error: 'Invalid credentials or role.' });

        // If stored user has `passwordHash`, require password
        if (user.passwordHash) {
          if (!password) return res.status(401).json({ error: 'Password required.' });
          const match = await bcrypt.compare(password, user.passwordHash);
          if (!match) return res.status(401).json({ error: 'Invalid credentials.' });

          const token = jwt.sign({ sub: user._id, role: user.role, email: user.email }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '8h' });
          const out = { ...user, token };
          delete out.passwordHash;
          return res.json(out);
        }

        // No password stored — return profile (demo compatibility)
        delete user.passwordHash;
        return res.json(user);
      } catch (err) {
        console.error('Auth error:', err);
        return res.status(500).json({ error: 'Auth failed.' });
      }
    })();
    return;
  }

  // Fallback: file-backed demo login (existing behaviour)
  (async () => {
    const store = await readStore();
    const users = store.users || [];
    const user = users.find((entry) => {
      if (role && entry.role !== role) return false;
      if (email && entry.email && entry.email.toLowerCase() === String(email).toLowerCase()) return true;
      if (phone && entry.phone && entry.phone === String(phone)) return true;
      return false;
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials or role.' });
    }

    return res.json(user);
  })();
  return;
});

// Optional register endpoint when Mongo is enabled
app.post('/api/auth/register', async (req, res) => {
  if (!useMongo || !mongoDb) return res.status(501).json({ error: 'Registration requires MongoDB backing.' });
  try {
    const { fullName, email, phone, password, role } = req.body || {};
    if (!email || !password || !fullName) return res.status(400).json({ error: 'Missing required fields.' });
    // basic validation
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(String(email))) return res.status(400).json({ error: 'Invalid email format.' });
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const usersColl = mongoDb.collection('users');
    const existing = await usersColl.findOne({ email: { $regex: new RegExp(`^${String(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    if (existing) return res.status(409).json({ error: 'Email already registered.' });
    const passwordHash = await bcrypt.hash(password, 10);
    const doc = { fullName, email, phone: phone || null, role: role || 'CITIZEN', createdAt: new Date().toISOString(), passwordHash };
    const r = await usersColl.insertOne(doc);
    const token = jwt.sign({ sub: r.insertedId.toString(), role: doc.role, email: doc.email }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '8h' });
    delete doc.passwordHash;
    return res.status(201).json({ ...doc, id: r.insertedId.toString(), token });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed.' });
  }
});

app.get('/api/users', async (req, res) => {
  const store = await readStore();
  res.json(store.users);
});

app.get('/api/challenges', async (req, res) => {
  // Supports query params: q (search), category, district, page, limit
  const q = (req.query.q || '').trim();
  const category = req.query.category || '';
  const district = req.query.district || '';
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 12)));

  if (useMongo && mongoDb) {
    const col = mongoDb.collection('challenges');
    const filter = {};
    if (category) filter.category = category;
    if (district) filter.district = district;
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [ { title: re }, { problemBackground: re }, { submittedBy: re }, { district: re } ];
    }
    const total = await col.countDocuments(filter);
    const items = await col.find(filter).sort({ submittedAt: -1 }).skip((page - 1) * limit).limit(limit).toArray();
    return res.json({ items, total, page, limit });
  }

  const store = await readStore();
  let list = store.challenges || [];
  if (category) list = list.filter(x => x.category === category);
  if (district) list = list.filter(x => x.district === district);
  if (q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    list = list.filter(x => re.test(x.title) || re.test(x.problemBackground) || re.test(x.submittedBy) || re.test(x.district));
  }
  const total = list.length;
  const start = (page - 1) * limit;
  const items = list.slice(start, start + limit);
  res.json({ items, total, page, limit });
});

app.post('/api/challenges', async (req, res) => {
  const body = req.body || {};
  const store = await readStore();
  // Require auth when Mongo/JWT active
  if (useMongo && jwt) {
    // ensure token is present and valid
    const auth = req.headers.authorization || '';
    const [, token] = auth.split(' ');
    if (!token) return res.status(401).json({ error: 'Authorization required' });
    try { jwt.verify(token, process.env.JWT_SECRET || 'dev-secret'); } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
  }
  const newChallenge = {
    id: body.id || `CH-${Date.now()}`,
    title: body.title || 'Untitled challenge',
    category: body.category || 'Water Resources',
    district: body.district || 'Bapatla',
    mandal: body.mandal || 'Nizampatnam Coast',
    state: body.state || 'Andhra Pradesh',
    pincode: body.pincode || '522314',
    submittedBy: body.submittedBy || 'Anonymous Citizen',
    submitterRole: body.submitterRole || 'Citizen Submitter',
    submittedAt: body.submittedAt || new Date().toISOString().replace('T', ' ').slice(0, 16),
    status: body.status || 'OPEN_FOR_SOLUTIONS',
    problemBackground: body.problemBackground || 'No description provided.',
    evidenceUrl: body.evidenceUrl || '',
    evidenceType: body.evidenceType || 'image',
    evidenceFilename: body.evidenceFilename || 'evidence.jpg',
    tensorVectorId: body.tensorVectorId || `TT-${Date.now()}`,
    embedding512: body.embedding512 || Array.from({ length: 512 }, () => 0.1),
    gps: body.gps || { lat: 15.9, lng: 80.6, accuracy: 5 },
    aiAudit: body.aiAudit || {
      aiProbability: 1.5,
      authenticityScore: 98.5,
      verdict: 'GENUINE_CAMERA_CAPTURE'
    },
    upvotes: Number(body.upvotes || 1),
    solutionsCount: Number(body.solutionsCount || 0)
  };

  // simple input validation
  if (!newChallenge.title || String(newChallenge.title).length < 6) return res.status(400).json({ error: 'Title is required (min 6 chars).' });
  if (!newChallenge.problemBackground || String(newChallenge.problemBackground).length < 10) return res.status(400).json({ error: 'Problem background required (min 10 chars).' });

  // Persist depending on store
  if (useMongo && mongoDb) {
    const col = mongoDb.collection('challenges');
    await col.insertOne(newChallenge);
    res.status(201).json(newChallenge);
    return;
  }

  store.challenges = [newChallenge, ...store.challenges];
  writeStore(store);
  res.status(201).json(newChallenge);
});

app.get('/api/solutions', async (req, res) => {
  const store = await readStore();
  res.json(store.solutions);
});

// Teams endpoints
app.get('/api/teams', async (req, res) => {
  const store = await readStore();
  res.json(store.teams || []);
});

app.post('/api/teams', async (req, res) => {
  const body = req.body || {};
  if (useMongo && jwt) {
    const auth = req.headers.authorization || '';
    const [, token] = auth.split(' ');
    if (!token) return res.status(401).json({ error: 'Authorization required' });
    try { jwt.verify(token, process.env.JWT_SECRET || 'dev-secret'); } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
  }

  const store = await readStore();
  const newTeam = {
    id: body.id || `TEAM-${Date.now()}`,
    name: body.name || 'Unnamed Team',
    members: body.members || [],
    institution: body.institution || null,
    projectFor: body.projectFor || null,
    createdAt: new Date().toISOString()
  };

  if (useMongo && mongoDb) {
    await mongoDb.collection('teams').insertOne(newTeam);
    res.status(201).json(newTeam);
    return;
  }

  store.teams = [newTeam, ...(store.teams || [])];
  writeStore(store);
  res.status(201).json(newTeam);
});

// Bookmarks
app.get('/api/bookmarks', async (req, res) => {
  const store = await readStore();
  const userId = req.query.userId;
  const list = store.bookmarks || [];
  if (userId) return res.json(list.filter(b => b.userId === userId));
  res.json(list);
});

app.post('/api/bookmarks', async (req, res) => {
  const body = req.body || {};
  if (!body.userId || !body.challengeId) return res.status(400).json({ error: 'userId and challengeId required' });
  const store = await readStore();
  const bookmark = { id: `BM-${Date.now()}`, userId: body.userId, challengeId: body.challengeId, createdAt: new Date().toISOString() };
  if (useMongo && mongoDb) {
    await mongoDb.collection('bookmarks').insertOne(bookmark);
    res.status(201).json(bookmark);
    return;
  }
  store.bookmarks = [bookmark, ...(store.bookmarks || [])];
  writeStore(store);
  res.status(201).json(bookmark);
});

// Notifications
app.get('/api/notifications', async (req, res) => {
  const store = await readStore();
  const userId = req.query.userId;
  const list = store.notifications || [];
  if (userId) return res.json(list.filter(n => n.userId === userId));
  res.json(list);
});

app.post('/api/notifications', async (req, res) => {
  const body = req.body || {};
  if (!body.userId || !body.message) return res.status(400).json({ error: 'userId and message required' });
  const store = await readStore();
  const note = { id: `NT-${Date.now()}`, userId: body.userId, message: body.message, data: body.data || null, read: false, createdAt: new Date().toISOString() };
  if (useMongo && mongoDb) {
    await mongoDb.collection('notifications').insertOne(note);
    res.status(201).json(note);
    return;
  }
  store.notifications = [note, ...(store.notifications || [])];
  writeStore(store);
  res.status(201).json(note);
});

app.post('/api/solutions', async (req, res) => {
  const body = req.body || {};
  const store = await readStore();
  if (useMongo && jwt) {
    const auth = req.headers.authorization || '';
    const [, token] = auth.split(' ');
    if (!token) return res.status(401).json({ error: 'Authorization required' });
    try { jwt.verify(token, process.env.JWT_SECRET || 'dev-secret'); } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
  }
  const newSolution = {
    id: body.id || `SOL-${Date.now()}`,
    challengeId: body.challengeId || 'CH-AP-BAPATLA-01',
    leadInnovator: body.leadInnovator || 'Anonymous Team',
    teamName: body.teamName || 'Anonymous Research Team',
    leadInstitution: body.leadInstitution || 'University',
    title: body.title || 'New solution',
    abstract: body.abstract || 'Solution description',
    currentStage: body.currentStage || 'Concept Intake',
    supportVotes: Number(body.supportVotes || 0)
  };

  // validation
  if (!newSolution.challengeId) return res.status(400).json({ error: 'challengeId required.' });
  if (!newSolution.title || String(newSolution.title).length < 3) return res.status(400).json({ error: 'Solution title required (min 3 chars).' });

  if (useMongo && mongoDb) {
    const col = mongoDb.collection('solutions');
    await col.insertOne(newSolution);
    res.status(201).json(newSolution);
    return;
  }

  store.solutions = [newSolution, ...store.solutions];
  writeStore(store);
  res.status(201).json(newSolution);
});

// Initialize optional Mongo (non-blocking) and then start server
(async () => {
  await initMongo();
  // In production allow the app to run with the file-backed fallback store.
  // MongoDB and a JWT secret are optional for a free deployment/demo mode.
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'dev-secret';
      console.warn('JWT_SECRET not set; using fallback for production demo mode.');
    }
    app.set('trust proxy', 1);
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`JANSAHYOG backend running on http://0.0.0.0:${PORT}`);
    if (useMongo) console.log('MongoDB persistent store active.');
    else console.log('File-backed store active (demo mode).');
  });
})();
