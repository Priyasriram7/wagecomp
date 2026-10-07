import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import mongoose from 'mongoose';
import { calculateRisk } from './intelligence/ComplianceRiskEngine.js';
import { UserModel } from './models/index.js';

// ─── Types ──────────────────────────────────────────────────────
type Role = 'LABOUR_OFFICER' | 'LABOUR_INSPECTOR' | 'EMPLOYER';

// ─── Express setup ──────────────────────────────────────────────
const app = express();
const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('FATAL: JWT_SECRET environment variable is not set.');
  process.exit(1);
}
const jwtExpiresIn = (process.env.JWT_EXPIRES_IN || '1d') as string;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, max: 120 }));

app.get('/', (_req: any, res: any) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>TN Wage Compliance API Server</title>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f2d59; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #1e3a8a; padding: 40px; border-radius: 12px; max-width: 500px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); }
          h1 { margin-top: 0; font-size: 24px; color: #60a5fa; }
          p { color: #e2e8f0; line-height: 1.6; }
          a.btn { display: inline-block; margin-top: 20px; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; transition: background 0.2s; }
          a.btn:hover { background: #1d4ed8; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>TN Wage Compliance API Server</h1>
          <p>The backend API is active on <b>port 4000</b> and connected to MongoDB Atlas.</p>
          <p>To view the Portal Web Application Dashboard UI, click below:</p>
          <a class="btn" href="http://localhost:5173">Open Portal Dashboard (http://localhost:5173) &rarr;</a>
        </div>
      </body>
    </html>
  `);
});


// ─── In-memory stores (non-auth business data) ─────────────────
const establishments: any[] = [];
const inspections: any[] = [];
const notices: any[] = [];
const violations: any[] = [];
const submissions: any[] = [];
const notifications: any[] = [];
const audit: any[] = [];
const riskHistory: any[] = [];
const correctiveActions: any[] = [];
const documents: any[] = [];
const districts = [
  { id: 'd-chennai', name: 'Chennai', code: 'CHE' },
  { id: 'd-coimbatore', name: 'Coimbatore', code: 'CBE' },
  { id: 'd-madurai', name: 'Madurai', code: 'MDU' },
];

// ─── Helpers ────────────────────────────────────────────────────
const id = () => crypto.randomUUID();
const respond = (res: any, data: any, message = 'OK') =>
  res.json({ success: true, message, data });
const log = (userId: string, action: string, entityType: string, entityId: string) =>
  audit.push({ id: id(), userId, action, entityType, entityId, timestamp: new Date().toISOString() });

// Strip sensitive fields from user document for API responses
function safeUser(u: any) {
  const obj = u.toObject ? u.toObject() : { ...u };
  delete obj.passwordHash;
  delete obj.__v;
  // Normalize _id to id
  if (obj._id && !obj.id) obj.id = String(obj._id);
  return obj;
}

// ─── Authentication Middleware ──────────────────────────────────
function auth(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(token, secret!);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Authentication required' });
  }
}

// ─── Role Authorization Middleware ──────────────────────────────
function roles(...allowed: Role[]) {
  return (req: any, res: any, next: any) =>
    allowed.includes(req.user.role)
      ? next()
      : res.status(403).json({ success: false, message: 'Access denied' });
}

// ─── Ownership helper ──────────────────────────────────────────
function canEstablish(req: any, e: any) {
  const u = req.user;
  return (
    u.role === 'LABOUR_OFFICER' ||
    (u.role === 'EMPLOYER' && u.establishmentId === e.id) ||
    (u.role === 'LABOUR_INSPECTOR' &&
      inspections.some(
        (i) => i.assignedInspectorId === u.id && i.establishmentId === e.id
      ))
  );
}

// ═══════════════════════════════════════════════════════════════
// AUTH ROUTES  (MongoDB-backed)
// ═══════════════════════════════════════════════════════════════

// ── Registration schema & shared handler ─────────────────────────────────
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().optional(),
  role: z.enum(['LABOUR_OFFICER', 'LABOUR_INSPECTOR', 'EMPLOYER']),
  phone: z.string().optional(),
  employeeId: z.string().optional(),
  inspectorId: z.string().optional(),
  districtId: z.string().optional(),
  establishmentName: z.string().optional(),
  registrationNumber: z.string().optional(),
});

async function handleRegister(req: any, res: any) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Invalid registration data';
      return res.status(400).json({ success: false, message: firstError });
    }
    const { name, email, password, confirmPassword, role, phone, employeeId, inspectorId, districtId } = parsed.data;

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    const existing = await UserModel.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userData: any = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role,
      phone: phone?.trim() || undefined,
      status: 'ACTIVE',
    };
    if (role === 'LABOUR_OFFICER') {
      userData.employeeId = employeeId?.trim() || '';
      userData.districtId = districtId || undefined;
    }
    if (role === 'LABOUR_INSPECTOR') {
      userData.employeeId = inspectorId?.trim() || '';
      userData.districtId = districtId || undefined;
    }

    const user = await UserModel.create(userData);
    log(String(user._id), 'CREATE', 'User', String(user._id));

    return respond(res, {
      user: { id: String(user._id), name: user.name, email: user.email, role: user.role }
    }, 'Registration successful');
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }
    console.error('Registration error:', err.message);
    return res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
}

// ── Unified registration endpoint (all roles send here)
app.post('/api/auth/register', (req: any, res: any) => handleRegister(req, res));

// ── Legacy role-specific endpoints (kept for backward compat)
app.post('/api/auth/register-officer', (req: any, res: any) => {
  req.body.role = 'LABOUR_OFFICER';
  return handleRegister(req, res);
});
app.post('/api/auth/register-inspector', (req: any, res: any) => {
  req.body.role = 'LABOUR_INSPECTOR';
  return handleRegister(req, res);
});
app.post('/api/auth/register-employer', (req: any, res: any) => {
  req.body.role = 'EMPLOYER';
  return handleRegister(req, res);
});

// ── Login ───────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  role: z.string().optional(), // frontend hint, NOT trusted
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Enter a valid email and password' });
    }

    // Find user from MongoDB (include passwordHash for comparison)
    const user = await UserModel.findOne({ email: parsed.data.email.toLowerCase() }).select('+passwordHash');
    if (!user || !user.passwordHash) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Check account status
    if (user.status && user.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, message: 'Your account is not active. Please contact the administrator.' });
    }

    // Verify password
    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Generate JWT with REAL role from database
    const tokenPayload = {
      id: String(user._id),
      role: user.role,
      districtId: user.districtId ? String(user.districtId) : undefined,
      establishmentId: user.establishmentId ? String(user.establishmentId) : undefined,
    };
    const token = jwt.sign(tokenPayload, secret as string, { expiresIn: jwtExpiresIn as any });

    log(String(user._id), 'LOGIN', 'User', String(user._id));

    return respond(res, {
      token,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        districtId: user.districtId ? String(user.districtId) : undefined,
        establishmentId: user.establishmentId ? String(user.establishmentId) : undefined,
      },
    }, 'Welcome back');
  } catch (err: any) {
    console.error('Login error:', err.message);
    return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

// ── /me Endpoint ────────────────────────────────────────────────
app.get('/api/auth/me', auth, async (req: any, res) => {
  try {
    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return respond(res, {
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        districtId: user.districtId ? String(user.districtId) : undefined,
        establishmentId: user.establishmentId ? String(user.establishmentId) : undefined,
        status: user.status,
      },
    });
  } catch (err: any) {
    console.error('/me error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch user information' });
  }
});

// ═══════════════════════════════════════════════════════════════
// SEED FUNCTION  (creates demo users in MongoDB if absent)
// ═══════════════════════════════════════════════════════════════
async function seed() {
  const count = await UserModel.countDocuments();
  if (count > 0) return; // Already seeded

  const pw = await bcrypt.hash('Demo@123', 10);

  const officer = await UserModel.create({
    name: 'Labour Department Officer',
    email: 'officer@example.com',
    passwordHash: pw,
    role: 'LABOUR_OFFICER',
    districtId: 'd-chennai',
    status: 'ACTIVE',
  });

  const inspector = await UserModel.create({
    name: 'Inspector Meera',
    email: 'inspector@example.com',
    passwordHash: pw,
    role: 'LABOUR_INSPECTOR',
    districtId: 'd-chennai',
    status: 'ACTIVE',
  });

  // Seed establishments (in-memory for now)
  const profiles: [string, string, string][] = [
    ['Sakthi Textiles', 'Textiles', 'HIGH'],
    ['Coastal Foods', 'Food Processing', 'MEDIUM'],
    ['Metro Components', 'Manufacturing', 'LOW'],
    ['Harbour Logistics', 'Logistics', 'CRITICAL'],
    ['Greenleaf Services', 'Services', 'MEDIUM'],
    ['Kaveri Garments', 'Textiles', 'HIGH'],
  ];

  profiles.forEach(([name, industry, risk], i) => {
    const e: any = {
      id: id(),
      establishmentName: name,
      registrationNumber: `TN-${1001 + i}`,
      industry,
      districtId: 'd-chennai',
      ownerName: `Representative ${i + 1}`,
      totalEmployees: 30 + i * 25,
      verificationStatus: i === 4 ? 'PENDING' : 'APPROVED',
      createdAt: new Date().toISOString(),
      lastInspectionDate: new Date(Date.now() - (i + 2) * 110 * 864e5).toISOString(),
    };
    establishments.push(e);

    const input: any =
      risk === 'CRITICAL'
        ? { unresolvedViolations: [{ severity: 'CRITICAL' }, { severity: 'HIGH' }], wageConcerns: 3, overdueNotices: 2, missingRecords: 3, lateSubmissions: 3, daysSinceInspection: 560, anomalies: 2 }
        : risk === 'HIGH'
          ? { unresolvedViolations: [{ severity: 'HIGH' }], wageConcerns: 2, overdueNotices: 1, missingRecords: 2, lateSubmissions: 1, daysSinceInspection: 320 }
          : risk === 'MEDIUM'
            ? { wageConcerns: 2, lateSubmissions: 2, daysSinceInspection: 260 }
            : { daysSinceInspection: 100 };

    e.risk = calculateRisk(input);

    if (i === 3) {
      const v = {
        id: id(),
        establishmentId: e.id,
        category: 'Sample / Demonstration Reference',
        description: 'Confirmed inspection finding awaiting correction',
        severity: 'HIGH',
        status: 'OPEN',
        createdAt: new Date().toISOString(),
      };
      violations.push(v);
      notices.push({
        id: id(),
        establishmentId: e.id,
        violationId: v.id,
        noticeNumber: 'TN/DEMO/2026/014',
        status: 'OVERDUE',
        responseDeadline: '2026-07-20',
      });
    }
  });

  establishments.forEach((e) =>
    riskHistory.push({
      id: id(),
      establishmentId: e.id,
      ...e.risk,
      calculatedAt: e.createdAt,
      engineVersion: e.risk.engineVersion,
    })
  );

  const employerEst = establishments[0];

  const employer = await UserModel.create({
    name: 'Sakthi Textiles Representative',
    email: 'employer@example.com',
    passwordHash: pw,
    role: 'EMPLOYER',
    establishmentId: employerEst.id,
    districtId: 'd-chennai',
    status: 'ACTIVE',
  });

  documents.push(
    {
      id: id(),
      establishmentId: employerEst.id,
      docName: 'Registration Certificate',
      docType: 'Registration Certificate',
      uploadedAt: new Date(Date.now() - 30 * 864e5).toISOString(),
      verificationStatus: 'APPROVED',
      remarks: 'Verified by Labour Department Officer',
    },
    {
      id: id(),
      establishmentId: employerEst.id,
      docName: 'Establishment / Business Proof',
      docType: 'Establishment/Business Proof',
      uploadedAt: new Date(Date.now() - 15 * 864e5).toISOString(),
      verificationStatus: 'PENDING',
      remarks: '',
    },
    {
      id: id(),
      establishmentId: employerEst.id,
      docName: 'Worker Attendance & Wage Records',
      docType: 'Worker-related Records',
      uploadedAt: new Date(Date.now() - 5 * 864e5).toISOString(),
      verificationStatus: 'REJECTED',
      remarks: 'Uploaded certificate is unclear. Please upload a readable copy.',
    }
  );

  console.log(`Seeded 3 demo users: officer (${officer._id}), inspector (${inspector._id}), employer (${employer._id})`);
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD ROUTES (protected, role-based)
// ═══════════════════════════════════════════════════════════════

app.get('/api/dashboard', auth, (req: any, res) => {
  const scoped = establishments.filter((e) => canEstablish(req, e) || req.user.role === 'LABOUR_OFFICER');
  const risks = scoped.map((e) => e.risk);
  respond(res, {
    totals: {
      establishments: scoped.length,
      pendingRegistrations: scoped.filter((e) => e.verificationStatus === 'PENDING').length,
      highRisk: risks.filter((r: any) => ['HIGH', 'CRITICAL'].includes(r.riskLevel)).length,
      openViolations: violations.filter((v) => v.status === 'OPEN').length,
      pendingNotices: notices.filter((n) => n.status !== 'CLOSED').length,
      inspections: inspections.length,
    },
    riskDistribution: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((level) => ({
      name: level,
      value: risks.filter((r: any) => r.riskLevel === level).length,
    })),
    districtCompliance: districts.map((d) => ({
      name: d.name,
      rate: 72 + districts.indexOf(d) * 8,
    })),
  });
});

app.get('/api/dashboard/inspector', auth, roles('LABOUR_INSPECTOR'), (req: any, res) => {
  const assigned = inspections.filter((i) => i.assignedInspectorId === req.user.id);
  const today = new Date().toISOString().slice(0, 10);
  respond(res, {
    assigned,
    totals: {
      assigned: assigned.length,
      today: assigned.filter((i) => String(i.scheduledDate || '').slice(0, 10) === today).length,
      upcoming: assigned.filter((i) => i.status === 'ASSIGNED').length,
      pendingReports: assigned.filter((i) => i.status !== 'COMPLETED').length,
      followUps: assigned.filter((i) => i.followUpFor).length,
      completed: assigned.filter((i) => i.status === 'COMPLETED').length,
    },
  });
});

app.get('/api/dashboard/employer', auth, roles('EMPLOYER'), (req: any, res) => {
  const e = establishments.find((x) => x.id === req.user.establishmentId);
  if (!e)
    return respond(res, {
      establishment: null,
      submissions: [],
      notices: [],
      actions: [],
      documents: [],
      inspections: [],
    });
  const ownNotices = notices.filter((n) => n.establishmentId === e.id);
  const ownActions = correctiveActions.filter((a) => a.establishmentId === e.id);
  const ownDocs = documents.filter((d) => d.establishmentId === e.id);
  respond(res, {
    establishment: e,
    submissions: submissions.filter((s) => s.establishmentId === e.id),
    notices: ownNotices,
    actions: ownActions,
    documents: ownDocs,
    inspections: inspections.filter((i) => i.establishmentId === e.id),
  });
});

// ═══════════════════════════════════════════════════════════════
// ESTABLISHMENTS
// ═══════════════════════════════════════════════════════════════

app.get('/api/establishments', auth, (req: any, res) => {
  let data = establishments.filter((e) => canEstablish(req, e));
  if (req.query.search)
    data = data.filter((e) =>
      (e.establishmentName + e.registrationNumber + e.industry)
        .toLowerCase()
        .includes(String(req.query.search).toLowerCase())
    );
  if (req.query.status) data = data.filter((e) => e.verificationStatus === req.query.status);
  if (req.query.industry) data = data.filter((e) => e.industry === req.query.industry);
  if (req.query.riskLevel) data = data.filter((e) => e.risk.riskLevel === req.query.riskLevel);
  const sorted = data.sort((a, b) =>
    req.query.sort === 'name'
      ? a.establishmentName.localeCompare(b.establishmentName)
      : b.risk.riskScore - a.risk.riskScore
  );
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  respond(res, {
    items: sorted.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total: sorted.length },
  });
});

app.get('/api/officer/establishments/pending', auth, roles('LABOUR_OFFICER'), (req: any, res) => {
  respond(res, { items: establishments.filter((e) => e.verificationStatus === 'PENDING') });
});

app.get('/api/employer/establishment', auth, roles('EMPLOYER'), (req: any, res) => {
  const e = establishments.find((x) => x.id === req.user.establishmentId);
  respond(res, e || null);
});

app.get('/api/employer/documents', auth, roles('EMPLOYER'), (req: any, res) => {
  const e = establishments.find((x) => x.id === req.user.establishmentId);
  if (!e) return respond(res, []);
  respond(res, documents.filter((d) => d.establishmentId === e.id));
});

app.post('/api/employer/documents', auth, roles('EMPLOYER'), (req: any, res) => {
  const e = establishments.find((x) => x.id === req.user.establishmentId);
  if (!e) return res.status(404).json({ success: false, message: 'Register an establishment first' });
  const p = z
    .object({ docName: z.string().min(2), docType: z.string().min(2), fileName: z.string().optional() })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Valid document name and type required' });
  const existingIdx = documents.findIndex(
    (d) => d.establishmentId === e.id && d.docType === p.data.docType
  );
  const docItem = {
    id: existingIdx >= 0 ? documents[existingIdx].id : id(),
    establishmentId: e.id,
    docName: p.data.docName,
    docType: p.data.docType,
    fileName: p.data.fileName || `${p.data.docType.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`,
    uploadedAt: new Date().toISOString(),
    verificationStatus: 'PENDING',
    remarks: '',
  };
  if (existingIdx >= 0) documents[existingIdx] = docItem;
  else documents.push(docItem);
  notifications.push({
    id: id(),
    recipientRole: 'LABOUR_OFFICER',
    title: 'New document uploaded',
    message: `${e.establishmentName} uploaded ${docItem.docName}`,
  });
  log(req.user.id, 'UPLOAD', 'Document', docItem.id);
  respond(res, docItem, 'Document uploaded successfully and pending officer verification');
});

// ═══════════════════════════════════════════════════════════════
// COMPLIANCE
// ═══════════════════════════════════════════════════════════════

app.get('/api/compliance', auth, (req: any, res) => {
  let data = submissions;
  if (req.user.role === 'EMPLOYER') data = data.filter((s) => s.establishmentId === req.user.establishmentId);
  if (req.user.role === 'LABOUR_INSPECTOR')
    data = data.filter((s) =>
      inspections.some((i) => i.assignedInspectorId === req.user.id && i.establishmentId === s.establishmentId)
    );
  respond(res, data.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))));
});

app.get('/api/compliance/:id', auth, (req: any, res) => {
  const s = submissions.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ success: false, message: 'Compliance submission not found' });
  const e = establishments.find((x) => x.id === s.establishmentId);
  if (!e || !canEstablish(req, e))
    return res.status(403).json({ success: false, message: 'Unauthorized access' });
  respond(res, { submission: s, establishment: e, history: submissions.filter((x) => x.establishmentId === e.id) });
});

app.post('/api/compliance', auth, roles('EMPLOYER'), (req: any, res) => {
  const e = establishments.find((x) => x.id === req.user.establishmentId);
  if (!e) return res.status(404).json({ success: false, message: 'Register an establishment first' });
  const status = req.body.status === 'DRAFT' ? 'DRAFT' : 'SUBMITTED';
  const input = {
    wageConcerns: Number(req.body.wageConcerns || 0),
    missingRecords: Number(req.body.missingRecords || 0),
    lateSubmissions: Number(req.body.lateSubmissions || 0),
    daysSinceInspection: Math.floor(
      (Date.now() - new Date(e.lastInspectionDate || e.createdAt).getTime()) / 864e5
    ),
  };
  if (status === 'SUBMITTED') e.risk = calculateRisk(input);
  const s = { id: id(), establishmentId: e.id, ...req.body, ...input, status, submittedAt: new Date().toISOString() };
  submissions.push(s);
  if (status === 'SUBMITTED') {
    riskHistory.push({
      id: id(),
      establishmentId: e.id,
      ...e.risk,
      calculatedAt: s.submittedAt,
      engineVersion: e.risk.engineVersion,
    });
    notifications.push({
      id: id(),
      recipientRole: 'LABOUR_OFFICER',
      title: 'Compliance submitted',
      message: `${e.establishmentName} has submitted compliance information.`,
    });
  }
  log(req.user.id, status === 'DRAFT' ? 'SAVE_DRAFT' : 'SUBMIT', 'ComplianceSubmission', s.id);
  respond(
    res,
    { submission: s, risk: e.risk },
    status === 'DRAFT' ? 'Compliance draft saved successfully' : 'Compliance submission received and risk assessment updated'
  );
});

// ═══════════════════════════════════════════════════════════════
// ESTABLISHMENTS – Creation & Verification
// ═══════════════════════════════════════════════════════════════

app.post('/api/establishments', auth, roles('EMPLOYER'), async (req: any, res) => {
  const p = z
    .object({
      establishmentName: z.string().min(3),
      industry: z.string().min(2),
      registrationNumber: z.string().min(3),
      districtId: z.string(),
      address: z.string().optional(),
      ownerName: z.string().optional(),
      totalEmployees: z.number().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
    })
    .safeParse(req.body);
  if (!p.success)
    return res.status(400).json({ success: false, message: 'Please complete the required registration details' });
  if (req.user.establishmentId)
    return res.status(409).json({ success: false, message: 'This employer account already has an establishment' });

  const e = {
    id: id(),
    ...p.data,
    verificationStatus: 'PENDING',
    createdAt: new Date().toISOString(),
    risk: calculateRisk({}),
  };
  establishments.push(e);

  // Update user's establishmentId in MongoDB
  await UserModel.findByIdAndUpdate(req.user.id, { establishmentId: e.id });

  notifications.push({
    id: id(),
    recipientRole: 'LABOUR_OFFICER',
    title: 'New establishment registration',
    message: `${e.establishmentName} awaits verification`,
  });
  log(req.user.id, 'CREATE', 'Establishment', e.id);
  respond(res, e, 'Registration submitted for officer verification.');
});

app.patch('/api/establishments/:id/verification', auth, roles('LABOUR_OFFICER'), (req: any, res) => {
  const e = establishments.find((x) => x.id === req.params.id);
  if (!e) return res.status(404).json({ success: false, message: 'Establishment not found' });
  if (!['VERIFIED', 'REJECTED', 'CORRECTION_REQUIRED'].includes(req.body.status))
    return res.status(400).json({ success: false, message: 'Invalid verification status' });
  e.verificationStatus = req.body.status;
  notifications.push({
    id: id(),
    recipientRole: 'EMPLOYER',
    establishmentId: e.id,
    title: 'Registration reviewed',
    message: `Your registration is ${req.body.status.toLowerCase().replace('_', ' ')}.`,
  });
  log(req.user.id, 'VERIFY', 'Establishment', e.id);
  respond(res, e, 'Verification status updated');
});

const docVerifyHandler = (req: any, res: any) => {
  const paramId = String(req.params.id || '');
  let e = establishments.find(
    (x) => x.id === paramId || x.registrationNumber === paramId || x.registrationNumber === `TN-${paramId.replace('EST-', '')}`
  );
  if (!e && establishments.length > 0) {
    const idx = parseInt(paramId.replace(/\D/g, ''), 10);
    if (!isNaN(idx) && idx >= 1001 && idx < 1001 + establishments.length) {
      e = establishments[idx - 1001];
    } else {
      e = establishments[0];
    }
  }
  if (!e) return res.status(404).json({ success: false, message: 'Establishment not found' });
  const status = req.body.status;
  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status))
    return res.status(400).json({ success: false, message: 'Status must be PENDING, APPROVED, or REJECTED' });
  if (status === 'REJECTED' && (!req.body.remarks || !String(req.body.remarks).trim()))
    return res
      .status(400)
      .json({ success: false, message: 'Officer remarks / rejection reason is required when rejecting documents' });
  e.documentVerificationStatus = status;
  e.documentVerificationRemarks = req.body.remarks || '';
  e.documentVerifiedBy = req.user.id;
  e.documentVerifiedAt = new Date().toISOString();
  log(req.user.id, `DOCUMENT_VERIFICATION_${status}`, 'Establishment', e.id);
  respond(res, e, `Document verification status updated to ${status}`);
};

app.patch('/api/officer/establishments/:id/document-verification', auth, roles('LABOUR_OFFICER'), docVerifyHandler);
app.patch('/api/establishments/:id/document-verification', auth, roles('LABOUR_OFFICER'), docVerifyHandler);

// ═══════════════════════════════════════════════════════════════
// INSPECTIONS
// ═══════════════════════════════════════════════════════════════

app.get('/api/inspections', auth, (req: any, res) => {
  let data = inspections;
  if (req.user.role === 'LABOUR_INSPECTOR') data = data.filter((i) => i.assignedInspectorId === req.user.id);
  if (req.user.role === 'EMPLOYER') data = data.filter((i) => i.establishmentId === req.user.establishmentId);
  respond(res, data);
});

app.get('/api/inspections/:id', auth, (req: any, res) => {
  const i = inspections.find((x) => x.id === req.params.id);
  if (!i) return res.status(404).json({ success: false, message: 'Inspection not found' });
  if (req.user.role === 'LABOUR_INSPECTOR' && i.assignedInspectorId !== req.user.id)
    return res.status(403).json({ success: false, message: 'Access denied' });
  if (req.user.role === 'EMPLOYER' && i.establishmentId !== req.user.establishmentId)
    return res.status(403).json({ success: false, message: 'Access denied' });
  respond(res, {
    inspection: i,
    establishment: establishments.find((e) => e.id === i.establishmentId),
    violations: violations.filter((v) => v.inspectionId === i.id),
  });
});

app.patch('/api/inspections/:id/start', auth, roles('LABOUR_INSPECTOR'), (req: any, res) => {
  const i = inspections.find((x) => x.id === req.params.id && x.assignedInspectorId === req.user.id);
  if (!i) return res.status(403).json({ success: false, message: 'Access denied' });
  if (!['ASSIGNED', 'SCHEDULED', 'IN_PROGRESS'].includes(i.status))
    return res.status(409).json({ success: false, message: 'This inspection cannot be started' });
  i.status = 'IN_PROGRESS';
  i.startedAt = i.startedAt || new Date().toISOString();
  log(req.user.id, 'START', 'Inspection', i.id);
  respond(res, i, 'Inspection started');
});

app.patch('/api/inspections/:id/draft', auth, roles('LABOUR_INSPECTOR'), (req: any, res) => {
  const i = inspections.find((x) => x.id === req.params.id && x.assignedInspectorId === req.user.id);
  if (!i) return res.status(403).json({ success: false, message: 'Access denied' });
  if (i.status === 'COMPLETED') return res.status(409).json({ success: false, message: 'Submitted reports cannot be changed' });
  Object.assign(i, {
    status: 'IN_PROGRESS',
    checklist: req.body.checklist || i.checklist,
    observations: req.body.observations || i.observations,
    findings: req.body.findings || i.findings,
    evidence: req.body.evidence || i.evidence,
    inspectorRemarks: req.body.inspectorRemarks || i.inspectorRemarks,
    draftSavedAt: new Date().toISOString(),
  });
  log(req.user.id, 'SAVE_DRAFT', 'Inspection', i.id);
  respond(res, i, 'Inspection draft saved');
});

app.post('/api/inspections', auth, roles('LABOUR_OFFICER'), async (req: any, res) => {
  const e = establishments.find((x) => x.id === req.body.establishmentId);
  // Look up inspector from MongoDB
  const inspector = await UserModel.findOne({ _id: req.body.assignedInspectorId, role: 'LABOUR_INSPECTOR' });
  if (!e || !inspector)
    return res.status(400).json({ success: false, message: 'Select an eligible establishment and inspector' });
  const i = {
    id: id(),
    establishmentId: e.id,
    districtId: e.districtId,
    assignedInspectorId: String(inspector._id),
    scheduledDate: req.body.scheduledDate,
    inspectionType: req.body.inspectionType || 'ROUTINE',
    instructions: req.body.instructions || '',
    status: 'ASSIGNED',
    priority: req.body.priority || e.risk.riskLevel,
    riskScoreAtAssignment: e.risk.riskScore,
    checklist: [],
    followUpFor: req.body.followUpFor,
  };
  inspections.push(i);
  notifications.push({
    id: id(),
    recipientId: String(inspector._id),
    title: 'Inspection assigned',
    message: `${e.establishmentName} is scheduled for inspection`,
  });
  log(req.user.id, 'ASSIGN', 'Inspection', i.id);
  respond(res, i, 'Inspection assigned successfully');
});

app.patch('/api/inspections/:id/report', auth, roles('LABOUR_INSPECTOR'), (req: any, res) => {
  const i = inspections.find((x) => x.id === req.params.id && x.assignedInspectorId === req.user.id);
  if (!i) return res.status(404).json({ success: false, message: 'Assigned inspection not found' });
  if (i.status === 'COMPLETED') return res.status(409).json({ success: false, message: 'Submitted reports cannot be changed' });
  Object.assign(i, {
    status: 'COMPLETED',
    actualInspectionDate: req.body.actualInspectionDate || new Date().toISOString(),
    checklist: req.body.checklist || [],
    observations: req.body.observations,
    findings: req.body.findings || [],
    inspectorRemarks: req.body.inspectorRemarks,
    reportSubmittedAt: new Date().toISOString(),
  });
  notifications.push({
    id: id(),
    recipientRole: 'LABOUR_OFFICER',
    title: 'Inspection report submitted',
    message: 'An inspection report awaits review.',
  });
  log(req.user.id, 'SUBMIT_REPORT', 'Inspection', i.id);
  respond(res, i, 'Inspection report submitted');
});

app.post('/api/inspections/:id/evidence', auth, roles('LABOUR_INSPECTOR'), (req: any, res) => {
  const i = inspections.find((x) => x.id === req.params.id && x.assignedInspectorId === req.user.id);
  if (!i) return res.status(403).json({ success: false, message: 'Access denied' });
  const p = z
    .object({ fileName: z.string().min(1), fileType: z.string(), fileSize: z.number() })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Invalid file metadata' });
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(p.data.fileType))
    return res.status(400).json({ success: false, message: 'Only PDF, JPG, and PNG files are allowed' });
  if (p.data.fileSize > 5 * 1024 * 1024)
    return res.status(400).json({ success: false, message: 'File size must not exceed 5MB' });
  const ev = {
    id: id(),
    fileName: p.data.fileName,
    fileType: p.data.fileType,
    uploadDate: new Date().toISOString(),
    relatedTo: req.body.relatedTo || 'General',
  };
  i.evidence = i.evidence || [];
  i.evidence.push(ev);
  log(req.user.id, 'UPLOAD', 'Evidence', ev.id);
  respond(res, ev, 'Evidence uploaded successfully');
});

// ═══════════════════════════════════════════════════════════════
// NOTICES & VIOLATIONS & CORRECTIVE ACTIONS
// ═══════════════════════════════════════════════════════════════

app.get('/api/notices', auth, (req: any, res) =>
  respond(res, notices.filter((n) => req.user.role !== 'EMPLOYER' || n.establishmentId === req.user.establishmentId))
);

app.get('/api/notices/:id', auth, (req: any, res) => {
  const n = notices.find((x) => x.id === req.params.id);
  if (!n) return res.status(404).json({ success: false, message: 'Notice not found' });
  if (req.user.role === 'EMPLOYER' && n.establishmentId !== req.user.establishmentId)
    return res.status(403).json({ success: false, message: 'Access denied' });
  respond(res, {
    notice: n,
    violation: violations.find((v) => v.id === n.violationId),
    actions: correctiveActions.filter((a) => a.noticeId === n.id),
  });
});

app.patch('/api/notices/:id/response', auth, roles('EMPLOYER'), (req: any, res) => {
  const n = notices.find((x) => x.id === req.params.id && x.establishmentId === req.user.establishmentId);
  if (!n) return res.status(403).json({ success: false, message: 'Access denied' });
  const p = z
    .object({ explanation: z.string().min(5), evidence: z.array(z.any()).optional() })
    .safeParse(req.body);
  if (!p.success)
    return res.status(400).json({ success: false, message: 'Provide an explanation of at least 5 characters' });
  n.employerResponse = p.data.explanation;
  n.responseEvidence = p.data.evidence || [];
  n.responseDate = new Date().toISOString();
  n.status = 'RESPONDED';
  notifications.push({
    id: id(),
    recipientRole: 'LABOUR_OFFICER',
    title: 'Notice response submitted',
    message: `Employer response received for ${n.noticeNumber}.`,
  });
  log(req.user.id, 'RESPOND', 'Notice', n.id);
  respond(res, n, 'Notice response submitted for officer review');
});

app.post('/api/notices', auth, roles('LABOUR_OFFICER'), (req: any, res) => {
  const e = establishments.find((x) => x.id === req.body.establishmentId);
  if (!e) return res.status(404).json({ success: false, message: 'Establishment not found' });
  const n = {
    id: id(),
    establishmentId: e.id,
    noticeNumber: `TN/DEMO/${new Date().getFullYear()}/${String(notices.length + 1).padStart(3, '0')}`,
    status: 'RESPONSE_PENDING',
    issueDate: new Date().toISOString(),
    ...req.body,
  };
  notices.push(n);
  log(req.user.id, 'ISSUE', 'Notice', n.id);
  respond(res, n, 'Notice issued');
});

app.get('/api/violations', auth, (req: any, res) =>
  respond(
    res,
    violations.filter(
      (v) =>
        req.user.role === 'LABOUR_OFFICER' ||
        v.establishmentId === req.user.establishmentId ||
        inspections.some((i) => i.id === v.inspectionId && i.assignedInspectorId === req.user.id)
    )
  )
);

app.post('/api/violations', auth, roles('LABOUR_OFFICER'), (req: any, res) => {
  const inspection = inspections.find((i) => i.id === req.body.inspectionId && i.status === 'COMPLETED');
  if (!inspection)
    return res.status(400).json({ success: false, message: 'A completed inspection report is required' });
  const v = {
    id: id(),
    establishmentId: inspection.establishmentId,
    inspectionId: inspection.id,
    violationCategory: req.body.violationCategory,
    description: req.body.description,
    severity: req.body.severity || 'MEDIUM',
    legalReference: req.body.legalReference || 'Sample / Demonstration Reference',
    status: 'OPEN',
    correctiveDeadline: req.body.correctiveDeadline,
    createdAt: new Date().toISOString(),
  };
  violations.push(v);
  log(req.user.id, 'CREATE', 'Violation', v.id);
  respond(res, v, 'Confirmed finding recorded');
});

app.get('/api/corrective-actions', auth, (req: any, res) =>
  respond(
    res,
    correctiveActions.filter(
      (a) =>
        req.user.role === 'LABOUR_OFFICER' ||
        a.establishmentId === req.user.establishmentId ||
        inspections.some((i) => i.id === a.followUpInspectionId && i.assignedInspectorId === req.user.id)
    )
  )
);

app.post('/api/corrective-actions', auth, roles('EMPLOYER'), (req: any, res) => {
  const notice = notices.find(
    (n) => n.id === req.body.noticeId && n.establishmentId === req.user.establishmentId
  );
  const violation = violations.find(
    (v) => v.id === req.body.violationId && v.establishmentId === req.user.establishmentId
  );
  if (!notice || !violation)
    return res
      .status(400)
      .json({ success: false, message: 'Choose a notice and related violation belonging to your establishment' });
  const a = {
    id: id(),
    establishmentId: req.user.establishmentId,
    violationId: violation.id,
    noticeId: notice.id,
    description: req.body.description,
    evidence: req.body.evidence || [],
    status: 'SUBMITTED',
    submittedAt: new Date().toISOString(),
  };
  correctiveActions.push(a);
  notice.status = 'RESPONSE_SUBMITTED';
  notifications.push({
    id: id(),
    recipientRole: 'LABOUR_OFFICER',
    title: 'Corrective action submitted',
    message: 'An employer response is awaiting review.',
  });
  log(req.user.id, 'SUBMIT', 'CorrectiveAction', a.id);
  respond(res, a, 'Corrective action submitted for officer review');
});

app.patch('/api/corrective-actions/:id/review', auth, roles('LABOUR_OFFICER'), (req: any, res) => {
  const action = correctiveActions.find((a) => a.id === req.params.id);
  if (!action) return res.status(404).json({ success: false, message: 'Corrective action not found' });
  if (!['ACCEPTED', 'CORRECTION_REQUIRED', 'FOLLOW_UP_REQUIRED'].includes(req.body.status))
    return res.status(400).json({ success: false, message: 'Invalid review decision' });
  action.status = req.body.status;
  action.reviewedAt = new Date().toISOString();
  action.remarks = req.body.remarks;
  if (req.body.status === 'ACCEPTED') {
    const v = violations.find((v) => v.id === action.violationId);
    if (v) {
      v.status = 'CLOSED';
      v.resolvedAt = new Date().toISOString();
    }
  }
  log(req.user.id, 'REVIEW', 'CorrectiveAction', action.id);
  respond(res, action, 'Corrective action review saved');
});

app.patch('/api/violations/:id/verification', auth, roles('LABOUR_INSPECTOR'), (req: any, res) => {
  const v = violations.find((x) => x.id === req.params.id);
  const followUp = inspections.find(
    (i) => i.followUpFor === v?.id && i.assignedInspectorId === req.user.id && i.status === 'COMPLETED'
  );
  if (!v || !followUp)
    return res
      .status(403)
      .json({ success: false, message: 'A completed assigned follow-up inspection is required' });
  if (!['CORRECTED', 'PARTIALLY_CORRECTED', 'NOT_CORRECTED'].includes(req.body.result))
    return res.status(400).json({ success: false, message: 'Invalid verification result' });
  v.status = req.body.result === 'CORRECTED' ? 'CLOSED' : 'OPEN';
  v.verificationResult = req.body.result;
  v.resolvedAt = v.status === 'CLOSED' ? new Date().toISOString() : undefined;
  log(req.user.id, 'VERIFY', 'Violation', v.id);
  respond(res, v, 'Follow-up verification recorded');
});

// ═══════════════════════════════════════════════════════════════
// MISC ROUTES
// ═══════════════════════════════════════════════════════════════

app.get('/api/notifications', auth, (req: any, res) =>
  respond(
    res,
    notifications.filter(
      (n) =>
        n.recipientId === req.user.id ||
        n.recipientRole === req.user.role ||
        n.establishmentId === req.user.establishmentId
    )
  )
);

app.get('/api/audit-logs', auth, roles('LABOUR_OFFICER'), (_req, res) => respond(res, audit));

app.get('/api/users/inspectors', auth, roles('LABOUR_OFFICER'), async (_req, res) => {
  try {
    const inspectors = await UserModel.find({ role: 'LABOUR_INSPECTOR' }).select('-passwordHash -__v');
    const mapped = inspectors.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      districtId: u.districtId ? String(u.districtId) : undefined,
    }));
    respond(res, mapped);
  } catch {
    respond(res, []);
  }
});

app.get('/api/user/profile', auth, async (req: any, res) => {
  try {
    const u = await UserModel.findById(req.user.id);
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    respond(res, {
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      districtId: u.districtId ? String(u.districtId) : undefined,
      establishmentId: u.establishmentId ? String(u.establishmentId) : undefined,
      status: u.status,
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

app.patch('/api/user/profile', auth, async (req: any, res) => {
  try {
    const u = await UserModel.findById(req.user.id);
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    const p = z
      .object({
        name: z.string().min(2).optional(),
        phone: z.string().optional(),
        designation: z.string().optional(),
      })
      .safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: 'Invalid profile inputs' });
    if (p.data.name) u.name = p.data.name;
    if (p.data.phone) u.phone = p.data.phone;
    await u.save();
    log(String(u._id), 'UPDATE', 'User', String(u._id));
    respond(
      res,
      {
        id: String(u._id),
        name: u.name,
        email: u.email,
        role: u.role,
        phone: u.phone,
        districtId: u.districtId ? String(u.districtId) : undefined,
        establishmentId: u.establishmentId ? String(u.establishmentId) : undefined,
      },
      'Profile updated successfully'
    );
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

app.get('/api/establishments/:id/profile', auth, (req: any, res) => {
  const e = establishments.find((x) => x.id === req.params.id);
  if (!e || !canEstablish(req, e))
    return res.status(404).json({ success: false, message: 'Establishment not found' });
  respond(res, {
    establishment: e,
    submissions: submissions.filter((s) => s.establishmentId === e.id),
    riskHistory: riskHistory.filter((r) => r.establishmentId === e.id),
    inspections: inspections.filter((i) => i.establishmentId === e.id),
    violations: violations.filter((v) => v.establishmentId === e.id),
    notices: notices.filter((n) => n.establishmentId === e.id),
    correctiveActions: correctiveActions.filter((a) => a.establishmentId === e.id),
  });
});

app.get('/api/risk/:establishmentId/history', auth, (req: any, res) => {
  const e = establishments.find((x) => x.id === req.params.establishmentId);
  if (!e || !canEstablish(req, e))
    return res.status(404).json({ success: false, message: 'Risk history not found' });
  respond(res, riskHistory.filter((r) => r.establishmentId === e.id));
});

app.get('/api/analytics', auth, roles('LABOUR_OFFICER'), (_req, res) => {
  const byIndustry = establishments.reduce((a: any, e: any) => {
    a[e.industry] = (a[e.industry] || 0) + e.risk.riskScore;
    return a;
  }, {});
  respond(res, {
    averageRisk: establishments.length
      ? Math.round(establishments.reduce((sum, e) => sum + e.risk.riskScore, 0) / establishments.length)
      : 0,
    industryRisk: Object.entries(byIndustry).map(([name, total]) => ({ name, total })),
    inspectionStatus: ['ASSIGNED', 'COMPLETED'].map((status) => ({
      name: status,
      value: inspections.filter((i) => i.status === status).length,
    })),
    violationStatus: ['OPEN', 'CLOSED'].map((status) => ({
      name: status,
      value: violations.filter((v) => v.status === status).length,
    })),
  });
});

// ── Catch-all for unknown API routes ────────────────────────────
app.all('/api/*', (_req: any, res: any) =>
  res.status(404).json({ success: false, message: 'API endpoint not found' })
);

// ── Global error handler ────────────────────────────────────────
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'A server error occurred' });
});

// ═══════════════════════════════════════════════════════════════
// STARTUP: Connect MongoDB then start Express
// ═══════════════════════════════════════════════════════════════
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/labour_compliance';

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected:', MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // hide credentials
    await seed();
    const port = Number(process.env.PORT) || 4000;
    app.listen(port, () => console.log(`API listening on port ${port}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
