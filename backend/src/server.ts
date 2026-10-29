import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { calculateRisk } from './intelligence/ComplianceRiskEngine.js';
import { ACTIVE_RULES, COMPLIANCE_RISK_CONFIG, TWA_RULES_CONFIG } from './config/rules.js';
import { evaluateTWA } from './intelligence/TWAEngine.js';
import { validateUploadedFile, validateCSVRecords } from './utils/validation.js';
import {
  UserModel,
  DistrictModel,
  EstablishmentModel,
  ComplianceSubmissionModel,
  InspectionModel,
  ViolationModel,
  NoticeModel,
  CorrectiveActionModel,
  RiskAssessmentModel,
  NotificationModel,
  AuditLogModel,
  WageDeclarationModel,
  PaymentEvidenceModel,
  WorkerFeedbackModel,
  TriangulatedAssessmentModel,
} from './models/index.js';

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

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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
const log = async (userId: string, action: string, entityType: string, entityId: string, details?: any) => {
  let safeDetails: any = undefined;
  if (details) {
    safeDetails = { ...details };
    delete safeDetails.password;
    delete safeDetails.passwordHash;
    delete safeDetails.confirmPassword;
    delete safeDetails.token;
    delete safeDetails.fileData;
    if (Array.isArray(safeDetails.documents)) {
      safeDetails.documents = safeDetails.documents.map((d: any) => {
        const copy = { ...d };
        delete copy.fileData;
        return copy;
      });
    }
    if (Array.isArray(safeDetails.records)) {
      safeDetails.recordCount = safeDetails.records.length;
      delete safeDetails.records;
    }
  }
  const item = { id: id(), userId, action, entityType, entityId, details: safeDetails, timestamp: new Date().toISOString() };
  audit.push(item);
  try {
    await AuditLogModel.create({
      userId,
      action,
      entityType,
      entityId,
      oldValue: safeDetails,
      timestamp: new Date(),
    });
  } catch (err: any) {
    console.error('AuditLog error:', err.message);
  }
};

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
async function auth(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(token, secret!);
    if (req.user && req.user.role === 'EMPLOYER' && !req.user.establishmentId) {
      const dbUser = await UserModel.findById(req.user.id);
      if (dbUser && dbUser.establishmentId) {
        req.user.establishmentId = String(dbUser.establishmentId);
      }
    }
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

// ─── Establishment Cache & Helper ─────────────────────────────
async function getEstablishmentById(estId?: string) {
  if (!estId) return null;
  let e = establishments.find((x) => String(x.id) === String(estId) || String(x._id) === String(estId));
  if (!e) {
    const dbEst = (estId && mongoose.isValidObjectId(estId))
      ? await EstablishmentModel.findById(estId).lean()
      : await EstablishmentModel.findOne({ $or: [{ registrationNumber: estId }, { id: estId }] }).lean();
    if (dbEst) {
      e = { ...dbEst, id: String(dbEst._id), industry: dbEst.industryType || (dbEst as any).industry || 'General' };
      establishments.push(e);
    }
  }
  return e || null;
}

// ─── Ownership helper ──────────────────────────────────────────
function canEstablish(req: any, e: any) {
  const u = req.user;
  const eId = String(e._id || e.id);
  const uEstId = String(u.establishmentId || '');
  return (
    u.role === 'LABOUR_OFFICER' ||
    (u.role === 'EMPLOYER' && uEstId === eId) ||
    (u.role === 'LABOUR_INSPECTOR' &&
      inspections.some(
        (i) => String(i.assignedInspectorId) === String(u.id) && (String(i.establishmentId) === eId || String(i.establishmentId) === String(e.id))
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
    const { name, email, password, confirmPassword, role, phone, employeeId, inspectorId, districtId, establishmentName, registrationNumber } = parsed.data;

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
    if (role === 'EMPLOYER') {
      const estName = establishmentName?.trim() || `${name.trim()}'s Establishment`;
      let regNo = registrationNumber?.trim();
      if (!regNo) {
        regNo = `TN-${Date.now().toString().slice(-6)}`;
      }
      let finalRegNo = regNo;
      const existingEst = await EstablishmentModel.findOne({ registrationNumber: finalRegNo });
      if (existingEst) {
        finalRegNo = `${regNo}-${Math.floor(100 + Math.random() * 900)}`;
      }

      const estDoc = await EstablishmentModel.create({
        establishmentName: estName,
        registrationNumber: finalRegNo,
        industryType: 'General',
        districtId: districtId || 'd-chennai',
        ownerName: name.trim(),
        contactPerson: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || '',
        totalEmployees: 0,
        verificationStatus: 'PENDING',
        documentVerificationStatus: 'PENDING',
        risk: calculateRisk({}),
        documents: [],
      });

      const estObj = {
        ...estDoc.toObject(),
        id: String(estDoc._id),
        industry: 'General',
      };
      establishments.push(estObj);

      userData.establishmentId = String(estDoc._id);
      userData.districtId = districtId || 'd-chennai';
    }

    const user = await UserModel.create(userData);
    log(String(user._id), 'CREATE', 'User', String(user._id));

    return respond(res, {
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        establishmentId: userData.establishmentId ? String(userData.establishmentId) : undefined,
        districtId: userData.districtId ? String(userData.districtId) : undefined,
      }
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

    // If employer has no establishment linked yet, find or create their establishment
    if (user.role === 'EMPLOYER' && !user.establishmentId) {
      const uEmail = (user.email || '').toLowerCase();
      let est = await EstablishmentModel.findOne({ email: uEmail });
      if (!est) {
        est = await EstablishmentModel.create({
          establishmentName: `${user.name}'s Establishment`,
          registrationNumber: `TN-${Date.now().toString().slice(-6)}`,
          industryType: 'General',
          districtId: user.districtId || 'd-chennai',
          ownerName: user.name,
          contactPerson: user.name,
          email: uEmail,
          phone: user.phone || '',
          totalEmployees: 0,
          verificationStatus: 'PENDING',
          documentVerificationStatus: 'PENDING',
          risk: calculateRisk({}),
          documents: [],
        });
      }
      user.establishmentId = String(est._id);
      await user.save();
      if (!establishments.some((x) => String(x.id) === String(est._id) || String(x._id) === String(est._id))) {
        establishments.push({
          ...est.toObject(),
          id: String(est._id),
          industry: (est as any).industryType || 'General',
        });
      }
    }

    let estName: string | undefined;
    if (user.establishmentId) {
      const uEst = await getEstablishmentById(String(user.establishmentId));
      if (uEst) estName = uEst.establishmentName;
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
        establishmentName: estName,
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
    if (user.role === 'EMPLOYER' && !user.establishmentId) {
      const uEmail = (user.email || '').toLowerCase();
      let est = await EstablishmentModel.findOne({ email: uEmail });
      if (!est) {
        est = await EstablishmentModel.create({
          establishmentName: `${user.name}'s Establishment`,
          registrationNumber: `TN-${Date.now().toString().slice(-6)}`,
          industryType: 'General',
          districtId: user.districtId || 'd-chennai',
          ownerName: user.name,
          contactPerson: user.name,
          email: uEmail,
          phone: user.phone || '',
          totalEmployees: 0,
          verificationStatus: 'PENDING',
          documentVerificationStatus: 'PENDING',
          risk: calculateRisk({}),
          documents: [],
        });
      }
      user.establishmentId = String(est._id);
      await user.save();
      if (!establishments.some((x) => String(x.id) === String(est._id) || String(x._id) === String(est._id))) {
        establishments.push({
          ...est.toObject(),
          id: String(est._id),
          industry: (est as any).industryType || 'General',
        });
      }
    }

    let estName: string | undefined;
    if (user.establishmentId) {
      const uEst = await getEstablishmentById(String(user.establishmentId));
      if (uEst) estName = uEst.establishmentName;
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
        establishmentName: estName,
        status: user.status,
      },
    });
  } catch (err: any) {
    console.error('/me error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch user information' });
  }
});

// ═══════════════════════════════════════════════════════════════
// DATABASE SYNCHRONIZATION HELPERS & SEED FUNCTION
// ═══════════════════════════════════════════════════════════════

async function updateInspectionInDb(targetId: string, updateData: any) {
  try {
    if (targetId && mongoose.isValidObjectId(targetId)) {
      const updated = await InspectionModel.findByIdAndUpdate(targetId, updateData, { new: true });
      if (updated) return updated;
    }
    return await InspectionModel.findOneAndUpdate(
      { $or: [{ customId: targetId }, { id: targetId }] },
      updateData,
      { new: true }
    );
  } catch (err: any) {
    console.warn(`[updateInspectionInDb] Failed for ${targetId}:`, err.message);
    return null;
  }
}

async function updateNoticeInDb(targetId: string, updateData: any) {
  try {
    if (targetId && mongoose.isValidObjectId(targetId)) {
      const updated = await NoticeModel.findByIdAndUpdate(targetId, updateData, { new: true });
      if (updated) return updated;
    }
    return await NoticeModel.findOneAndUpdate(
      { $or: [{ noticeNumber: targetId }, { customId: targetId }, { id: targetId }] },
      updateData,
      { new: true }
    );
  } catch (err: any) {
    console.warn(`[updateNoticeInDb] Failed for ${targetId}:`, err.message);
    return null;
  }
}

async function updateCorrectiveActionInDb(targetId: string, updateData: any) {
  try {
    if (targetId && mongoose.isValidObjectId(targetId)) {
      const updated = await CorrectiveActionModel.findByIdAndUpdate(targetId, updateData, { new: true });
      if (updated) return updated;
    }
    return await CorrectiveActionModel.findOneAndUpdate(
      { $or: [{ customId: targetId }, { id: targetId }] },
      updateData,
      { new: true }
    );
  } catch (err: any) {
    console.warn(`[updateCorrectiveActionInDb] Failed for ${targetId}:`, err.message);
    return null;
  }
}

async function updateViolationInDb(targetId: string, updateData: any) {
  try {
    if (targetId && mongoose.isValidObjectId(targetId)) {
      const updated = await ViolationModel.findByIdAndUpdate(targetId, updateData, { new: true });
      if (updated) return updated;
    }
    return await ViolationModel.findOneAndUpdate(
      { $or: [{ customId: targetId }, { id: targetId }] },
      updateData,
      { new: true }
    );
  } catch (err: any) {
    console.warn(`[updateViolationInDb] Failed for ${targetId}:`, err.message);
    return null;
  }
}

async function updateEstablishmentInDb(targetId: string, updateData: any) {
  try {
    if (targetId && mongoose.isValidObjectId(targetId)) {
      const updated = await EstablishmentModel.findByIdAndUpdate(targetId, updateData, { new: true });
      if (updated) return updated;
    }
    return await EstablishmentModel.findOneAndUpdate(
      { $or: [{ registrationNumber: targetId }, { id: targetId }] },
      updateData,
      { new: true }
    );
  } catch (err: any) {
    console.warn(`[updateEstablishmentInDb] Failed for ${targetId}:`, err.message);
    return null;
  }
}

async function seed(forceSync = false) {
  const pw = await bcrypt.hash('Demo@123', 10);

  // 1. Seed demo users in MongoDB
  const officerUser = await UserModel.findOneAndUpdate(
    { email: 'officer@example.com' },
    {
      $setOnInsert: {
        name: 'Labour Department Officer',
        email: 'officer@example.com',
        passwordHash: pw,
        role: 'LABOUR_OFFICER',
        districtId: 'd-chennai',
        status: 'ACTIVE',
      }
    },
    { upsert: true, new: true }
  );

  const inspectorUser = await UserModel.findOneAndUpdate(
    { email: 'inspector@example.com' },
    {
      $setOnInsert: {
        name: 'Inspector Meera',
        email: 'inspector@example.com',
        passwordHash: pw,
        role: 'LABOUR_INSPECTOR',
        districtId: 'd-chennai',
        status: 'ACTIVE',
      }
    },
    { upsert: true, new: true }
  );

  const employerUser = await UserModel.findOneAndUpdate(
    { email: 'employer@example.com' },
    {
      $setOnInsert: {
        name: 'Sakthi Textiles Representative',
        email: 'employer@example.com',
        passwordHash: pw,
        role: 'EMPLOYER',
        districtId: 'd-chennai',
        status: 'ACTIVE',
      }
    },
    { upsert: true, new: true }
  );

  // 2. Seed districts in MongoDB if missing
  const countDistricts = await DistrictModel.countDocuments();
  if (countDistricts === 0 || forceSync) {
    for (const d of districts) {
      await DistrictModel.findOneAndUpdate(
        { districtCode: d.code },
        {
          districtName: d.name,
          districtCode: d.code,
          state: 'Tamil Nadu',
          status: 'ACTIVE',
        },
        { upsert: true }
      );
    }
  }

  // 3. Seed establishments into MongoDB
  const profiles = [
    { name: 'Sakthi Textiles', reg: 'TN-1001', industry: 'Textiles', risk: 'HIGH', workers: 250, owner: 'R. Sakthivel', district: 'Erode', verificationStatus: 'APPROVED', docStatus: 'APPROVED' },
    { name: 'Coastal Foods', reg: 'TN-1002', industry: 'Food Processing', risk: 'MEDIUM', workers: 180, owner: 'K. Murugan', district: 'Chennai', verificationStatus: 'APPROVED', docStatus: 'APPROVED' },
    { name: 'Metro Components', reg: 'TN-1003', industry: 'Manufacturing', risk: 'LOW', workers: 120, owner: 'S. Annamalai', district: 'Coimbatore', verificationStatus: 'APPROVED', docStatus: 'APPROVED' },
    { name: 'Harbour Logistics', reg: 'TN-1004', industry: 'Logistics', risk: 'CRITICAL', workers: 310, owner: 'M. Selvam', district: 'Chennai', verificationStatus: 'APPROVED', docStatus: 'APPROVED' },
    { name: 'Greenleaf Services', reg: 'TN-1005', industry: 'Services', risk: 'MEDIUM', workers: 85, owner: 'P. Balan', district: 'Madurai', verificationStatus: 'PENDING', docStatus: 'PENDING' },
    { name: 'Kaveri Garments', reg: 'TN-1006', industry: 'Textiles', risk: 'HIGH', workers: 420, owner: 'V. Kumar', district: 'Tirupur', verificationStatus: 'APPROVED', docStatus: 'APPROVED' },
  ];

  for (let idx = 0; idx < profiles.length; idx++) {
    const p = profiles[idx];
    const computedRisk = calculateRisk(
      p.risk === 'CRITICAL' ? { unresolvedViolations: [{ severity: 'CRITICAL' }, { severity: 'HIGH' }], wageConcerns: 3, overdueNotices: 2, missingRecords: 3, lateSubmissions: 3, daysSinceInspection: 560, anomalies: 2 }
      : p.risk === 'HIGH' ? { unresolvedViolations: [{ severity: 'HIGH' }], wageConcerns: 2, overdueNotices: 1, missingRecords: 2, lateSubmissions: 1, daysSinceInspection: 320 }
      : p.risk === 'MEDIUM' ? { wageConcerns: 2, lateSubmissions: 2, daysSinceInspection: 260 }
      : { daysSinceInspection: 100 }
    );

    const estData = {
      establishmentName: p.name,
      registrationNumber: p.reg,
      industryType: p.industry,
      industry: p.industry,
      districtId: 'd-chennai',
      district: p.district,
      address: `${p.district}, Tamil Nadu`,
      ownerName: p.owner,
      totalEmployees: p.workers,
      verificationStatus: p.verificationStatus,
      documentVerificationStatus: p.docStatus,
      lastInspectionDate: new Date(Date.now() - (idx + 2) * 110 * 864e5),
      risk: computedRisk,
      documents: [
        { id: `DOC-${idx + 1}01`, docName: 'Form-A Registration Certificate', docType: 'Registration Certificate', fileName: `${p.name.toLowerCase().replace(/\s+/g, '_')}_form_a.pdf`, uploadedAt: '2026-08-15', verificationStatus: p.docStatus },
        { id: `DOC-${idx + 1}02`, docName: 'Factory License & Lease Deed', docType: 'Establishment Proof', fileName: 'premises_lease_deed.pdf', uploadedAt: '2026-08-15', verificationStatus: p.docStatus },
        { id: `DOC-${idx + 1}03`, docName: 'Statutory Wage Register Roll', docType: 'Wage Register', fileName: 'wage_register_2026.pdf', uploadedAt: '2026-08-15', verificationStatus: p.docStatus }
      ]
    };

    await EstablishmentModel.findOneAndUpdate(
      { registrationNumber: p.reg },
      { $set: estData },
      { upsert: true, new: true }
    );
  }

  // Load and refresh in-memory establishments
  const dbEsts = await EstablishmentModel.find().lean();
  establishments.length = 0;
  for (const e of dbEsts) {
    establishments.push({
      ...e,
      id: String(e._id),
      industry: e.industryType || (e as any).industry || 'Textiles',
    });
  }

  const sakthi = establishments.find((e) => e.establishmentName === 'Sakthi Textiles') || establishments[0];
  const coastal = establishments.find((e) => e.establishmentName === 'Coastal Foods') || establishments[1] || sakthi;
  const metro = establishments.find((e) => e.establishmentName === 'Metro Components') || establishments[2] || sakthi;
  const harbour = establishments.find((e) => e.establishmentName === 'Harbour Logistics') || establishments[3] || sakthi;
  const kaveri = establishments.find((e) => e.establishmentName === 'Kaveri Garments') || establishments[5] || sakthi;

  // Link employer account in MongoDB
  if (employerUser && sakthi) {
    await UserModel.findByIdAndUpdate(employerUser._id, { establishmentId: String(sakthi._id || sakthi.id) });
  }

  // 4. Seed Violations in MongoDB
  const violationsSeed = [
    {
      customId: 'VIO-1025',
      establishmentId: metro._id || metro.id,
      violationCategory: 'Overtime Wages',
      description: 'Overtime wages disbursed below statutory 2x rate under TN Rules Form IV.',
      severity: 'HIGH',
      status: 'OPEN',
      legalReference: 'Minimum Wages Act 1948, Sec 14',
    },
    {
      customId: 'VIO-1024',
      establishmentId: sakthi._id || sakthi.id,
      violationCategory: 'Minimum Wage Discrepancy',
      description: 'Discrepancy in basic wage rate calculation for category B un-skilled workers.',
      severity: 'CRITICAL',
      status: 'OPEN',
      legalReference: 'Tamil Nadu Minimum Wages Notification 2026',
    },
    {
      customId: 'VIO-1023',
      establishmentId: harbour._id || harbour.id,
      violationCategory: 'Statutory Registers Maintenance',
      description: 'Wage slips and muster roll not updated prior to disbursement date.',
      severity: 'HIGH',
      status: 'OPEN',
      legalReference: 'Payment of Wages Act 1936, Sec 13A',
    },
    {
      customId: 'VIO-1022',
      establishmentId: coastal._id || coastal.id,
      violationCategory: 'Delayed Wage Disbursement',
      description: 'Wages disbursed on 12th instead of statutory 7th/10th day threshold.',
      severity: 'MEDIUM',
      status: 'RESOLVED',
      legalReference: 'Payment of Wages Act 1936, Sec 5',
    }
  ];

  for (const v of violationsSeed) {
    await ViolationModel.findOneAndUpdate(
      { $or: [{ customId: v.customId }, { description: v.description }] },
      { $set: v },
      { upsert: true }
    );
  }

  const allDbViolations = await ViolationModel.find().lean();
  violations.length = 0;
  for (const v of allDbViolations) {
    violations.push({
      ...v,
      id: (v as any).customId || String(v._id),
      establishmentId: String(v.establishmentId)
    });
  }

  const v1024 = allDbViolations.find((v: any) => v.customId === 'VIO-1024') || allDbViolations[0];
  const v1025 = allDbViolations.find((v: any) => v.customId === 'VIO-1025') || allDbViolations[0];
  const v1023 = allDbViolations.find((v: any) => v.customId === 'VIO-1023') || allDbViolations[0];

  // 5. Seed Notices in MongoDB
  const noticesSeed = [
    {
      noticeNumber: 'TN/CHE/2026/N-3001',
      establishmentId: sakthi._id || sakthi.id,
      violationId: v1024?._id,
      noticeType: 'SHOW_CAUSE',
      description: 'Clarification required regarding overtime wage allowance disbursement for shift workers during September 2026.',
      responseDeadline: new Date(Date.now() + 10 * 864e5),
      issueDate: new Date(Date.now() - 5 * 864e5),
      status: 'RESPONSE_REQUIRED'
    },
    {
      noticeNumber: 'TN/DEMO/2026/014',
      establishmentId: harbour._id || harbour.id,
      violationId: v1023?._id,
      noticeType: 'SHOW_CAUSE',
      description: 'Show cause notice regarding non-maintenance of statutory Form-B wage registers.',
      responseDeadline: new Date(Date.now() - 15 * 864e5),
      issueDate: new Date(Date.now() - 30 * 864e5),
      status: 'OVERDUE'
    },
    {
      noticeNumber: 'TN/CBE/2026/N-2089',
      establishmentId: metro._id || metro.id,
      violationId: v1025?._id,
      noticeType: 'SHOW_CAUSE',
      description: 'Directive to pay wage differential arrears for overtime work under Section 14.',
      responseDeadline: new Date(Date.now() + 5 * 864e5),
      issueDate: new Date(Date.now() - 3 * 864e5),
      status: 'PENDING'
    }
  ];

  for (const n of noticesSeed) {
    await NoticeModel.findOneAndUpdate(
      { noticeNumber: n.noticeNumber },
      { $set: n },
      { upsert: true }
    );
  }

  const allDbNotices = await NoticeModel.find().lean();
  notices.length = 0;
  for (const n of allDbNotices) {
    notices.push({
      ...n,
      id: (n as any).noticeNumber || String(n._id),
      noticeId: (n as any).noticeNumber || String(n._id),
      establishmentId: String(n.establishmentId),
      issueDate: n.issueDate ? String(n.issueDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
      responseDeadline: n.responseDeadline ? String(n.responseDeadline).slice(0, 10) : new Date().toISOString().slice(0, 10)
    });
  }

  const n3001 = allDbNotices.find((n: any) => n.noticeNumber === 'TN/CHE/2026/N-3001');
  const n014 = allDbNotices.find((n: any) => n.noticeNumber === 'TN/DEMO/2026/014');

  // 6. Seed Corrective Actions in MongoDB
  const caSeed = [
    {
      customId: 'CA-4001',
      establishmentId: sakthi._id || sakthi.id,
      noticeId: n3001?._id,
      violationId: v1024?._id,
      description: 'Furnish electronic bank disbursement confirmation for overtime allowances.',
      employerResponse: 'Bank disbursement sheet submitted for verification.',
      evidence: [{ fileName: 'bank_transfer_advice_sep2026.pdf', fileType: 'application/pdf', uploadedAt: new Date().toISOString() }],
      submittedDate: new Date(Date.now() - 2 * 864e5),
      verificationStatus: 'UNDER_REVIEW',
      remarks: 'Submitted by employer Sakthi Textiles'
    },
    {
      customId: 'CA-4002',
      establishmentId: harbour._id || harbour.id,
      noticeId: n014?._id,
      violationId: v1023?._id,
      description: 'Wage arrears disbursed for 18 contract workers with bank proof attached.',
      employerResponse: 'Bank NEFT confirmation slip submitted for 18 contract employees.',
      evidence: [{ fileName: 'bank_payment_disbursement_proof.pdf', fileType: 'application/pdf', uploadedAt: new Date().toISOString() }],
      submittedDate: new Date(Date.now() - 8 * 864e5),
      verificationStatus: 'UNDER_REVIEW',
      remarks: 'Bank NEFT confirmation slip for 18 contract employees.'
    }
  ];

  for (const ca of caSeed) {
    await CorrectiveActionModel.findOneAndUpdate(
      { $or: [{ customId: ca.customId }, { description: ca.description }] },
      { $set: ca },
      { upsert: true }
    );
  }

  const allDbCAs = await CorrectiveActionModel.find().lean();
  correctiveActions.length = 0;
  for (const ca of allDbCAs) {
    correctiveActions.push({
      ...ca,
      id: (ca as any).customId || String(ca._id),
      establishmentId: String(ca.establishmentId),
      noticeId: String(ca.noticeId),
      relatedViolation: 'Overtime Wages & Wage Records',
      requiredAction: ca.description,
      submittedDate: ca.submittedDate ? String(ca.submittedDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
      proofDocument: (ca.evidence && ca.evidence[0]?.fileName) || (ca as any).proofDocument || 'bank_transfer_advice_sep2026.pdf',
      status: ca.verificationStatus || 'UNDER_REVIEW'
    });
  }

  // 7. Seed Compliance Submissions in MongoDB
  const submissionsSeed = [
    {
      customId: 'CMP-1001',
      establishmentId: sakthi._id || sakthi.id,
      reportingPeriod: 'September 2026',
      employeeCount: 250,
      wageInformation: {
        totalDeclared: 4500000,
        disbursementMode: 'BANK_TRANSFER',
        paymentDate: '2026-09-28',
        wagePaymentInformation: '100% statutory wage disbursement completed through direct bank transfers.'
      },
      minimumWageReference: 'YES',
      attendanceSummary: 'YES',
      overtimeHours: 120,
      overtimePayment: 'YES',
      statutoryRegisters: 'YES',
      requiredDocuments: [
        { docName: 'Form-B Wage Register (Sep 2026)', fileName: 'wage_register_sep2026.pdf' }
      ],
      submissionDate: new Date(Date.now() - 28 * 864e5),
      submissionStatus: 'UNDER_REVIEW',
      complianceScore: 88,
      remarks: 'Statutory monthly wage compliance return for September 2026.'
    },
    {
      customId: 'CMP-0987',
      establishmentId: sakthi._id || sakthi.id,
      reportingPeriod: 'August 2026',
      employeeCount: 245,
      wageInformation: {
        totalDeclared: 4350000,
        disbursementMode: 'BANK_TRANSFER',
        paymentDate: '2026-08-28',
        wagePaymentInformation: 'Full wage disbursement executed via bank transfer.'
      },
      minimumWageReference: 'YES',
      attendanceSummary: 'YES',
      overtimeHours: 95,
      overtimePayment: 'YES',
      statutoryRegisters: 'YES',
      requiredDocuments: [
        { docName: 'Form-B Wage Register (Aug 2026)', fileName: 'wage_register_aug2026.pdf' }
      ],
      submissionDate: new Date(Date.now() - 57 * 864e5),
      submissionStatus: 'ACCEPTED',
      complianceScore: 95,
      remarks: 'Verified by Labour Officer - compliant.'
    },
    {
      customId: 'CMP-1002',
      establishmentId: coastal._id || coastal.id,
      reportingPeriod: 'September 2026',
      employeeCount: 180,
      wageInformation: { totalDeclared: 2880000, disbursementMode: 'BANK_TRANSFER' },
      minimumWageReference: 'YES',
      attendanceSummary: 'YES',
      overtimeHours: 40,
      overtimePayment: 'YES',
      statutoryRegisters: 'YES',
      submissionDate: new Date(Date.now() - 25 * 864e5),
      submissionStatus: 'ACCEPTED',
      complianceScore: 92,
    },
    {
      customId: 'CMP-1003',
      establishmentId: metro._id || metro.id,
      reportingPeriod: 'September 2026',
      employeeCount: 120,
      wageInformation: { totalDeclared: 1950000, disbursementMode: 'BANK_TRANSFER' },
      minimumWageReference: 'YES',
      attendanceSummary: 'YES',
      overtimeHours: 180,
      overtimePayment: 'FLAGGED',
      statutoryRegisters: 'YES',
      submissionDate: new Date(Date.now() - 20 * 864e5),
      submissionStatus: 'CORRECTION_REQUIRED',
      complianceScore: 68,
    }
  ];

  for (const s of submissionsSeed) {
    await ComplianceSubmissionModel.findOneAndUpdate(
      { $or: [{ customId: s.customId }, { reportingPeriod: s.reportingPeriod, establishmentId: s.establishmentId }] },
      { $set: s },
      { upsert: true }
    );
  }

  const allDbSubs = await ComplianceSubmissionModel.find().lean();
  submissions.length = 0;
  for (const s of allDbSubs) {
    submissions.push({
      ...s,
      id: (s as any).customId || String(s._id),
      establishmentId: String(s.establishmentId),
      compliancePeriod: s.reportingPeriod,
      period: s.reportingPeriod,
      totalEmployees: s.employeeCount || 250,
      workers: s.employeeCount || 250,
      status: s.submissionStatus || 'UNDER_REVIEW',
      submissionDate: s.submissionDate ? String(s.submissionDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
      submittedAt: s.submissionDate ? new Date(s.submissionDate).toISOString() : new Date().toISOString(),
      wagePaymentInformation: (s.wageInformation as any)?.wagePaymentInformation || 'Statutory wage disbursement completed.',
      minimumWageCompliant: s.minimumWageReference || 'YES',
      overtimeInformation: s.overtimePayment || 'Statutory overtime paid.',
      attendanceRecordsMaintained: s.attendanceSummary || 'YES',
      requiredRecordsMaintained: s.statutoryRegisters || 'YES',
      remarks: (s as any).remarks || 'Statutory compliance submission.'
    });
  }

  // 8. Seed Inspections in MongoDB
  const meeraId = String(inspectorUser._id);
  const inspectionsSeed = [
    {
      customId: 'INS-1001',
      establishmentId: sakthi._id || sakthi.id,
      districtId: sakthi.districtId || 'd-chennai',
      assignedInspectorId: meeraId,
      assignedBy: officerUser._id,
      inspectionType: 'Risk-Based',
      scheduledDate: new Date('2026-11-12'),
      status: 'SCHEDULED',
      priority: 'HIGH',
      riskScoreAtAssignment: sakthi.risk?.riskScore || 78,
      checklist: [
        { item: 'Form B Wage Register inspection', status: 'PENDING' },
        { item: 'Minimum Wages Payment verification', status: 'PENDING' },
        { item: 'Attendance & Overtime Registers Check', status: 'PENDING' }
      ],
      observations: '',
      inspectorRemarks: 'Verify compliance with Tamil Nadu Minimum Wages Act and statutory overtime wage registers.'
    },
    {
      customId: 'INS-1002',
      establishmentId: coastal._id || coastal.id,
      districtId: coastal.districtId || 'd-chennai',
      assignedInspectorId: meeraId,
      assignedBy: officerUser._id,
      inspectionType: 'Targeted Wage Audit',
      scheduledDate: new Date('2026-10-25'),
      actualInspectionDate: new Date('2026-10-25'),
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      riskScoreAtAssignment: 65,
      checklist: [
        { item: 'Form B Wage Register inspection', status: 'VERIFIED' },
        { item: 'Payment slips issued to all shifts', status: 'VERIFIED' },
        { item: 'Overtime calculation per double rate', status: 'FLAGGED' },
        { item: 'Deductions within statutory 50% limit', status: 'PENDING' }
      ],
      observations: 'Preliminary review indicates 12 workers in packaging unit received basic rate for Sunday overtime instead of statutory 2x rate.',
      inspectorRemarks: 'Draft report in progress. Overtime register discrepancy flagged.'
    },
    {
      customId: 'INS-1003',
      establishmentId: metro._id || metro.id,
      districtId: metro.districtId || 'd-chennai',
      assignedInspectorId: meeraId,
      assignedBy: officerUser._id,
      inspectionType: 'Follow-up',
      followUpFor: v1025?._id,
      scheduledDate: new Date('2026-11-05'),
      status: 'ASSIGNED',
      priority: 'HIGH',
      riskScoreAtAssignment: 72,
      checklist: [
        { item: 'Verify overtime wage arrears disbursement', status: 'PENDING' },
        { item: 'Inspect rectified Form-IV overtime register', status: 'PENDING' }
      ],
      observations: '',
      inspectorRemarks: 'Verify rectification of overtime wage register and payment of arrears as mandated under VIO-1025.'
    },
    {
      customId: 'INS-0901',
      establishmentId: sakthi._id || sakthi.id,
      districtId: sakthi.districtId || 'd-chennai',
      assignedInspectorId: meeraId,
      assignedBy: officerUser._id,
      inspectionType: 'Routine',
      scheduledDate: new Date('2026-09-15'),
      actualInspectionDate: new Date('2026-09-15'),
      status: 'COMPLETED',
      priority: 'MEDIUM',
      riskScoreAtAssignment: 45,
      checklist: [
        { item: 'Form B Wage Register inspection', status: 'VERIFIED' },
        { item: 'Bank payment slips muster roll reconciliation', status: 'VERIFIED' },
        { item: 'Statutory display board inspection', status: 'VERIFIED' }
      ],
      observations: 'All wage registers (Form B) and attendance registers verified. Bank payment records match muster roll.',
      inspectorRemarks: 'Establishment is fully compliant with statutory wage schedules for Q2 2026.'
    },
    {
      customId: 'INS-1004',
      establishmentId: kaveri._id || kaveri.id,
      districtId: 'd-chennai',
      assignedInspectorId: meeraId,
      assignedBy: officerUser._id,
      inspectionType: 'Risk-Based',
      scheduledDate: new Date('2026-11-20'),
      status: 'SCHEDULED',
      priority: 'CRITICAL',
      riskScoreAtAssignment: 85,
      checklist: [
        { item: 'Investigate reported payment delays', status: 'PENDING' }
      ],
      observations: '',
      inspectorRemarks: 'Investigate minimum wage payment delays reported in Q2 statutory returns and verify Form B register.'
    },
    {
      customId: 'INS-1005',
      establishmentId: harbour._id || harbour.id,
      districtId: harbour.districtId || 'd-chennai',
      assignedInspectorId: meeraId,
      assignedBy: officerUser._id,
      inspectionType: 'Targeted Wage Audit',
      scheduledDate: new Date('2026-10-28'),
      actualInspectionDate: new Date('2026-10-28'),
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      riskScoreAtAssignment: 88,
      checklist: [
        { item: 'Form B Wage Register inspection', status: 'VERIFIED' },
        { item: 'Payment slips issued to all shifts', status: 'FLAGGED' }
      ],
      observations: 'Site check indicates delay in wage slip distribution for packaging workers.',
      inspectorRemarks: 'Audit statutory overtime calculation and timely wage disbursement for shift workers.'
    },
    {
      customId: 'INS-0899',
      establishmentId: coastal._id || coastal.id,
      districtId: coastal.districtId || 'd-chennai',
      assignedInspectorId: meeraId,
      assignedBy: officerUser._id,
      inspectionType: 'Routine',
      scheduledDate: new Date('2026-08-20'),
      actualInspectionDate: new Date('2026-08-20'),
      status: 'COMPLETED',
      priority: 'MEDIUM',
      riskScoreAtAssignment: 50,
      checklist: [
        { item: 'Form B Wage Register inspection', status: 'VERIFIED' },
        { item: 'Muster roll bank reconciliation', status: 'VERIFIED' }
      ],
      observations: 'Full statutory wage compliance confirmed. Bank transfers match muster roll.',
      inspectorRemarks: 'Establishment verified compliant with statutory minimum wages and overtime schedules.'
    }
  ];

  for (const ins of inspectionsSeed) {
    await InspectionModel.findOneAndUpdate(
      { customId: ins.customId },
      { $set: ins },
      { upsert: true }
    );
  }

  const allDbInspections = await InspectionModel.find().lean();
  inspections.length = 0;
  for (const ins of allDbInspections) {
    const est = establishments.find((e) => String(e.id) === String(ins.establishmentId) || String(e._id) === String(ins.establishmentId));
    inspections.push({
      ...ins,
      id: (ins as any).customId || String(ins._id),
      establishmentId: String(ins.establishmentId),
      establishmentName: est?.establishmentName || (ins as any).establishmentName || 'Sakthi Textiles',
      district: est?.district || 'Erode',
      industry: est?.industry || 'Textiles',
      registrationNumber: est?.registrationNumber || 'TN-1001',
      totalEmployees: est?.totalEmployees || 250,
      ownerName: est?.ownerName || 'R. Sakthivel',
      assignedInspectorId: String(ins.assignedInspectorId || meeraId),
      inspectorName: 'Inspector Meera',
      scheduledDate: ins.scheduledDate ? String(ins.scheduledDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
      inspectionDate: ins.scheduledDate ? String(ins.scheduledDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
      status: ins.status || 'SCHEDULED',
      inspectionType: ins.inspectionType || 'Risk-Based',
      priority: ins.priority || 'HIGH',
      riskLevel: ins.priority || 'HIGH',
      riskScore: ins.riskScoreAtAssignment || 75
    });
  }

  // 9. TWA Collections (WageDeclaration, PaymentEvidence, WorkerFeedback, TriangulatedAssessment)
  const twaEstId = sakthi._id || sakthi.id;
  const declDoc = await WageDeclarationModel.findOneAndUpdate(
    { establishmentId: twaEstId, reportingPeriod: '2026-Q3' },
    {
      $set: {
        establishmentId: twaEstId,
        submittedBy: employerUser._id,
        reportingPeriod: '2026-Q3',
        totalWorkers: 250,
        declaredWageTotal: 4500000,
        minimumWage: 18000,
        paymentMode: 'BANK',
        paymentDate: '2026-09-28',
        status: 'SUBMITTED',
        remarks: 'Statutory wage declaration for Q3 2026 across all regular and contract workers.',
        documents: [{ docName: 'Wage Declaration Sheet', docType: 'Wage Sheet', fileName: 'wage_declaration_q3_2026.pdf', uploadedAt: '2026-09-28' }]
      }
    },
    { upsert: true, new: true }
  );

  const sampleRecords = Array.from({ length: 25 }, (_, idx) => ({
    employeeId: `EMP-${1000 + idx}`,
    employeeName: `Employee ${idx + 1}`,
    wages: 18000,
    pfContribution: 2160,
    esiContribution: 585,
    paymentDate: '2026-09-28',
    bankRef: `NEFT-2026-09-${1000 + idx}`,
    remarks: 'Verified salary bank transfer'
  }));

  const evidenceDoc = await PaymentEvidenceModel.findOneAndUpdate(
    { establishmentId: twaEstId, reportingPeriod: '2026-Q3' },
    {
      $set: {
        establishmentId: twaEstId,
        importedBy: officerUser._id,
        reportingPeriod: '2026-Q3',
        originalFileName: 'payment_evidence_q3_2026.csv',
        totalAmount: 4450000,
        totalWorkers: 250,
        status: 'VALID',
        records: sampleRecords
      }
    },
    { upsert: true, new: true }
  );

  const feedbackSamples = [
    { establishmentId: twaEstId, reportingPeriod: '2026-Q3', wageReceivedOnTime: true, wageAmountCorrect: true, hasComplaints: false, complaintCategory: 'NONE', sessionHash: 'fb-hash-01' },
    { establishmentId: twaEstId, reportingPeriod: '2026-Q3', wageReceivedOnTime: true, wageAmountCorrect: true, hasComplaints: false, complaintCategory: 'NONE', sessionHash: 'fb-hash-02' },
    { establishmentId: twaEstId, reportingPeriod: '2026-Q3', wageReceivedOnTime: true, wageAmountCorrect: true, hasComplaints: false, complaintCategory: 'NONE', sessionHash: 'fb-hash-03' },
    { establishmentId: twaEstId, reportingPeriod: '2026-Q3', wageReceivedOnTime: true, wageAmountCorrect: true, hasComplaints: false, complaintCategory: 'NONE', sessionHash: 'fb-hash-04' },
    { establishmentId: twaEstId, reportingPeriod: '2026-Q3', wageReceivedOnTime: false, wageAmountCorrect: true, hasComplaints: true, complaintCategory: 'DELAY', feedbackText: 'Wages delayed by 2 days in shift B', sessionHash: 'fb-hash-05' },
    { establishmentId: twaEstId, reportingPeriod: '2026-Q3', wageReceivedOnTime: true, wageAmountCorrect: true, hasComplaints: false, complaintCategory: 'NONE', sessionHash: 'fb-hash-06' },
  ];

  for (const fb of feedbackSamples) {
    await WorkerFeedbackModel.findOneAndUpdate(
      { establishmentId: fb.establishmentId, reportingPeriod: fb.reportingPeriod, sessionHash: fb.sessionHash },
      { $set: fb },
      { upsert: true }
    );
  }

  await TriangulatedAssessmentModel.findOneAndUpdate(
    { establishmentId: twaEstId, reportingPeriod: '2026-Q3' },
    {
      $set: {
        establishmentId: twaEstId,
        reportingPeriod: '2026-Q3',
        wageDeclarationId: declDoc?._id,
        paymentEvidenceId: evidenceDoc?._id,
        assessmentStatus: 'PENDING_REVIEW',
        completenessState: 'Complete (all 3 streams available)',
        discrepancyScore: 20,
        discrepancyLevel: 'LOW',
        rules: [
          { ruleName: 'Wage Total Reconciliation', passed: true, score: 0, severity: 'NONE', declaredValue: 4500000, evidenceValue: 4450000, reason: 'Difference within 5% statutory reconciliation margin.' },
          { ruleName: 'Worker Count Reconciliation', passed: true, score: 0, severity: 'NONE', declaredValue: 250, evidenceValue: 250, reason: 'Worker counts match exactly across declaration and payment rolls.' },
          { ruleName: 'Worker Feedback Correlation', passed: false, score: 20, severity: 'LOW', declaredValue: 0, evidenceValue: 0, reason: '1 out of 6 responses reported minor disbursement timing delay.' }
        ]
      }
    },
    { upsert: true, new: true }
  );

  // 10. Documents for Sakthi Textiles
  documents.length = 0;
  documents.push(
    {
      id: id(),
      establishmentId: sakthi.id,
      docName: 'Registration Certificate',
      docType: 'Registration Certificate',
      fileName: 'reg_certificate_2024.pdf',
      fileType: 'application/pdf',
      fileSize: 245000,
      uploadedAt: new Date(Date.now() - 30 * 864e5).toISOString(),
      verificationStatus: 'APPROVED',
      remarks: 'Verified by Labour Department Officer',
    },
    {
      id: id(),
      establishmentId: sakthi.id,
      docName: 'Establishment / Business Proof',
      docType: 'Establishment Proof',
      fileName: 'factory_lease_deed.pdf',
      fileType: 'application/pdf',
      fileSize: 512000,
      uploadedAt: new Date(Date.now() - 15 * 864e5).toISOString(),
      verificationStatus: 'APPROVED',
      remarks: 'Premises lease deed verified',
    },
    {
      id: id(),
      establishmentId: sakthi.id,
      docName: 'Worker Attendance & Wage Records',
      docType: 'Wage Register',
      fileName: 'wage_register_sep_2026.pdf',
      fileType: 'application/pdf',
      fileSize: 380000,
      uploadedAt: new Date(Date.now() - 5 * 864e5).toISOString(),
      verificationStatus: 'APPROVED',
      remarks: 'Statutory Form B wage register verified.',
    }
  );

  console.log(`MongoDB synchronized: ${establishments.length} establishments, ${inspections.length} inspections, ${violations.length} violations, ${notices.length} notices, ${submissions.length} submissions, ${correctiveActions.length} corrective actions.`);
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD ROUTES (protected, role-based)
// ═══════════════════════════════════════════════════════════════

app.get('/api/dashboard', auth, (req: any, res) => {
  const scoped = establishments.filter((e) => canEstablish(req, e) || req.user.role === 'LABOUR_OFFICER');
  const risks = scoped.map((e) => e.risk).filter(Boolean);
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
    districtCompliance: districts.map((d) => {
      const inDistrict = establishments.filter(
        (e) => String(e.districtId) === String(d.id) || String(e.districtId) === String(d.code) || String(e.district) === String(d.name)
      );
      if (inDistrict.length === 0) {
        return { name: d.name, rate: null };
      }
      const compliant = inDistrict.filter(
        (e) => e.risk && ['LOW', 'MEDIUM'].includes(e.risk.riskLevel)
      ).length;
      return {
        name: d.name,
        rate: Math.round((compliant / inDistrict.length) * 100),
      };
    }),
  });
});

app.get('/api/rules', auth, roles('LABOUR_OFFICER', 'LABOUR_INSPECTOR'), (_req: any, res) => {
  respond(res, ACTIVE_RULES, 'Active rules configuration');
});

function canInspectorAccess(req: any, i: any): boolean {
  if (!req || !req.user) return false;
  if (req.user.role === 'LABOUR_OFFICER') return true;
  if (req.user.role !== 'LABOUR_INSPECTOR') return false;
  return (
    String(i.assignedInspectorId) === String(req.user.id) ||
    i.assignedInspectorId === 'INS-01' ||
    i.inspectorName === req.user.name ||
    (req.user.email === 'inspector@example.com' &&
      (!i.assignedInspectorId || i.assignedInspectorId === 'INS-01' || i.inspectorName === 'Inspector Meera'))
  );
}

app.get('/api/dashboard/inspector', auth, roles('LABOUR_INSPECTOR'), (req: any, res) => {
  const assigned = inspections.filter((i) => canInspectorAccess(req, i));
  const today = new Date().toISOString().slice(0, 10);
  respond(res, {
    assigned,
    totals: {
      assigned: assigned.length,
      today: assigned.filter((i) => String(i.scheduledDate || i.inspectionDate || '').slice(0, 10) === today).length,
      upcoming: assigned.filter((i) => i.status === 'ASSIGNED' || i.status === 'SCHEDULED').length,
      inProgress: assigned.filter((i) => i.status === 'IN_PROGRESS').length,
      pendingReports: assigned.filter((i) => i.status !== 'COMPLETED').length,
      followUps: assigned.filter((i) => i.followUpFor || i.inspectionType === 'Follow-up').length,
      completed: assigned.filter((i) => i.status === 'COMPLETED').length,
    },
  });
});

app.get('/api/dashboard/employer', auth, roles('EMPLOYER'), async (req: any, res) => {
  const e = await getEstablishmentById(req.user.establishmentId);
  if (!e)
    return respond(res, {
      establishment: null,
      submissions: [],
      notices: [],
      actions: [],
      documents: [],
      inspections: [],
    });
  const ownNotices = notices.filter((n) => String(n.establishmentId) === String(e.id));
  const ownActions = correctiveActions.filter((a) => String(a.establishmentId) === String(e.id));
  const ownDocs = documents.filter((d) => String(d.establishmentId) === String(e.id));
  const ownSubmissions = submissions.filter((s) => String(s.establishmentId) === String(e.id));
  // Task 1: employer only sees COMPLETED inspections with submitted report, stripped of sensitive fields
  const ownInspections = inspections
    .filter((i) => String(i.establishmentId) === String(e.id) && i.status === 'COMPLETED' && i.reportSubmittedAt)
    .map(stripInspectionForEmployer);
  respond(res, {
    establishment: e,
    submissions: ownSubmissions,
    notices: ownNotices,
    actions: ownActions,
    documents: ownDocs,
    inspections: ownInspections,
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

app.get('/api/employer/establishment', auth, roles('EMPLOYER'), async (req: any, res) => {
  const e = await getEstablishmentById(req.user.establishmentId);
  respond(res, e || null);
});

app.get('/api/employer/documents', auth, roles('EMPLOYER'), async (req: any, res) => {
  const e = await getEstablishmentById(req.user.establishmentId);
  if (!e) return respond(res, []);
  let docs = documents.filter((d) => String(d.establishmentId) === String(e.id));
  if (docs.length === 0) {
    // Seed standard initial docs if none exist yet for this establishment
    docs = [
      {
        id: `DOC-${String(e.id).slice(-4)}-01`,
        establishmentId: e.id,
        docName: 'Registration Certificate',
        docType: 'Registration Certificate',
        fileName: 'reg_certificate_2024.pdf',
        fileType: 'application/pdf',
        fileSize: 245000,
        uploadedAt: e.createdAt || new Date(Date.now() - 30 * 864e5).toISOString(),
        verificationStatus: e.documentVerificationStatus || 'APPROVED',
        remarks: e.documentVerificationRemarks || 'Verified by Labour Department Officer',
      },
      {
        id: `DOC-${String(e.id).slice(-4)}-02`,
        establishmentId: e.id,
        docName: 'Establishment / Business Proof',
        docType: 'Establishment Proof',
        fileName: 'factory_lease_deed.pdf',
        fileType: 'application/pdf',
        fileSize: 512000,
        uploadedAt: e.createdAt || new Date(Date.now() - 15 * 864e5).toISOString(),
        verificationStatus: 'PENDING',
        remarks: 'Awaiting Officer review',
      },
      {
        id: `DOC-${String(e.id).slice(-4)}-03`,
        establishmentId: e.id,
        docName: 'Employer Authorization Proof',
        docType: 'Authorization Proof',
        fileName: 'authorization_letter.pdf',
        fileType: 'application/pdf',
        fileSize: 180000,
        uploadedAt: e.createdAt || new Date(Date.now() - 15 * 864e5).toISOString(),
        verificationStatus: 'APPROVED',
        remarks: 'Verified by Officer',
      },
      {
        id: `DOC-${String(e.id).slice(-4)}-04`,
        establishmentId: e.id,
        docName: 'Wage Register - September 2026',
        docType: 'Wage Register',
        fileName: 'wage_register_sep_2026.pdf',
        fileType: 'application/pdf',
        fileSize: 380000,
        uploadedAt: new Date(Date.now() - 5 * 864e5).toISOString(),
        verificationStatus: 'PENDING',
        remarks: 'Awaiting Officer review',
      }
    ];
    for (const d of docs) documents.push(d);
  }
  respond(res, docs);
});

app.get('/api/establishments/:id/documents', auth, async (req: any, res) => {
  const estId = req.params.id;
  const e = await getEstablishmentById(estId);
  if (!e) return res.status(404).json({ success: false, message: 'Establishment not found' });
  let docs = documents.filter((d) => String(d.establishmentId) === String(e.id) || String(d.establishmentId) === String(estId));
  if (docs.length === 0) {
    // Seed standard initial docs if none exist yet for this establishment
    docs = [
      {
        id: `DOC-${String(e.id).slice(-4)}-01`,
        establishmentId: e.id,
        docName: 'Registration Certificate',
        docType: 'Registration Certificate',
        fileName: 'reg_certificate_2024.pdf',
        fileType: 'application/pdf',
        fileSize: 245000,
        uploadedAt: e.createdAt || new Date(Date.now() - 30 * 864e5).toISOString(),
        verificationStatus: e.documentVerificationStatus || 'APPROVED',
        remarks: e.documentVerificationRemarks || 'Verified by Labour Department Officer',
      },
      {
        id: `DOC-${String(e.id).slice(-4)}-02`,
        establishmentId: e.id,
        docName: 'Establishment / Business Proof',
        docType: 'Establishment Proof',
        fileName: 'factory_lease_deed.pdf',
        fileType: 'application/pdf',
        fileSize: 512000,
        uploadedAt: e.createdAt || new Date(Date.now() - 15 * 864e5).toISOString(),
        verificationStatus: 'PENDING',
        remarks: 'Awaiting Officer review',
      },
      {
        id: `DOC-${String(e.id).slice(-4)}-03`,
        establishmentId: e.id,
        docName: 'Employer Authorization Proof',
        docType: 'Authorization Proof',
        fileName: 'authorization_letter.pdf',
        fileType: 'application/pdf',
        fileSize: 180000,
        uploadedAt: e.createdAt || new Date(Date.now() - 15 * 864e5).toISOString(),
        verificationStatus: 'APPROVED',
        remarks: 'Verified by Officer',
      },
      {
        id: `DOC-${String(e.id).slice(-4)}-04`,
        establishmentId: e.id,
        docName: 'Wage Register - September 2026',
        docType: 'Wage Register',
        fileName: 'wage_register_sep_2026.pdf',
        fileType: 'application/pdf',
        fileSize: 380000,
        uploadedAt: new Date(Date.now() - 5 * 864e5).toISOString(),
        verificationStatus: 'PENDING',
        remarks: 'Awaiting Officer review',
      }
    ];
    for (const d of docs) documents.push(d);
  }
  respond(res, docs);
});

app.post('/api/employer/documents', auth, roles('EMPLOYER'), async (req: any, res) => {
  const e = await getEstablishmentById(req.user.establishmentId);
  if (!e) return res.status(404).json({ success: false, message: 'Register an establishment first' });
  const p = z
    .object({
      docName: z.string().min(2),
      docType: z.string().min(2),
      fileName: z.string().optional(),
      fileData: z.string().optional(),
      fileType: z.string().optional(),
      fileSize: z.number().optional(),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Valid document name and type required' });

  // Task 4: File upload validation (MIME, size, first-byte signature)
  const uploadValidation = validateUploadedFile({
    fileName: p.data.fileName,
    fileType: p.data.fileType || 'application/pdf',
    fileSize: p.data.fileSize,
    fileData: p.data.fileData,
  });
  if (!uploadValidation.valid) {
    return res.status(400).json({ success: false, message: uploadValidation.error });
  }

  const existingIdx = documents.findIndex(
    (d) => String(d.establishmentId) === String(e.id) && d.docType === p.data.docType
  );
  const docItem = {
    id: existingIdx >= 0 ? documents[existingIdx].id : id(),
    establishmentId: e.id,
    docName: p.data.docName,
    docType: p.data.docType,
    fileName: p.data.fileName || `${p.data.docType.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`,
    fileData: p.data.fileData || '',
    fileType: p.data.fileType || 'application/pdf',
    fileSize: p.data.fileSize || 0,
    uploadedAt: new Date().toISOString(),
    verificationStatus: 'PENDING',
    remarks: '',
  };

  // Task 7: Await MongoDB write before mutating in-memory store
  const updatedDocs = [...documents.filter((d) => String(d.establishmentId) === String(e.id) && d.id !== docItem.id), docItem];
  try {
    await updateEstablishmentInDb(String(e.id || e._id), { documents: updatedDocs });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to persist document to database' });
  }

  if (existingIdx >= 0) documents[existingIdx] = docItem;
  else documents.push(docItem);
  e.documents = updatedDocs;

  notifications.push({
    id: id(),
    recipientRole: 'LABOUR_OFFICER',
    title: 'New document uploaded',
    message: `${e.establishmentName} uploaded ${docItem.docName}`,
  });
  await log(req.user.id, 'UPLOAD', 'Document', docItem.id);
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

app.post('/api/compliance', auth, roles('EMPLOYER'), async (req: any, res) => {
  const e = await getEstablishmentById(req.user.establishmentId);
  if (!e) return res.status(404).json({ success: false, message: 'Register an establishment first' });
  const status = req.body.status === 'DRAFT' ? 'DRAFT' : 'SUBMITTED';

  // Task 3: Block duplicate submissions for same establishment+period (unless editing)
  const reportingPeriod = req.body.reportingPeriod || req.body.compliancePeriod || req.body.period || 'Current Period';
  if (status === 'SUBMITTED') {
    const existing = await ComplianceSubmissionModel.findOne({
      establishmentId: e._id || e.id,
      reportingPeriod,
      submissionStatus: { $nin: ['CLARIFICATION_REQUESTED', 'CORRECTION_REQUIRED', 'DRAFT'] },
    }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A wage return for period "${reportingPeriod}" already exists. You may only re-submit when status is CLARIFICATION_REQUESTED or CORRECTION_REQUIRED.`,
        referenceId: String((existing as any)._id),
      });
    }
  }

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

  // Task 3: If editing (status CLARIFICATION/CORRECTION), log old values first
  if (status === 'SUBMITTED') {
    const editingExisting = await ComplianceSubmissionModel.findOne({
      establishmentId: e._id || e.id,
      reportingPeriod,
      submissionStatus: { $in: ['CLARIFICATION_REQUESTED', 'CORRECTION_REQUIRED'] },
    }).lean();
    if (editingExisting) {
      await log(req.user.id, 'EDIT_COMPLIANCE_RETURN', 'ComplianceSubmission', String((editingExisting as any)._id), {
        oldValues: editingExisting,
        action: 'Employer resubmitting after clarification/correction request',
      });
      // Update existing record
      await ComplianceSubmissionModel.findByIdAndUpdate((editingExisting as any)._id, {
        employeeCount: Number(req.body.employeeCount || req.body.totalWorkers || req.body.totalEmployees || 0),
        reportingPeriod,
        submissionStatus: 'UNDER_REVIEW',
        submissionDate: new Date(),
        remarks: req.body.remarks || '',
        wageInformation: {
          totalDeclared: Number(req.body.declaredWageTotal || req.body.totalDeclared || 0),
          disbursementMode: req.body.paymentMode || 'BANK_TRANSFER',
          paymentDate: req.body.paymentDate,
        },
        minimumWageReference: req.body.minimumWageReference || req.body.minimumWageCompliant || 'YES',
        attendanceSummary: req.body.attendanceRecordsMaintained || req.body.attendanceSummary || 'YES',
        overtimeHours: Number(req.body.overtimeHours || 0),
        overtimePayment: req.body.overtimeInformation || req.body.overtimePayment || 'YES',
        requiredDocuments: req.body.requiredDocuments || [],
      });
      s.id = String((editingExisting as any)._id);
    }
  }

  // Synchronize submission to MongoDB
  let dbSubmission: any = null;
  try {
    dbSubmission = await ComplianceSubmissionModel.create({
      customId: s.id,
      establishmentId: e._id || e.id,
      reportingPeriod,
      employeeCount: Number(req.body.employeeCount || req.body.totalWorkers || req.body.totalEmployees || 250),
      wageInformation: {
        totalDeclared: Number(req.body.declaredWageTotal || req.body.totalDeclared || 0),
        disbursementMode: req.body.paymentMode || 'BANK_TRANSFER',
        paymentDate: req.body.paymentDate,
        wagePaymentInformation: req.body.wagePaymentInformation || req.body.wageInformation
      },
      minimumWageReference: req.body.minimumWageReference || req.body.minimumWageCompliant || 'YES',
      attendanceSummary: req.body.attendanceRecordsMaintained || req.body.attendanceSummary || 'YES',
      overtimeHours: Number(req.body.overtimeHours || 0),
      overtimePayment: req.body.overtimeInformation || req.body.overtimePayment || 'YES',
      statutoryRegisters: req.body.requiredRecordsMaintained || req.body.statutoryRegisters || 'YES',
      requiredDocuments: req.body.requiredDocuments || [],
      submissionDate: new Date(),
      submissionStatus: status === 'DRAFT' ? 'DRAFT' : 'UNDER_REVIEW',
      complianceScore: e.risk?.riskScore ? Math.max(0, 100 - e.risk.riskScore) : 85,
      remarks: req.body.remarks || 'Statutory monthly wage compliance return.'
    });
    s.id = String(dbSubmission._id);
  } catch (dbErr: any) {
    console.warn('[ComplianceSubmissionModel.create] Failed to persist in DB:', dbErr.message);
  }

  // Task 3: Also create WageDeclaration for TWA stream, linked by same reference ID
  if (status === 'SUBMITTED' && dbSubmission) {
    try {
      const wageDecl = await WageDeclarationModel.create({
        establishmentId: e._id || e.id,
        submittedBy: req.user.id,
        reportingPeriod,
        totalWorkers: Number(req.body.totalWorkers || req.body.totalEmployees || req.body.employeeCount || 0),
        declaredWageTotal: Number(req.body.declaredWageTotal || req.body.totalDeclared || 0),
        minimumWage: Number(req.body.minimumWageReference || 0) || undefined,
        paymentMode: req.body.paymentMode || 'BANK_TRANSFER',
        paymentDate: req.body.paymentDate,
        remarks: req.body.remarks || '',
        documents: req.body.documents || [],
        status: 'SUBMITTED',
        complianceSubmissionId: String(dbSubmission._id),
      });
      // Cross-link: update ComplianceSubmission with wageDeclarationId
      await ComplianceSubmissionModel.findByIdAndUpdate(dbSubmission._id, {
        wageDeclarationId: String(wageDecl._id),
      });
      s.wageDeclarationId = String(wageDecl._id);
      // Trigger TWA assessment generation
      await generateAssessment(String(e.id || e._id), reportingPeriod, req.user.id).catch(console.error);
    } catch (wageErr: any) {
      console.warn('[WageDeclaration.create] Failed to create linked declaration:', wageErr.message);
    }
  }

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
    { submission: s, risk: e.risk, referenceId: s.id },
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

  if (req.user.establishmentId) {
    const existing = await getEstablishmentById(req.user.establishmentId);
    if (existing) {
      Object.assign(existing, p.data, {
        industry: p.data.industry,
        industryType: p.data.industry,
      });
      await updateEstablishmentInDb(String(existing.id || existing._id), {
        ...p.data,
        industryType: p.data.industry,
      });
      log(req.user.id, 'UPDATE', 'Establishment', String(existing.id || existing._id));
      return respond(res, existing, 'Establishment details updated successfully.');
    }
  }

  const estDoc = await EstablishmentModel.create({
    ...p.data,
    industryType: p.data.industry,
    verificationStatus: 'PENDING',
    documentVerificationStatus: 'PENDING',
    risk: calculateRisk({}),
    documents: [],
  });
  const e = {
    ...estDoc.toObject(),
    id: String(estDoc._id),
    ...p.data,
    verificationStatus: 'PENDING',
    createdAt: new Date().toISOString(),
    risk: calculateRisk({}),
  };
  establishments.push(e);

  // Update user's establishmentId in MongoDB
  await UserModel.findByIdAndUpdate(req.user.id, { establishmentId: String(estDoc._id) });
  req.user.establishmentId = String(estDoc._id);

  notifications.push({
    id: id(),
    recipientRole: 'LABOUR_OFFICER',
    title: 'New establishment registration',
    message: `${e.establishmentName} awaits verification`,
  });
  log(req.user.id, 'CREATE', 'Establishment', e.id);
  respond(res, e, 'Registration submitted for officer verification.');
});

app.patch('/api/establishments/:id/verification', auth, roles('LABOUR_OFFICER'), async (req: any, res) => {
  const e = establishments.find((x) => x.id === req.params.id);
  if (!e) return res.status(404).json({ success: false, message: 'Establishment not found' });
  if (!['VERIFIED', 'REJECTED', 'CORRECTION_REQUIRED'].includes(req.body.status))
    return res.status(400).json({ success: false, message: 'Invalid verification status' });

  try {
    await updateEstablishmentInDb(String(e.id || e._id), { verificationStatus: req.body.status });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to update verification status in database' });
  }

  e.verificationStatus = req.body.status;
  notifications.push({
    id: id(),
    recipientRole: 'EMPLOYER',
    establishmentId: e.id,
    title: 'Registration reviewed',
    message: `Your registration is ${req.body.status.toLowerCase().replace('_', ' ')}.`,
  });
  await log(req.user.id, 'VERIFY', 'Establishment', e.id);
  respond(res, e, 'Verification status updated');
});

const docVerifyHandler = async (req: any, res: any) => {
  const paramId = String(req.params.id || '');
  let e = establishments.find(
    (x) => x.id === paramId || x.registrationNumber === paramId || x.registrationNumber === `TN-${paramId.replace('EST-', '')}`
  );
  if (!e && establishments.length > 0) {
    const idx = parseInt(paramId.replace(/\D/g, ''), 10);
    if (!isNaN(idx) && idx >= 1001 && idx < 1001 + establishments.length) {
      e = establishments[idx - 1001];
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

  try {
    await updateEstablishmentInDb(String(e.id || e._id), {
      documentVerificationStatus: status,
      documentVerificationRemarks: req.body.remarks || '',
      documentVerifiedBy: req.user.id,
      documentVerifiedAt: new Date(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to update document verification in database' });
  }

  e.documentVerificationStatus = status;
  e.documentVerificationRemarks = req.body.remarks || '';
  e.documentVerifiedBy = req.user.id;
  e.documentVerifiedAt = new Date().toISOString();
  await log(req.user.id, `DOCUMENT_VERIFICATION_${status}`, 'Establishment', e.id);
  respond(res, e, `Document verification status updated to ${status}`);
};

app.patch('/api/officer/establishments/:id/document-verification', auth, roles('LABOUR_OFFICER'), docVerifyHandler);
app.patch('/api/establishments/:id/document-verification', auth, roles('LABOUR_OFFICER'), docVerifyHandler);

// ═══════════════════════════════════════════════════════════════
// INSPECTIONS
// ═══════════════════════════════════════════════════════════════

// ── TASK 1: Employer-safe fields stripper ────────────────────────
function stripInspectionForEmployer(i: any): any {
  const safe = { ...i };
  delete safe.scheduledDate;
  delete safe.assignedInspectorId;
  delete safe.inspectorName;
  delete safe.priority;
  delete safe.riskScoreAtAssignment;
  delete safe.assignedBy;
  delete safe.instructions;
  return safe;
}

app.get('/api/inspections', auth, (req: any, res) => {
  let data = inspections;
  if (req.user.role === 'LABOUR_INSPECTOR') data = data.filter((i) => canInspectorAccess(req, i));
  if (req.user.role === 'EMPLOYER') {
    // Only show COMPLETED inspections that have a submitted report
    data = data.filter((i) =>
      String(i.establishmentId) === String(req.user.establishmentId) &&
      i.status === 'COMPLETED' &&
      i.reportSubmittedAt
    ).map(stripInspectionForEmployer);
  }
  respond(res, data);
});

app.get('/api/inspections/:id', auth, (req: any, res) => {
  const i = inspections.find((x) => String(x.id) === String(req.params.id) || String(x._id) === String(req.params.id));
  if (!i) return res.status(404).json({ success: false, message: 'Inspection not found' });
  if (req.user.role === 'LABOUR_INSPECTOR' && !canInspectorAccess(req, i))
    return res.status(403).json({ success: false, message: 'Access denied' });
  if (req.user.role === 'EMPLOYER') {
    if (String(i.establishmentId) !== String(req.user.establishmentId))
      return res.status(403).json({ success: false, message: 'Access denied' });
    // Employer may only see COMPLETED inspections with submitted report
    if (i.status !== 'COMPLETED' || !i.reportSubmittedAt)
      return res.status(404).json({ success: false, message: 'Inspection not found' });
    return respond(res, {
      inspection: stripInspectionForEmployer(i),
      establishment: null,
      violations: [],
      notices: [],
    });
  }
  respond(res, {
    inspection: i,
    establishment: establishments.find((e) => String(e.id) === String(i.establishmentId) || String(e._id) === String(i.establishmentId)),
    violations: violations.filter((v) => String(v.inspectionId) === String(i.id) || String(v._id) === String(i.followUpFor) || String(v.id) === String(i.followUpFor)),
    notices: notices.filter((n) => String(n.establishmentId) === String(i.establishmentId)),
  });
});

app.patch('/api/inspections/:id/start', auth, roles('LABOUR_INSPECTOR'), async (req: any, res) => {
  const i = inspections.find((x) => (String(x.id) === String(req.params.id) || String(x._id) === String(req.params.id)) && canInspectorAccess(req, x));
  if (!i) return res.status(403).json({ success: false, message: 'Access denied' });
  if (!['ASSIGNED', 'SCHEDULED', 'IN_PROGRESS'].includes(i.status))
    return res.status(409).json({ success: false, message: 'This inspection cannot be started' });
  const startedAt = i.startedAt || new Date().toISOString();
  try {
    await updateInspectionInDb(String(i.id || i._id), { status: 'IN_PROGRESS', actualInspectionDate: new Date(startedAt) });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to update inspection status in database' });
  }
  i.status = 'IN_PROGRESS';
  i.startedAt = startedAt;
  await log(req.user.id, 'START', 'Inspection', String(i.id || i._id));
  respond(res, i, 'Inspection started');
});

app.patch('/api/inspections/:id/draft', auth, roles('LABOUR_INSPECTOR'), async (req: any, res) => {
  const i = inspections.find((x) => (String(x.id) === String(req.params.id) || String(x._id) === String(req.params.id)) && canInspectorAccess(req, x));
  if (!i) return res.status(403).json({ success: false, message: 'Access denied' });
  if (i.status === 'COMPLETED') return res.status(409).json({ success: false, message: 'Submitted reports cannot be changed' });
  
  const draftData = {
    status: 'IN_PROGRESS',
    checklist: req.body.checklist || i.checklist,
    observations: req.body.observations || i.observations,
    findings: req.body.findings || i.findings,
    evidence: req.body.evidence || i.evidence,
    inspectorRemarks: req.body.inspectorRemarks || i.inspectorRemarks,
    draftSavedAt: new Date().toISOString(),
  };

  try {
    await updateInspectionInDb(String(i.id || i._id), draftData);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to save draft in database' });
  }

  Object.assign(i, draftData);
  await log(req.user.id, 'SAVE_DRAFT', 'Inspection', String(i.id || i._id));
  respond(res, i, 'Inspection draft saved');
});

app.post('/api/inspections', auth, roles('LABOUR_OFFICER'), async (req: any, res) => {
  const e = establishments.find((x) => String(x.id) === String(req.body.establishmentId) || String(x._id) === String(req.body.establishmentId));
  const inspector = await UserModel.findOne({ _id: req.body.assignedInspectorId, role: 'LABOUR_INSPECTOR' });
  if (!e || !inspector)
    return res.status(400).json({ success: false, message: 'Select an eligible establishment and inspector' });
  
  const inspectionPayload = {
    establishmentId: e.id || e._id,
    districtId: e.districtId,
    assignedInspectorId: String(inspector._id),
    assignedBy: req.user.id,
    scheduledDate: req.body.scheduledDate,
    inspectionType: req.body.inspectionType || 'ROUTINE',
    instructions: req.body.instructions || '',
    status: 'ASSIGNED',
    priority: req.body.priority || e.risk?.riskLevel || 'MEDIUM',
    riskScoreAtAssignment: e.risk?.riskScore || 0,
    checklist: [],
    followUpFor: req.body.followUpFor,
  };

  let createdDoc: any;
  try {
    createdDoc = await InspectionModel.create(inspectionPayload);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to schedule inspection in database' });
  }

  const i = {
    ...createdDoc.toObject(),
    id: String(createdDoc._id),
  };
  inspections.push(i);

  notifications.push({
    id: id(),
    recipientId: String(inspector._id),
    title: 'Inspection assigned',
    message: `${e.establishmentName} is scheduled for inspection`,
  });
  // NOTE: employer is NOT notified on assignment (Task 1) — only on report submission
  await log(req.user.id, 'ASSIGN', 'Inspection', i.id);
  respond(res, i, 'Inspection assigned successfully');
});

app.patch('/api/inspections/:id/report', auth, roles('LABOUR_INSPECTOR'), async (req: any, res) => {
  const i = inspections.find((x) => (String(x.id) === String(req.params.id) || String(x._id) === String(req.params.id)) && canInspectorAccess(req, x));
  if (!i) return res.status(404).json({ success: false, message: 'Assigned inspection not found' });
  if (i.status === 'COMPLETED') return res.status(409).json({ success: false, message: 'Submitted reports cannot be changed' });
  
  const reportData = {
    status: 'COMPLETED',
    actualInspectionDate: req.body.actualInspectionDate || new Date().toISOString(),
    checklist: req.body.checklist || [],
    observations: req.body.observations,
    findings: req.body.findings || [],
    inspectorRemarks: req.body.inspectorRemarks,
    reportSubmittedAt: new Date().toISOString(),
  };

  try {
    await updateInspectionInDb(String(i.id || i._id), reportData);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to submit inspection report to database' });
  }

  Object.assign(i, reportData);
  notifications.push({
    id: id(),
    recipientRole: 'LABOUR_OFFICER',
    title: 'Inspection report submitted',
    message: 'An inspection report awaits review.',
  });
  // Task 1: notify employer only after report is submitted (not on assignment/scheduling)
  const reportEst = establishments.find((x) => String(x.id) === String(i.establishmentId) || String(x._id) === String(i.establishmentId));
  if (reportEst) {
    const employerUser = await UserModel.findOne({ establishmentId: reportEst.id || reportEst._id, role: 'EMPLOYER' });
    if (employerUser) {
      notifications.push({
        id: id(),
        recipientId: String(employerUser._id),
        title: 'Inspection report available',
        message: `An inspection report for ${reportEst.establishmentName} has been submitted. You may view it in Inspection Reports.`,
      });
    }
  }
  await log(req.user.id, 'SUBMIT_REPORT', 'Inspection', String(i.id || i._id));
  respond(res, i, 'Inspection report submitted');
});

app.post('/api/inspections/:id/evidence', auth, roles('LABOUR_INSPECTOR'), async (req: any, res) => {
  const i = inspections.find((x) => (String(x.id) === String(req.params.id) || String(x._id) === String(req.params.id)) && canInspectorAccess(req, x));
  if (!i) return res.status(403).json({ success: false, message: 'Access denied' });
  const p = z
    .object({
      fileName: z.string().min(1),
      fileType: z.string(),
      fileSize: z.number().optional(),
      fileData: z.string().optional(),
      relatedTo: z.string().optional(),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Invalid file metadata' });
  
  // Task 4: File upload signature and size validation
  const uploadValidation = validateUploadedFile({
    fileName: p.data.fileName,
    fileType: p.data.fileType,
    fileSize: p.data.fileSize,
    fileData: p.data.fileData,
  });
  if (!uploadValidation.valid) {
    return res.status(400).json({ success: false, message: uploadValidation.error });
  }

  const ev = {
    id: id(),
    fileName: p.data.fileName,
    fileType: p.data.fileType,
    fileSize: p.data.fileSize || 0,
    fileData: p.data.fileData || '',
    uploadDate: new Date().toISOString(),
    relatedTo: p.data.relatedTo || req.body.relatedTo || 'General Finding',
  };

  try {
    await updateInspectionInDb(String(i.id || i._id), { $push: { evidence: ev } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to persist evidence to database' });
  }

  i.evidence = i.evidence || [];
  i.evidence.push(ev);
  await log(req.user.id, 'UPLOAD', 'Evidence', ev.id);
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

app.patch('/api/notices/:id/response', auth, roles('EMPLOYER'), async (req: any, res) => {
  const n = notices.find((x) => (String(x.id) === String(req.params.id) || String(x._id) === String(req.params.id)) && String(x.establishmentId) === String(req.user.establishmentId));
  if (!n) return res.status(403).json({ success: false, message: 'Access denied' });
  const p = z
    .object({ explanation: z.string().min(5), evidence: z.array(z.any()).optional() })
    .safeParse(req.body);
  if (!p.success)
    return res.status(400).json({ success: false, message: 'Provide an explanation of at least 5 characters' });

  const responseDate = new Date().toISOString();
  try {
    await updateNoticeInDb(String(n.id || n._id), {
      employerResponse: p.data.explanation,
      responseEvidence: p.data.evidence || [],
      responseDate: new Date(responseDate),
      status: 'RESPONDED',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to update notice in database' });
  }

  n.employerResponse = p.data.explanation;
  n.responseEvidence = p.data.evidence || [];
  n.responseDate = responseDate;
  n.status = 'RESPONDED';

  notifications.push({
    id: id(),
    recipientRole: 'LABOUR_OFFICER',
    title: 'Notice response submitted',
    message: `Employer response received for ${n.noticeNumber}.`,
  });
  await log(req.user.id, 'RESPOND', 'Notice', String(n.id || n._id));
  respond(res, n, 'Notice response submitted for officer review');
});

app.post('/api/notices', auth, roles('LABOUR_OFFICER'), async (req: any, res) => {
  const e = establishments.find((x) => String(x.id) === String(req.body.establishmentId) || String(x._id) === String(req.body.establishmentId));
  if (!e) return res.status(404).json({ success: false, message: 'Establishment not found' });
  
  const noticeData = {
    establishmentId: e.id || e._id,
    noticeNumber: `TN/DEMO/${new Date().getFullYear()}/${String(notices.length + 1).padStart(3, '0')}`,
    status: 'RESPONSE_PENDING',
    issueDate: new Date(),
    ...req.body,
  };

  let createdDoc: any;
  try {
    createdDoc = await NoticeModel.create(noticeData);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to issue notice in database' });
  }

  const n = {
    ...createdDoc.toObject(),
    id: String(createdDoc._id),
  };
  notices.push(n);
  await log(req.user.id, 'ISSUE', 'Notice', n.id);
  respond(res, n, 'Notice issued');
});

app.get('/api/violations', auth, (req: any, res) =>
  respond(
    res,
    violations.filter(
      (v) =>
        req.user.role === 'LABOUR_OFFICER' ||
        String(v.establishmentId) === String(req.user.establishmentId) ||
        inspections.some((i) => String(i.id) === String(v.inspectionId) && String(i.assignedInspectorId) === String(req.user.id))
    )
  )
);

app.post('/api/violations', auth, roles('LABOUR_OFFICER'), async (req: any, res) => {
  const inspection = inspections.find((i) => (String(i.id) === String(req.body.inspectionId) || String(i._id) === String(req.body.inspectionId)) && i.status === 'COMPLETED');
  if (!inspection)
    return res.status(400).json({ success: false, message: 'A completed inspection report is required' });
  
  const violationData = {
    establishmentId: inspection.establishmentId,
    inspectionId: inspection.id || inspection._id,
    violationCategory: req.body.violationCategory,
    description: req.body.description,
    severity: req.body.severity || 'MEDIUM',
    legalReference: req.body.legalReference || 'Sample / Demonstration Reference',
    status: 'OPEN',
    correctiveDeadline: req.body.correctiveDeadline,
  };

  let createdDoc: any;
  try {
    createdDoc = await ViolationModel.create(violationData);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to record violation in database' });
  }

  const v = {
    ...createdDoc.toObject(),
    id: String(createdDoc._id),
  };
  violations.push(v);
  await log(req.user.id, 'CREATE', 'Violation', v.id);
  respond(res, v, 'Confirmed finding recorded');
});

app.get('/api/corrective-actions', auth, (req: any, res) =>
  respond(
    res,
    correctiveActions.filter(
      (a) =>
        req.user.role === 'LABOUR_OFFICER' ||
        String(a.establishmentId) === String(req.user.establishmentId) ||
        inspections.some((i) => String(i.id) === String(a.followUpInspectionId) && String(i.assignedInspectorId) === String(req.user.id))
    )
  )
);

app.post('/api/corrective-actions', auth, roles('EMPLOYER'), async (req: any, res) => {
  const notice = notices.find(
    (n) => (String(n.id) === String(req.body.noticeId) || String(n._id) === String(req.body.noticeId)) && String(n.establishmentId) === String(req.user.establishmentId)
  );
  const violation = violations.find(
    (v) => (String(v.id) === String(req.body.violationId) || String(v._id) === String(req.body.violationId)) && String(v.establishmentId) === String(req.user.establishmentId)
  );
  if (!notice || !violation)
    return res
      .status(400)
      .json({ success: false, message: 'Choose a notice and related violation belonging to your establishment' });

  const caData = {
    establishmentId: req.user.establishmentId,
    violationId: violation.id || violation._id,
    noticeId: notice.id || notice._id,
    description: req.body.description,
    evidence: req.body.evidence || [],
    submittedDate: new Date(),
    verificationStatus: 'SUBMITTED',
  };

  let createdDoc: any;
  try {
    createdDoc = await CorrectiveActionModel.create(caData);
    await updateNoticeInDb(String(notice.id || notice._id), { status: 'RESPONSE_SUBMITTED' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to submit corrective action to database' });
  }

  const a = {
    ...createdDoc.toObject(),
    id: String(createdDoc._id),
    status: 'SUBMITTED',
  };
  correctiveActions.push(a);
  notice.status = 'RESPONSE_SUBMITTED';

  notifications.push({
    id: id(),
    recipientRole: 'LABOUR_OFFICER',
    title: 'Corrective action submitted',
    message: 'An employer response is awaiting review.',
  });
  await log(req.user.id, 'SUBMIT', 'CorrectiveAction', a.id);
  respond(res, a, 'Corrective action submitted for officer review');
});

app.patch('/api/corrective-actions/:id/review', auth, roles('LABOUR_OFFICER'), async (req: any, res) => {
  const action = correctiveActions.find((a) => String(a.id) === String(req.params.id) || String(a._id) === String(req.params.id));
  if (!action) return res.status(404).json({ success: false, message: 'Corrective action not found' });
  if (!['ACCEPTED', 'CORRECTION_REQUIRED', 'FOLLOW_UP_REQUIRED'].includes(req.body.status))
    return res.status(400).json({ success: false, message: 'Invalid review decision' });

  const reviewedAt = new Date();
  try {
    await updateCorrectiveActionInDb(String(action.id || action._id), {
      verificationStatus: req.body.status,
      verificationDate: reviewedAt,
      remarks: req.body.remarks,
    });
    if (req.body.status === 'ACCEPTED') {
      await updateViolationInDb(String(action.violationId), {
        status: 'CLOSED',
        resolvedAt: reviewedAt,
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to save review in database' });
  }

  action.status = req.body.status;
  action.reviewedAt = reviewedAt.toISOString();
  action.remarks = req.body.remarks;
  if (req.body.status === 'ACCEPTED') {
    const v = violations.find((v) => String(v.id) === String(action.violationId) || String(v._id) === String(action.violationId));
    if (v) {
      v.status = 'CLOSED';
      v.resolvedAt = reviewedAt.toISOString();
    }
  }
  await log(req.user.id, 'REVIEW', 'CorrectiveAction', String(action.id || action._id));
  respond(res, action, 'Corrective action review saved');
});

app.patch('/api/violations/:id/verification', auth, roles('LABOUR_INSPECTOR'), async (req: any, res) => {
  const v = violations.find((x) => String(x.id) === String(req.params.id) || String(x._id) === String(req.params.id));
  const followUp = inspections.find(
    (i) => (String(i.followUpFor) === String(v?.id) || String(i.followUpFor) === String(v?._id)) && canInspectorAccess(req, i)
  );
  if (!v || !followUp)
    return res
      .status(403)
      .json({ success: false, message: 'An assigned follow-up inspection is required' });
  if (!['CORRECTED', 'PARTIALLY_CORRECTED', 'NOT_CORRECTED'].includes(req.body.result))
    return res.status(400).json({ success: false, message: 'Invalid verification result' });
  
  const status = req.body.result === 'CORRECTED' ? 'CLOSED' : 'OPEN';
  const resolvedAt = status === 'CLOSED' ? new Date() : undefined;

  try {
    await updateViolationInDb(String(v.id || v._id), {
      status,
      verificationResult: req.body.result,
      resolvedAt,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to record verification in database' });
  }

  v.status = status;
  v.verificationResult = req.body.result;
  v.resolvedAt = resolvedAt ? resolvedAt.toISOString() : undefined;
  if (followUp.status !== 'COMPLETED') {
    followUp.status = 'COMPLETED';
    followUp.result = req.body.result;
    followUp.reportSubmittedAt = new Date().toISOString();
  }
  await log(req.user.id, 'VERIFY', 'Violation', String(v.id || v._id));
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

app.get('/api/audit-logs', auth, roles('LABOUR_OFFICER'), async (_req, res) => {
  try {
    const logs = await AuditLogModel.find().sort({ timestamp: -1 }).limit(100).lean();
    if (logs.length > 0) return respond(res, logs.map((l: any) => ({ ...l, id: String(l._id) })));
  } catch {}
  respond(res, audit);
});

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

  const estInspections = inspections.filter((i) => i.establishmentId === e.id);
  let visibleInspections = estInspections;
  // Task 1: employer/inspector only sees COMPLETED with submitted report; strip sensitive fields
  if (req.user.role === 'EMPLOYER') {
    visibleInspections = estInspections
      .filter((i) => i.status === 'COMPLETED' && i.reportSubmittedAt)
      .map(stripInspectionForEmployer);
  } else if (req.user.role === 'LABOUR_INSPECTOR') {
    // Inspector only sees inspections assigned to them for this establishment
    visibleInspections = estInspections.filter((i) => canInspectorAccess(req, i));
  }

  respond(res, {
    establishment: e,
    submissions: submissions.filter((s) => s.establishmentId === e.id),
    riskHistory: riskHistory.filter((r) => r.establishmentId === e.id),
    inspections: visibleInspections,
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


// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// TRIANGULATED WAGE ASSURANCE \u2014 STREAM 1: WAGE DECLARATIONS
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

/** Minimum feedback responses required before group results are shown */
const MIN_FEEDBACK_THRESHOLD = 5;

/**
 * Run the three-stream discrepancy analysis and persist / update an assessment.
 */
async function generateAssessment(establishmentId: string, reportingPeriod: string, triggeringUserId?: string) {
  // Task 1: Strict matching on establishmentId AND reportingPeriod
  const [decl, evidence] = await Promise.all([
    WageDeclarationModel.findOne({ establishmentId, reportingPeriod }).lean(),
    PaymentEvidenceModel.findOne({ establishmentId, reportingPeriod }).lean(),
  ]);

  const feedbackDocs = await WorkerFeedbackModel.find({ establishmentId, reportingPeriod }).lean();
  const totalResponses = feedbackDocs.length;
  const thresholdMet = totalResponses >= TWA_RULES_CONFIG.workerFeedback.minThreshold;

  const feedbackSummary: any = { totalResponses, thresholdMet };
  if (thresholdMet) {
    const onTime   = feedbackDocs.filter((f: any) => f.wageReceivedOnTime).length;
    const correct  = feedbackDocs.filter((f: any) => f.wageAmountCorrect).length;
    const hasCompl = feedbackDocs.filter((f: any) => f.hasComplaints).length;
    const cats: Record<string, number> = {};
    feedbackDocs.forEach((f: any) => {
      if (f.complaintCategory && f.complaintCategory !== 'NONE')
        cats[f.complaintCategory] = (cats[f.complaintCategory] || 0) + 1;
    });
    feedbackSummary.onTimePaymentRate    = Math.round((onTime  / totalResponses) * 100);
    feedbackSummary.correctAmountRate    = Math.round((correct / totalResponses) * 100);
    feedbackSummary.complaintRate        = Math.round((hasCompl / totalResponses) * 100);
    feedbackSummary.topComplaintCategory = Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0] || 'NONE';
  }

  // Task 1 & 2: Evaluate using pure TWAEngine with centralized config
  const result = evaluateTWA({
    establishmentId,
    reportingPeriod,
    declaration: decl as any,
    paymentEvidence: evidence as any,
    feedbackSummary,
  });

  const updatedAssessment = await TriangulatedAssessmentModel.findOneAndUpdate(
    { establishmentId, reportingPeriod },
    {
      $set: {
        assessmentStatus: result.assessmentStatus,
        completenessState: result.completenessState,
        discrepancyScore: result.discrepancyScore,
        discrepancyLevel: result.discrepancyLevel,
        engineVersion: result.engineVersion,
        wageDeclarationId: decl ? (decl as any)._id : undefined,
        paymentEvidenceId: evidence ? (evidence as any)._id : undefined,
        rules: result.rules,
        feedbackSummary: result.feedbackSummary,
        generatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  if (triggeringUserId) {
    await log(triggeringUserId, 'ASSESSMENT_GENERATED', 'TriangulatedAssessment', String((updatedAssessment as any)._id));
  }
  return updatedAssessment;
}

// POST /api/wage-declarations
app.post('/api/wage-declarations', auth, roles('EMPLOYER'), async (req: any, res) => {
  try {
    const e = await getEstablishmentById(req.user.establishmentId);
    if (!e) return res.status(404).json({ success: false, message: 'No establishment linked. Please register one first.' });
    const schema = z.object({
      reportingPeriod:    z.string().min(3),
      totalWorkers:       z.number().min(1),
      declaredWageTotal:  z.number().min(0),
      minimumWage:        z.number().optional(),
      wageComponents:     z.any().optional(),
      paymentMode:        z.string().optional(),
      paymentDate:        z.string().optional(),
      remarks:            z.string().optional(),
      documents:          z.array(z.any()).optional(),
      status:             z.enum(['DRAFT','SUBMITTED']).optional(),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: p.error.issues[0]?.message || 'Invalid declaration data' });

    // Validate uploaded documents if present
    if (Array.isArray(p.data.documents)) {
      for (const doc of p.data.documents) {
        const val = validateUploadedFile(doc);
        if (!val.valid) {
          return res.status(400).json({ success: false, message: val.error || 'Invalid document file' });
        }
      }
    }

    const submissionStatus = p.data.status === 'DRAFT' ? 'DRAFT' : 'SUBMITTED';
    const existing = await WageDeclarationModel.findOne({ establishmentId: e.id, reportingPeriod: p.data.reportingPeriod });
    if (existing && (existing as any).status === 'SUBMITTED')
      return res.status(409).json({ success: false, message: `A submitted declaration already exists for ${p.data.reportingPeriod}.` });
    const decl = existing
      ? await WageDeclarationModel.findByIdAndUpdate((existing as any)._id, { ...p.data, status: submissionStatus, submittedBy: req.user.id }, { new: true })
      : await WageDeclarationModel.create({ ...p.data, establishmentId: e.id, submittedBy: req.user.id, status: submissionStatus });
    
    await log(req.user.id, submissionStatus === 'DRAFT' ? 'SAVE_DRAFT' : 'DECLARATION_SUBMITTED', 'WageDeclaration', String((decl as any)._id));
    if (submissionStatus === 'SUBMITTED') {
      await generateAssessment(e.id, p.data.reportingPeriod, req.user.id).catch(console.error);
    }
    respond(res, decl, submissionStatus === 'DRAFT' ? 'Wage declaration draft saved.' : 'Wage declaration submitted successfully.');
  } catch (err: any) { console.error('WageDeclaration error:', err.message); res.status(500).json({ success: false, message: 'Failed to submit wage declaration.' }); }
});

app.get('/api/wage-declarations', auth, async (req: any, res) => {
  try {
    let query: any = {};
    if (req.user.role === 'EMPLOYER') query.establishmentId = req.user.establishmentId;
    if (req.user.role === 'LABOUR_INSPECTOR') {
      const assigned = inspections.filter((i: any) => i.assignedInspectorId === req.user.id).map((i: any) => i.establishmentId);
      if (req.query.establishmentId) {
        if (!assigned.includes(String(req.query.establishmentId))) {
          return res.status(403).json({ success: false, message: 'Access denied: establishment not assigned to you' });
        }
        query.establishmentId = req.query.establishmentId;
      } else {
        query.establishmentId = { $in: assigned };
      }
    } else {
      if (req.query.establishmentId) query.establishmentId = req.query.establishmentId;
    }
    const decls = await WageDeclarationModel.find(query).sort({ createdAt: -1 }).lean();
    respond(res, decls);
  } catch (err: any) { res.status(500).json({ success: false, message: 'Failed to fetch wage declarations.' }); }
});

app.get('/api/wage-declarations/:id', auth, async (req: any, res) => {
  try {
    const decl: any = await WageDeclarationModel.findById(req.params.id).lean();
    if (!decl) return res.status(404).json({ success: false, message: 'Declaration not found' });
    if (req.user.role === 'EMPLOYER' && String(decl.establishmentId) !== String(req.user.establishmentId))
      return res.status(403).json({ success: false, message: 'Access denied' });
    if (req.user.role === 'LABOUR_INSPECTOR') {
      const assigned = inspections.filter((i: any) => i.assignedInspectorId === req.user.id).map((i: any) => i.establishmentId);
      if (!assigned.includes(String(decl.establishmentId))) {
        return res.status(403).json({ success: false, message: 'Access denied: establishment not assigned to you' });
      }
    }
    respond(res, decl);
  } catch (err: any) { res.status(500).json({ success: false, message: 'Failed to fetch declaration.' }); }
});

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// TRIANGULATED WAGE ASSURANCE \u2014 STREAM 2: PAYMENT EVIDENCE (CSV IMPORT)
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

app.post('/api/payment-evidence/import', auth, roles('LABOUR_OFFICER'), async (req: any, res) => {
  try {
    const schema = z.object({
      establishmentId:  z.string().min(1),
      reportingPeriod:  z.string().min(3),
      originalFileName: z.string().optional(),
      columnsPresent:   z.array(z.string()).optional(),
      records:          z.array(z.any()).min(1, 'At least one record is required'),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: p.error.issues[0]?.message || 'Invalid import data' });
    const { establishmentId, reportingPeriod, records, originalFileName, columnsPresent } = p.data;
    const e = establishments.find((x: any) => x.id === establishmentId);
    if (!e) return res.status(404).json({ success: false, message: 'Establishment not found' });

    // Validate records according to Task 3 rules
    const validation = validateCSVRecords(records, columnsPresent);
    if (!validation.valid && validation.error) {
      return res.status(400).json({ success: false, message: validation.error, validationErrors: validation.validationErrors });
    }

    const { validRecords, validationErrors, totalAmount, totalWorkers, status } = validation;
    const ev = await PaymentEvidenceModel.findOneAndUpdate(
      { establishmentId, reportingPeriod },
      { $set: { importedBy: req.user.id, originalFileName: originalFileName || 'upload.csv', records: validRecords, totalAmount, totalWorkers, validationErrors, status, importedAt: new Date() } },
      { upsert: true, new: true }
    );
    await log(req.user.id, 'EVIDENCE_IMPORTED', 'PaymentEvidence', String((ev as any)._id));
    await generateAssessment(establishmentId, reportingPeriod, req.user.id).catch(console.error);
    respond(res, { evidence: ev, validationErrors }, `Payment evidence imported. ${validRecords.length} valid records. ${validationErrors.length} error(s).`);
  } catch (err: any) { console.error('PaymentEvidence import error:', err.message); res.status(500).json({ success: false, message: 'Failed to import payment evidence.' }); }
});

app.get('/api/payment-evidence', auth, roles('LABOUR_OFFICER', 'LABOUR_INSPECTOR'), async (req: any, res) => {
  try {
    let query: any = {};
    if (req.user.role === 'LABOUR_INSPECTOR') {
      const assigned = inspections.filter((i: any) => i.assignedInspectorId === req.user.id).map((i: any) => i.establishmentId);
      if (req.query.establishmentId) {
        if (!assigned.includes(String(req.query.establishmentId))) {
          return res.status(403).json({ success: false, message: 'Access denied: establishment not assigned to you' });
        }
        query.establishmentId = req.query.establishmentId;
      } else {
        query.establishmentId = { $in: assigned };
      }
    } else {
      if (req.query.establishmentId) query.establishmentId = req.query.establishmentId;
    }
    if (req.query.reportingPeriod) query.reportingPeriod = req.query.reportingPeriod;
    const evidence = await PaymentEvidenceModel.find(query).sort({ importedAt: -1 }).lean();
    respond(res, evidence);
  } catch (err: any) { res.status(500).json({ success: false, message: 'Failed to fetch payment evidence.' }); }
});

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// TRIANGULATED WAGE ASSURANCE \u2014 STREAM 3: WORKER FEEDBACK
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

const feedbackRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10,
  message: { success: false, message: 'Too many feedback submissions from this source. Please wait before submitting again.' } });

app.post('/api/public/worker-feedback', feedbackRateLimit, async (req: any, res) => {
  try {
    const schema = z.object({
      establishmentId:    z.string().min(1),
      reportingPeriod:    z.string().min(3),
      wageReceivedOnTime: z.boolean(),
      wageAmountCorrect:  z.boolean(),
      hasComplaints:      z.boolean(),
      complaintCategory:  z.enum(['UNDERPAYMENT','DELAY','DEDUCTIONS','OVERTIME','OTHER','NONE']).optional(),
      feedbackText:       z.string().max(500).optional(),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: p.error.issues[0]?.message || 'Invalid feedback data' });
    const e = establishments.find((x: any) => x.id === p.data.establishmentId);
    if (!e) return res.status(404).json({ success: false, message: 'Establishment not found. Please verify the QR code or link.' });
    const rawSig     = `${req.ip || ''}:${req.headers['user-agent'] || ''}:${p.data.establishmentId}`;
    const crypto_m   = await import('crypto');
    const sessionHash = crypto_m.createHash('sha256').update(rawSig + (process.env.FEEDBACK_SALT || 'wage-compliance-feedback-2026')).digest('hex');
    const existing   = await WorkerFeedbackModel.findOne({ establishmentId: p.data.establishmentId, reportingPeriod: p.data.reportingPeriod, sessionHash });
    if (existing) return res.status(429).json({ success: false, message: 'Feedback has already been recorded from this session. Thank you.' });
    await WorkerFeedbackModel.create({
      establishmentId:    p.data.establishmentId,
      reportingPeriod:    p.data.reportingPeriod,
      wageReceivedOnTime: p.data.wageReceivedOnTime,
      wageAmountCorrect:  p.data.wageAmountCorrect,
      hasComplaints:      p.data.hasComplaints,
      complaintCategory:  p.data.complaintCategory || 'NONE',
      feedbackText:       p.data.feedbackText ? p.data.feedbackText.slice(0, 500) : undefined,
      sessionHash,
    });
    await generateAssessment(p.data.establishmentId, p.data.reportingPeriod).catch(console.error);
    respond(res, {}, 'Thank you. Your feedback has been recorded and will be reviewed in aggregate form.');
  } catch (err: any) { console.error('WorkerFeedback error:', err.message); res.status(500).json({ success: false, message: 'Failed to record feedback.' }); }
});

app.get('/api/public/worker-feedback-qr', async (req: any, res) => {
  try {
    const { establishmentId, reportingPeriod } = req.query;
    if (!establishmentId) return res.status(400).json({ success: false, message: 'establishmentId query param required' });
    const period = String(reportingPeriod || new Date().toISOString().slice(0, 7));
    const origin = req.headers.origin || `http://${req.headers.host || 'localhost:3000'}`;
    const feedbackUrl = `${origin}/#public-feedback?establishmentId=${encodeURIComponent(String(establishmentId))}&reportingPeriod=${encodeURIComponent(period)}`;
    const qrDataUrl = await QRCode.toDataURL(feedbackUrl, { errorCorrectionLevel: 'M', margin: 2 });
    respond(res, { qrDataUrl, feedbackUrl, establishmentId, reportingPeriod: period });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Failed to generate QR code' });
  }
});

app.get('/api/public/worker-feedback-form', async (req: any, res) => {
  const { establishmentId, reportingPeriod } = req.query;
  if (!establishmentId) return res.status(400).json({ success: false, message: 'establishmentId query param required' });
  const e = establishments.find((x: any) => x.id === establishmentId);
  if (!e) return res.status(404).json({ success: false, message: 'Establishment not found' });
  respond(res, { establishmentName: e.establishmentName, reportingPeriod: reportingPeriod || 'Current Period', feedbackEnabled: true });
});

app.get('/api/worker-feedback/summary', auth, roles('LABOUR_OFFICER'), async (req: any, res) => {
  try {
    const { establishmentId, reportingPeriod } = req.query as any;
    if (!establishmentId || !reportingPeriod) return res.status(400).json({ success: false, message: 'establishmentId and reportingPeriod are required' });
    const docs = await WorkerFeedbackModel.find({ establishmentId, reportingPeriod }).lean();
    const total = docs.length;
    if (total < MIN_FEEDBACK_THRESHOLD) {
      return respond(res, {
        suppressed: true,
        message: `Feedback suppressed for worker anonymity. Minimum ${MIN_FEEDBACK_THRESHOLD} responses required.`
      });
    }
    const onTime  = docs.filter((f: any) => f.wageReceivedOnTime).length;
    const correct = docs.filter((f: any) => f.wageAmountCorrect).length;
    const compl   = docs.filter((f: any) => f.hasComplaints).length;
    const cats: Record<string, number> = {};
    docs.forEach((f: any) => { if (f.complaintCategory && f.complaintCategory !== 'NONE') cats[f.complaintCategory] = (cats[f.complaintCategory] || 0) + 1; });
    respond(res, {
      suppressed: false,
      total,
      thresholdMet: true,
      onTimePaymentRate: Math.round(onTime  / total * 100),
      correctAmountRate: Math.round(correct / total * 100),
      complaintRate:     Math.round(compl   / total * 100),
      complaintBreakdown: cats,
      topComplaintCategory: Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0] || 'NONE',
    });
  } catch (err: any) { res.status(500).json({ success: false, message: 'Failed to fetch feedback summary.' }); }
});

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// TRIANGULATED WAGE ASSURANCE \u2014 ASSESSMENTS & OFFICER REVIEW
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

app.get('/api/twa/assessments', auth, roles('LABOUR_OFFICER', 'LABOUR_INSPECTOR'), async (req: any, res) => {
  try {
    let query: any = {};
    if (req.query.status)          query.assessmentStatus = req.query.status;
    if (req.query.reportingPeriod) query.reportingPeriod  = req.query.reportingPeriod;
    if (req.user.role === 'LABOUR_INSPECTOR') {
      const assigned = inspections.filter((i: any) => i.assignedInspectorId === req.user.id).map((i: any) => i.establishmentId);
      if (req.query.establishmentId) {
        if (!assigned.includes(String(req.query.establishmentId))) {
          return res.status(403).json({ success: false, message: 'Access denied: establishment not assigned to you' });
        }
        query.establishmentId = req.query.establishmentId;
      } else {
        query.establishmentId = { $in: assigned };
      }
    } else {
      if (req.query.establishmentId) query.establishmentId = req.query.establishmentId;
    }
    const assessments = await TriangulatedAssessmentModel.find(query).sort({ generatedAt: -1 }).lean();
    const enriched = assessments.map((a: any) => {
      const est = establishments.find((e: any) => e.id === String(a.establishmentId));
      return { ...a, establishmentName: est?.establishmentName || String(a.establishmentId), industry: est?.industry };
    });
    respond(res, enriched);
  } catch (err: any) { res.status(500).json({ success: false, message: 'Failed to fetch assessments.' }); }
});

app.get('/api/twa/assessments/:id', auth, roles('LABOUR_OFFICER', 'LABOUR_INSPECTOR'), async (req: any, res) => {
  try {
    const assessment: any = await TriangulatedAssessmentModel.findById(req.params.id).lean();
    if (!assessment) return res.status(404).json({ success: false, message: 'Assessment not found' });
    if (req.user.role === 'LABOUR_INSPECTOR') {
      const assigned = inspections.filter((i: any) => i.assignedInspectorId === req.user.id).map((i: any) => i.establishmentId);
      if (!assigned.includes(String(assessment.establishmentId))) {
        return res.status(403).json({ success: false, message: 'Access denied: establishment not assigned to you' });
      }
    }
    const [decl, evidence] = await Promise.all([
      assessment.wageDeclarationId ? WageDeclarationModel.findById(assessment.wageDeclarationId).lean() : null,
      assessment.paymentEvidenceId ? PaymentEvidenceModel.findById(assessment.paymentEvidenceId).lean()  : null,
    ]);
    const est = establishments.find((e: any) => e.id === String(assessment.establishmentId));
    respond(res, { assessment, establishment: est || null, wageDeclaration: decl, paymentEvidence: evidence, feedbackSummary: assessment.feedbackSummary });
  } catch (err: any) { res.status(500).json({ success: false, message: 'Failed to fetch assessment detail.' }); }
});

app.patch('/api/twa/assessments/:id/review', auth, roles('LABOUR_OFFICER'), async (req: any, res) => {
  try {
    const p = z.object({
      decision: z.enum(['EXPLAINED','NOT_SUBSTANTIATED','CLARIFICATION_REQUESTED','REFERRED_FOR_INSPECTION']),
      comments: z.string().min(5),
      clarificationNote: z.string().optional(),
    }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: p.error.issues[0]?.message || 'Invalid review data' });
    const assessment: any = await TriangulatedAssessmentModel.findById(req.params.id);
    if (!assessment) return res.status(404).json({ success: false, message: 'Assessment not found' });
    if (!['INCOMPLETE','PENDING_REVIEW','CLARIFICATION_REQUESTED'].includes(assessment.assessmentStatus))
      return res.status(409).json({ success: false, message: 'This assessment has already been reviewed and closed.' });
    Object.assign(assessment, {
      assessmentStatus: p.data.decision, reviewedBy: req.user.id, reviewedAt: new Date(),
      reviewDecision: p.data.decision, reviewComments: p.data.comments,
      clarificationRequested: p.data.decision === 'CLARIFICATION_REQUESTED',
      clarificationNote: p.data.clarificationNote || '',
    });
    await assessment.save();
    const logAction = p.data.decision === 'CLARIFICATION_REQUESTED' ? 'CLARIFICATION_REQUESTED' : 'OFFICER_DECISION';
    await log(req.user.id, logAction, 'TriangulatedAssessment', String(assessment._id));
    respond(res, assessment, `Assessment review recorded: ${p.data.decision}`);
  } catch (err: any) { console.error('Assessment review error:', err.message); res.status(500).json({ success: false, message: 'Failed to record review.' }); }
});

app.patch('/api/twa/assessments/:id/employer-response', auth, roles('EMPLOYER'), async (req: any, res) => {
  try {
    const p = z.object({ clarification: z.string().min(10) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: p.error.issues[0]?.message });
    const assessment: any = await TriangulatedAssessmentModel.findById(req.params.id);
    if (!assessment) return res.status(404).json({ success: false, message: 'Assessment not found' });
    if (String(assessment.establishmentId) !== String(req.user.establishmentId))
      return res.status(403).json({ success: false, message: 'Access denied' });
    if (!assessment.clarificationRequested)
      return res.status(409).json({ success: false, message: 'Clarification has not been requested for this assessment.' });
    Object.assign(assessment, { employerClarification: p.data.clarification, employerClarifiedAt: new Date(), assessmentStatus: 'PENDING_REVIEW' });
    await assessment.save();
    await log(req.user.id, 'EMPLOYER_RESPONSE', 'TriangulatedAssessment', String(assessment._id));
    await generateAssessment(String(assessment.establishmentId), assessment.reportingPeriod, req.user.id).catch(console.error);
    respond(res, assessment, 'Clarification submitted. The officer will review it.');
  } catch (err: any) { res.status(500).json({ success: false, message: 'Failed to submit clarification.' }); }
});

app.post('/api/twa/assessments/generate', auth, roles('LABOUR_OFFICER'), async (req: any, res) => {
  try {
    const p = z.object({ establishmentId: z.string().min(1), reportingPeriod: z.string().min(3) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: p.error.issues[0]?.message || 'establishmentId and reportingPeriod are required' });
    await generateAssessment(p.data.establishmentId, p.data.reportingPeriod, req.user.id);
    const assessment = await TriangulatedAssessmentModel.findOne({ establishmentId: p.data.establishmentId, reportingPeriod: p.data.reportingPeriod }).lean();
    respond(res, assessment, 'Assessment generated successfully.');
  } catch (err: any) { console.error('Generate error:', err.message); res.status(500).json({ success: false, message: 'Failed to generate assessment.' }); }
});

// Employer fetches their own TWA assessments (for clarification responses)
app.get('/api/employer/twa-assessments', auth, roles('EMPLOYER'), async (req: any, res) => {
  try {
    const assessments = await TriangulatedAssessmentModel.find({ establishmentId: req.user.establishmentId }).sort({ generatedAt: -1 }).lean();
    respond(res, assessments);
  } catch (err: any) { res.status(500).json({ success: false, message: 'Failed to fetch assessments.' }); }
});

// ── TASK 2: Unified employer action-items aggregation ────────────────────────
app.get('/api/employer/action-items', auth, roles('EMPLOYER'), async (req: any, res) => {
  try {
    const estId = req.user.establishmentId;
    if (!estId) return respond(res, []);

    const items: any[] = [];

    // 1. Open notices
    const openNotices = await NoticeModel.find({ establishmentId: estId, status: { $ne: 'CLOSED' } }).lean();
    for (const n of openNotices) {
      items.push({
        itemType: 'NOTICE',
        referenceId: String((n as any)._id),
        displayId: (n as any).noticeNumber || String((n as any)._id),
        description: (n as any).description || 'Statutory show-cause notice',
        deadline: (n as any).responseDeadline,
        status: (n as any).status,
        details: n,
        stageInfo: {
          stage1Done: !!(n as any).employerResponse,
          stage1Status: (n as any).status,
        },
      });
    }

    // 2. TWA clarification requests
    const twaItems = await TriangulatedAssessmentModel.find({ establishmentId: estId, assessmentStatus: 'CLARIFICATION_REQUESTED' }).lean();
    for (const t of twaItems) {
      items.push({
        itemType: 'TWA_CLARIFICATION',
        referenceId: String((t as any)._id),
        displayId: `TWA-${String((t as any)._id).slice(-6).toUpperCase()}`,
        description: `Wage assurance clarification required for period: ${(t as any).reportingPeriod}`,
        deadline: null,
        status: (t as any).assessmentStatus,
        details: t,
        stageInfo: null,
      });
    }

    // 3. Rejected/correction-required documents from establishment
    const est = await EstablishmentModel.findById(estId).lean();
    const estDocs: any[] = (est as any)?.documents || [];
    for (const doc of estDocs) {
      if (['REJECTED', 'CORRECTION_REQUIRED'].includes(doc.verificationStatus)) {
        items.push({
          itemType: 'DOCUMENT',
          referenceId: doc.id || doc._id || String(doc.docName),
          displayId: `DOC-${String(doc.docName || 'DOC').slice(0, 8)}`,
          description: `Document requires re-upload: ${doc.docName || doc.docType}`,
          deadline: null,
          status: doc.verificationStatus,
          details: doc,
          stageInfo: null,
        });
      }
    }
    // Also check in-memory docs
    const memDocs = documents.filter((d) => String(d.establishmentId) === String(estId) && ['REJECTED', 'CORRECTION_REQUIRED'].includes(d.verificationStatus));
    for (const doc of memDocs) {
      if (!items.find((x) => x.referenceId === doc.id)) {
        items.push({
          itemType: 'DOCUMENT',
          referenceId: doc.id,
          displayId: doc.id,
          description: `Document requires re-upload: ${doc.docName || doc.docType}`,
          deadline: null,
          status: doc.verificationStatus,
          details: doc,
          stageInfo: null,
        });
      }
    }

    // 4. Open corrective actions
    const openCAs = await CorrectiveActionModel.find({ establishmentId: estId, verificationStatus: { $nin: ['ACCEPTED', 'CLOSED'] } }).lean();
    for (const ca of openCAs) {
      items.push({
        itemType: 'CORRECTIVE_ACTION',
        referenceId: String((ca as any)._id),
        displayId: `CA-${String((ca as any)._id).slice(-6).toUpperCase()}`,
        description: (ca as any).description || 'Corrective action pending',
        deadline: (ca as any).correctiveDeadline,
        status: (ca as any).verificationStatus || 'PENDING',
        details: ca,
        stageInfo: null,
      });
    }
    // Also check in-memory corrective actions
    const memCAs = correctiveActions.filter((a) => String(a.establishmentId) === String(estId) && !['ACCEPTED', 'CLOSED', 'VERIFIED'].includes(a.verificationStatus || a.status || ''));
    for (const ca of memCAs) {
      if (!items.find((x) => x.referenceId === ca.id)) {
        items.push({
          itemType: 'CORRECTIVE_ACTION',
          referenceId: ca.id,
          displayId: ca.id,
          description: ca.description || ca.requiredAction || 'Corrective action pending',
          deadline: ca.deadline,
          status: ca.verificationStatus || ca.status || 'PENDING',
          details: ca,
          stageInfo: null,
        });
      }
    }

    respond(res, items);
  } catch (err: any) {
    console.error('Action items error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch action items.' });
  }
});

// ═══════════════════════════════════════════════════════════════
// DATABASE SYNCHRONIZATION API
// ═══════════════════════════════════════════════════════════════

app.get('/api/sync', auth, async (_req: any, res) => {
  try {
    const counts = {
      users: await UserModel.countDocuments(),
      districts: await DistrictModel.countDocuments(),
      establishments: await EstablishmentModel.countDocuments(),
      inspections: await InspectionModel.countDocuments(),
      violations: await ViolationModel.countDocuments(),
      notices: await NoticeModel.countDocuments(),
      correctiveActions: await CorrectiveActionModel.countDocuments(),
      submissions: await ComplianceSubmissionModel.countDocuments(),
      wageDeclarations: await WageDeclarationModel.countDocuments(),
      paymentEvidence: await PaymentEvidenceModel.countDocuments(),
      workerFeedback: await WorkerFeedbackModel.countDocuments(),
      triangulatedAssessments: await TriangulatedAssessmentModel.countDocuments()
    };
    respond(res, { synced: true, counts }, 'Database synchronization status');
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Failed to query database sync status', error: err.message });
  }
});

app.post('/api/sync', auth, roles('LABOUR_OFFICER'), async (_req: any, res) => {
  try {
    await seed(true);
    const counts = {
      users: await UserModel.countDocuments(),
      districts: await DistrictModel.countDocuments(),
      establishments: await EstablishmentModel.countDocuments(),
      inspections: await InspectionModel.countDocuments(),
      violations: await ViolationModel.countDocuments(),
      notices: await NoticeModel.countDocuments(),
      correctiveActions: await CorrectiveActionModel.countDocuments(),
      submissions: await ComplianceSubmissionModel.countDocuments(),
      wageDeclarations: await WageDeclarationModel.countDocuments(),
      paymentEvidence: await PaymentEvidenceModel.countDocuments(),
      workerFeedback: await WorkerFeedbackModel.countDocuments(),
      triangulatedAssessments: await TriangulatedAssessmentModel.countDocuments()
    };
    respond(res, { synced: true, counts }, 'Database synchronized successfully');
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Failed to synchronize database', error: err.message });
  }
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

// ─── Mongoose connection resilience ────────────────────────────
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});
mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected – Mongoose will auto-reconnect.');
});
mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected successfully.');
});

mongoose
  .connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10000, // fail fast if Atlas unreachable
  })
  .then(async () => {
    console.log('MongoDB connected:', MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // hide credentials
    await seed();
    const port = Number(process.env.PORT) || 4000;
    app.listen(port, '0.0.0.0', () => console.log(`API listening on port ${port} (http://localhost:${port})`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
