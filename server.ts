import 'dotenv/config';
import express from 'express';
import type {NextFunction, Request, Response} from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  hashPassword,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
  verifyTimingSafeString,
} from './server/auth.ts';
import type {TokenPayload} from './server/auth.ts';
import {
  buildSampleResidents,
  buildSampleTransactionsAndPayments,
  DEFAULT_STAFF_OFFICIALS,
} from './server/seed.ts';
import {
  appendActivityLog,
  calculateAge,
  formatResidentFullName,
  generateSequentialCode,
  loadDatabase,
  saveDatabase,
  toPublicUser,
} from './server/store.ts';
import type {
  DocumentCategory,
  DocumentExtraFields,
  PaymentMethod,
  ResidentRecord,
  StaffOfficialRecord,
  TransactionStatus,
  UserRole,
} from './src/types/bdms.ts';

interface AuthenticatedRequest extends Request {
  auth?: TokenPayload;
}

const VALID_ROLES: UserRole[] = ['Admin', 'Staff', 'Treasurer'];
const VALID_TXN_STATUSES: TransactionStatus[] = [
  'Pending',
  'Processing',
  'For Payment',
  'Ready for Release',
  'Completed',
  'Cancelled',
];
const VALID_PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'GCash', 'Bank Transfer', 'Check'];
const VALID_CATEGORIES: DocumentCategory[] = [
  'Clearance',
  'Indigency',
  'Residency',
  'Certification',
  'Identification',
  'Business',
  'Custom',
];

function getEnvAdminPasscode(): string {
  return process.env.ADMIN_PASSCODE?.trim() || '';
}

function hasClaimedAdmin(): boolean {
  const db = loadDatabase();
  return db.users.some((u) => u.role === 'Admin' && u.status === 'Active' && Boolean(u.passwordHash));
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({error: 'Authentication required.'});
    return;
  }
  const token = header.slice(7).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({error: 'Session expired or invalid. Please sign in again.'});
    return;
  }

  if (payload.userId !== 'env-admin') {
    const db = loadDatabase();
    const user = db.users.find((u) => u.id === payload.userId);
    if (!user || user.status !== 'Active') {
      res.status(401).json({error: 'User account is inactive or no longer exists.'});
      return;
    }
    payload.role = user.role;
    payload.fullName = user.fullName;
  }

  req.auth = payload;
  next();
}

function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({error: 'Authentication required.'});
      return;
    }
    if (!allowedRoles.includes(req.auth.role)) {
      res.status(403).json({error: 'You do not have permission to perform this action.'});
      return;
    }
    next();
  };
}

function cleanStr(val: unknown, maxLen = 300): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function cleanNum(val: unknown, fallback = 0): number {
  const n = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeExtraFields(raw: unknown): DocumentExtraFields {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const out: DocumentExtraFields = {};
  if (typeof obj.authorized === 'string') out.authorized = cleanStr(obj.authorized, 160);
  if (typeof obj.patientName === 'string') out.patientName = cleanStr(obj.patientName, 160);
  if (typeof obj.isWithPatient === 'boolean') out.isWithPatient = obj.isWithPatient;
  if (typeof obj.isFTJS === 'boolean') out.isFTJS = obj.isFTJS;
  if (obj.monthlyEarning !== undefined) out.monthlyEarning = Math.max(0, cleanNum(obj.monthlyEarning, 0));
  if (obj.totalAmountExpenses !== undefined) {
    out.totalAmountExpenses = Math.max(0, cleanNum(obj.totalAmountExpenses, 0));
  }
  if (typeof obj.businessName === 'string') out.businessName = cleanStr(obj.businessName, 180);
  if (typeof obj.businessAddress === 'string') out.businessAddress = cleanStr(obj.businessAddress, 240);
  if (typeof obj.closureDate === 'string') out.closureDate = cleanStr(obj.closureDate, 40);
  if (typeof obj.residencyYears === 'string') out.residencyYears = cleanStr(obj.residencyYears, 60);
  return out;
}

async function createApp() {
  const app = express();
  app.use(express.json({limit: '2mb'}));

  // Ensure store file exists on boot
  loadDatabase();

  // ---------------- AUTH ROUTES ----------------

  app.get('/api/auth/status', (_req, res) => {
    const db = loadDatabase();
    const envPasscode = getEnvAdminPasscode();
    const needsInitialSetup = !envPasscode && !hasClaimedAdmin();
    res.json({
      needsInitialSetup,
      hasEnvPasscode: Boolean(envPasscode),
      barangayName: db.settings.barangayName,
      cityMunicipal: db.settings.cityMunicipal,
      province: db.settings.province,
    });
  });

  app.post('/api/auth/bootstrap', (req, res) => {
    const envPasscode = getEnvAdminPasscode();
    if (envPasscode || hasClaimedAdmin()) {
      res.status(403).json({error: 'Initial administrator account has already been configured.'});
      return;
    }

    const fullName = cleanStr(req.body?.fullName, 120);
    const username = cleanStr(req.body?.username, 60);
    const email = cleanStr(req.body?.email, 120);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const includeSampleData = req.body?.includeSampleData !== false;

    if (!fullName || !username || password.length < 6) {
      res.status(400).json({
        error: 'Full name, username, and a password of at least 6 characters are required.',
      });
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      res.status(400).json({
        error: 'Username may only contain letters, numbers, dots, underscores, or hyphens.',
      });
      return;
    }

    const db = loadDatabase();
    if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      res.status(409).json({error: 'Username is already taken.'});
      return;
    }

    if (includeSampleData) {
      if (db.residents.length === 0) {
        db.residents = buildSampleResidents();
      }
      if (db.staffOfficials.length === 0) {
        db.staffOfficials = DEFAULT_STAFF_OFFICIALS;
      }
      if (db.transactions.length === 0) {
        const sample = buildSampleTransactionsAndPayments();
        db.transactions = sample.transactions;
        db.payments = sample.payments;
      }
    }

    const newAdmin = {
      id: `usr-${Date.now()}`,
      code: generateSequentialCode('USR', db.users.map((u) => u.code)),
      residentCode: '',
      fullName,
      username,
      email,
      role: 'Admin' as UserRole,
      status: 'Active' as const,
      dateCreated: new Date().toISOString().slice(0, 10),
      passwordHash: hashPassword(password),
    };

    db.users.push(newAdmin);
    appendActivityLog(db, fullName, 'Admin', 'System Initialized', 'Claimed initial Administrator account');
    saveDatabase(db);

    const token = signSessionToken({
      userId: newAdmin.id,
      username: newAdmin.username,
      role: newAdmin.role,
      fullName: newAdmin.fullName,
    });

    res.status(201).json({token, user: toPublicUser(newAdmin)});
  });

  app.post('/api/auth/login', (req, res) => {
    const identifier = cleanStr(req.body?.identifier, 120);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!identifier || !password) {
      res.status(400).json({error: 'Username or email and password are required.'});
      return;
    }

    const db = loadDatabase();
    const envPasscode = getEnvAdminPasscode();
    const lowerId = identifier.toLowerCase();

    // Server-side ADMIN_PASSCODE override if configured
    if (envPasscode) {
      const matchedAdmin = db.users.find(
        (u) =>
          u.role === 'Admin' &&
          (u.username.toLowerCase() === lowerId || (u.email && u.email.toLowerCase() === lowerId)),
      );
      if ((lowerId === 'admin' || matchedAdmin) && verifyTimingSafeString(password, envPasscode)) {
        const adminUser = matchedAdmin
          ? toPublicUser(matchedAdmin)
          : {
              id: 'env-admin',
              code: 'USR-ADMIN',
              residentCode: '',
              fullName: 'Barangay System Administrator',
              username: 'admin',
              email: '',
              role: 'Admin' as UserRole,
              status: 'Active' as const,
              dateCreated: new Date().toISOString().slice(0, 10),
            };
        const token = signSessionToken({
          userId: adminUser.id,
          username: adminUser.username,
          role: 'Admin',
          fullName: adminUser.fullName,
        });
        appendActivityLog(db, adminUser.fullName, 'Admin', 'User Login', 'Signed in via administrator credentials');
        saveDatabase(db);
        res.json({token, user: adminUser});
        return;
      }
    }

    const user = db.users.find(
      (u) => u.username.toLowerCase() === lowerId || (u.email && u.email.toLowerCase() === lowerId),
    );

    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({error: 'Invalid username/email or password.'});
      return;
    }

    if (user.status !== 'Active') {
      res.status(403).json({error: 'This account has been deactivated. Contact the Administrator.'});
      return;
    }

    const token = signSessionToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
    });

    appendActivityLog(db, user.fullName, user.role, 'User Login', `Signed in as ${user.role}`);
    saveDatabase(db);
    res.json({token, user: toPublicUser(user)});
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const auth = req.auth!;
    if (auth.userId === 'env-admin') {
      res.json({
        user: {
          id: 'env-admin',
          code: 'USR-ADMIN',
          residentCode: '',
          fullName: 'Barangay System Administrator',
          username: 'admin',
          email: '',
          role: 'Admin',
          status: 'Active',
          dateCreated: new Date().toISOString().slice(0, 10),
        },
      });
      return;
    }
    const db = loadDatabase();
    const user = db.users.find((u) => u.id === auth.userId);
    if (!user) {
      res.status(404).json({error: 'User not found.'});
      return;
    }
    res.json({user: toPublicUser(user)});
  });

  // ---------------- DASHBOARD ROUTE ----------------

  app.get('/api/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const role = req.auth!.role;
    const today = new Date().toISOString().slice(0, 10);

    const statusCounts: Record<TransactionStatus, number> = {
      Pending: 0,
      Processing: 0,
      'For Payment': 0,
      'Ready for Release': 0,
      Completed: 0,
      Cancelled: 0,
    };
    const docTypeCounts: Record<string, number> = {};

    for (const txn of db.transactions) {
      statusCounts[txn.status] = (statusCounts[txn.status] || 0) + 1;
      docTypeCounts[txn.documentType] = (docTypeCounts[txn.documentType] || 0) + 1;
    }

    const paidPayments = db.payments.filter((p) => p.paymentStatus === 'Paid');
    const totalCollected = paidPayments.reduce((sum, p) => sum + p.amount, 0);
    const todayCollected = paidPayments
      .filter((p) => p.paymentDate === today)
      .reduce((sum, p) => sum + p.amount, 0);

    const purokMap: Record<string, number> = {};
    for (const r of db.residents) {
      purokMap[r.purok] = (purokMap[r.purok] || 0) + 1;
    }

    const recentTransactions = [...db.transactions]
      .sort((a, b) => b.dateCreated.localeCompare(a.dateCreated) || b.code.localeCompare(a.code))
      .slice(0, 8);

    const recentPayments = [...db.payments]
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.code.localeCompare(a.code))
      .slice(0, 8);

    res.json({
      stats: {
        totalResidents: db.residents.length,
        totalTransactions: db.transactions.length,
        pendingCount: statusCounts.Pending,
        processingCount: statusCounts.Processing,
        forPaymentCount: statusCounts['For Payment'],
        readyForReleaseCount: statusCounts['Ready for Release'],
        completedCount: statusCounts.Completed,
        cancelledCount: statusCounts.Cancelled,
        totalPaymentsCollected: totalCollected,
        todayCollections: todayCollected,
        unpaidRequestsCount: db.transactions.filter(
          (t) => t.paymentStatus === 'Unpaid' && t.status !== 'Cancelled',
        ).length,
        activeOfficialsCount: db.staffOfficials.filter((s) => s.status === 'Active').length,
      },
      docTypeBreakdown: Object.entries(docTypeCounts).map(([documentType, count]) => ({
        documentType,
        count,
      })),
      purokBreakdown: Object.entries(purokMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([purok, count]) => ({purok, count})),
      recentTransactions,
      recentPayments: role === 'Staff' ? [] : recentPayments,
      activityLogs: role === 'Admin' ? db.activityLogs.slice(0, 12) : [],
    });
  });

  // ---------------- USERS ROUTES (Admin Only) ----------------

  app.get('/api/users', requireAuth, requireRole('Admin'), (_req, res) => {
    const db = loadDatabase();
    res.json({users: db.users.map(toPublicUser)});
  });

  app.post('/api/users', requireAuth, requireRole('Admin'), (req: AuthenticatedRequest, res) => {
    const fullName = cleanStr(req.body?.fullName, 120);
    const username = cleanStr(req.body?.username, 60);
    const email = cleanStr(req.body?.email, 120);
    const residentCode = cleanStr(req.body?.residentCode, 40);
    const role = req.body?.role as UserRole;
    const status: 'Active' | 'Inactive' = req.body?.status === 'Inactive' ? 'Inactive' : 'Active';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!fullName || !username || !VALID_ROLES.includes(role) || password.length < 6) {
      res.status(400).json({
        error: 'Full name, valid role, username, and password (min 6 characters) are required.',
      });
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      res.status(400).json({error: 'Invalid username format.'});
      return;
    }

    const db = loadDatabase();
    if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      res.status(409).json({error: 'Username already exists.'});
      return;
    }
    if (email && db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      res.status(409).json({error: 'Email address is already in use.'});
      return;
    }

    const newUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      code: generateSequentialCode('USR', db.users.map((u) => u.code)),
      residentCode,
      fullName,
      username,
      email,
      role,
      status,
      dateCreated: new Date().toISOString().slice(0, 10),
      passwordHash: hashPassword(password),
    };

    db.users.push(newUser);
    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'User Created',
      `Created ${role} account for ${fullName} (${username})`,
    );
    saveDatabase(db);
    res.status(201).json({user: toPublicUser(newUser)});
  });

  app.patch('/api/users/:id', requireAuth, requireRole('Admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const idx = db.users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'User not found.'});
      return;
    }

    const current = db.users[idx];
    const nextRole = req.body?.role ? (req.body.role as UserRole) : current.role;
    const nextStatus = req.body?.status
      ? req.body.status === 'Inactive'
        ? 'Inactive'
        : 'Active'
      : current.status;

    if (!VALID_ROLES.includes(nextRole)) {
      res.status(400).json({error: 'Invalid role.'});
      return;
    }

    // Prevent locking out the last active Admin
    const isCurrentlyActiveAdmin = current.role === 'Admin' && current.status === 'Active';
    const remainsActiveAdmin = nextRole === 'Admin' && nextStatus === 'Active';
    if (isCurrentlyActiveAdmin && !remainsActiveAdmin) {
      const otherActiveAdmin = db.users.some(
        (u) => u.id !== current.id && u.role === 'Admin' && u.status === 'Active',
      );
      if (!otherActiveAdmin && !getEnvAdminPasscode()) {
        res.status(400).json({error: 'Cannot deactivate or demote the last active Administrator.'});
        return;
      }
    }

    const nextUsername = req.body?.username ? cleanStr(req.body.username, 60) : current.username;
    if (
      nextUsername.toLowerCase() !== current.username.toLowerCase() &&
      db.users.some((u) => u.id !== current.id && u.username.toLowerCase() === nextUsername.toLowerCase())
    ) {
      res.status(409).json({error: 'Username already exists.'});
      return;
    }

    let nextPasswordHash = current.passwordHash;
    if (typeof req.body?.newPassword === 'string' && req.body.newPassword.length > 0) {
      if (req.body.newPassword.length < 6) {
        res.status(400).json({error: 'New password must be at least 6 characters.'});
        return;
      }
      nextPasswordHash = hashPassword(req.body.newPassword);
    }

    db.users[idx] = {
      ...current,
      fullName: req.body?.fullName ? cleanStr(req.body.fullName, 120) : current.fullName,
      username: nextUsername,
      email: req.body?.email !== undefined ? cleanStr(req.body.email, 120) : current.email,
      residentCode:
        req.body?.residentCode !== undefined ? cleanStr(req.body.residentCode, 40) : current.residentCode,
      role: nextRole,
      status: nextStatus,
      passwordHash: nextPasswordHash,
    };

    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'User Updated',
      `Updated account ${db.users[idx].username} (${db.users[idx].role})`,
    );
    saveDatabase(db);
    res.json({user: toPublicUser(db.users[idx])});
  });

  app.delete('/api/users/:id', requireAuth, requireRole('Admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const idx = db.users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'User not found.'});
      return;
    }
    const target = db.users[idx];
    if (target.id === req.auth!.userId) {
      res.status(400).json({error: 'You cannot delete your own active session account.'});
      return;
    }
    if (target.role === 'Admin' && target.status === 'Active') {
      const otherActiveAdmin = db.users.some(
        (u) => u.id !== target.id && u.role === 'Admin' && u.status === 'Active',
      );
      if (!otherActiveAdmin && !getEnvAdminPasscode()) {
        res.status(400).json({error: 'Cannot delete the last active Administrator.'});
        return;
      }
    }

    db.users.splice(idx, 1);
    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'User Deleted',
      `Deleted account ${target.username}`,
    );
    saveDatabase(db);
    res.json({ok: true});
  });

  // ---------------- RESIDENTS ROUTES ----------------

  app.get('/api/residents', requireAuth, (req, res) => {
    const db = loadDatabase();
    const search = cleanStr(req.query.search, 100).toLowerCase();
    const purok = cleanStr(req.query.purok, 60);

    let list = db.residents;
    if (purok && purok !== 'All') {
      list = list.filter((r) => r.purok === purok);
    }
    if (search) {
      list = list.filter((r) => {
        const full = `${r.firstName} ${r.middleName} ${r.lastName} ${r.suffix}`.toLowerCase();
        return (
          full.includes(search) ||
          r.code.toLowerCase().includes(search) ||
          r.purok.toLowerCase().includes(search) ||
          r.contactNumber.toLowerCase().includes(search)
        );
      });
    }
    res.json({residents: list});
  });

  app.get('/api/residents/duplicates', requireAuth, requireRole('Admin', 'Staff'), (_req, res) => {
    const db = loadDatabase();
    const groups: ResidentRecord[][] = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < db.residents.length; i++) {
      const a = db.residents[i];
      if (seenIds.has(a.id)) continue;
      const matches: ResidentRecord[] = [a];
      const normA = `${a.firstName} ${a.lastName}`.trim().toLowerCase();

      for (let j = i + 1; j < db.residents.length; j++) {
        const b = db.residents[j];
        const normB = `${b.firstName} ${b.lastName}`.trim().toLowerCase();
        const sameName = normA === normB;
        const sameLastAndBday =
          a.lastName.trim().toLowerCase() === b.lastName.trim().toLowerCase() &&
          a.bday === b.bday &&
          a.firstName.trim().toLowerCase().slice(0, 3) === b.firstName.trim().toLowerCase().slice(0, 3);
        if (sameName || sameLastAndBday) {
          matches.push(b);
        }
      }
      if (matches.length > 1) {
        matches.forEach((m) => seenIds.add(m.id));
        groups.push(matches);
      }
    }

    res.json({duplicateGroups: groups});
  });

  app.post('/api/residents', requireAuth, requireRole('Admin', 'Staff'), (req: AuthenticatedRequest, res) => {
    const firstName = cleanStr(req.body?.firstName, 80);
    const lastName = cleanStr(req.body?.lastName, 80);
    const bday = cleanStr(req.body?.bday, 20);
    const purok = cleanStr(req.body?.purok, 60);

    if (!firstName || !lastName || !bday || !purok) {
      res.status(400).json({error: 'First name, last name, birthdate, and Purok are required.'});
      return;
    }

    const db = loadDatabase();
    const nowIso = new Date().toISOString();
    const code = generateSequentialCode(db.settings.resPrefix, db.residents.map((r) => r.code));
    const bldgNo = cleanStr(req.body?.bldgNo, 60);
    const streetPurokSector = cleanStr(req.body?.streetPurokSector, 120) || purok;
    const completeAddress =
      cleanStr(req.body?.completeAddress, 240) ||
      [bldgNo, streetPurokSector].filter(Boolean).join(', ');

    const newResident: ResidentRecord = {
      id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      code,
      firstName,
      middleName: cleanStr(req.body?.middleName, 80),
      lastName,
      suffix: cleanStr(req.body?.suffix, 20),
      sex: req.body?.sex === 'Female' ? 'Female' : 'Male',
      bday,
      age: calculateAge(bday),
      civilStatus: (['Single', 'Married', 'Widowed', 'Separated'].includes(req.body?.civilStatus)
        ? req.body.civilStatus
        : 'Single') as ResidentRecord['civilStatus'],
      bloodType: cleanStr(req.body?.bloodType, 10) || 'O+',
      completeAddress,
      purok,
      bldgNo,
      streetPurokSector,
      barangay: db.settings.barangayName,
      cityMunicipal: db.settings.cityMunicipal,
      province: db.settings.province,
      region: db.settings.region,
      contactNumber: cleanStr(req.body?.contactNumber, 30),
      occupation: cleanStr(req.body?.occupation, 100),
      voterStatus: Boolean(req.body?.voterStatus),
      pwdStatus: Boolean(req.body?.pwdStatus),
      seniorCitizenStatus: Boolean(req.body?.seniorCitizenStatus) || calculateAge(bday) >= 60,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    db.residents.unshift(newResident);
    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'Resident Registered',
      `Registered ${formatResidentFullName(newResident)} (${newResident.code})`,
    );
    saveDatabase(db);
    res.status(201).json({resident: newResident});
  });

  app.patch('/api/residents/:id', requireAuth, requireRole('Admin', 'Staff'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const idx = db.residents.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Resident not found.'});
      return;
    }

    const current = db.residents[idx];
    const nextBday = req.body?.bday ? cleanStr(req.body.bday, 20) : current.bday;
    const nextAge = calculateAge(nextBday);

    const updated: ResidentRecord = {
      ...current,
      firstName: req.body?.firstName ? cleanStr(req.body.firstName, 80) : current.firstName,
      middleName:
        req.body?.middleName !== undefined ? cleanStr(req.body.middleName, 80) : current.middleName,
      lastName: req.body?.lastName ? cleanStr(req.body.lastName, 80) : current.lastName,
      suffix: req.body?.suffix !== undefined ? cleanStr(req.body.suffix, 20) : current.suffix,
      sex: req.body?.sex === 'Female' || req.body?.sex === 'Male' ? req.body.sex : current.sex,
      bday: nextBday,
      age: nextAge,
      civilStatus: ['Single', 'Married', 'Widowed', 'Separated'].includes(req.body?.civilStatus)
        ? req.body.civilStatus
        : current.civilStatus,
      bloodType: req.body?.bloodType !== undefined ? cleanStr(req.body.bloodType, 10) : current.bloodType,
      completeAddress:
        req.body?.completeAddress !== undefined
          ? cleanStr(req.body.completeAddress, 240)
          : current.completeAddress,
      purok: req.body?.purok ? cleanStr(req.body.purok, 60) : current.purok,
      bldgNo: req.body?.bldgNo !== undefined ? cleanStr(req.body.bldgNo, 60) : current.bldgNo,
      streetPurokSector:
        req.body?.streetPurokSector !== undefined
          ? cleanStr(req.body.streetPurokSector, 120)
          : current.streetPurokSector,
      contactNumber:
        req.body?.contactNumber !== undefined
          ? cleanStr(req.body.contactNumber, 30)
          : current.contactNumber,
      occupation:
        req.body?.occupation !== undefined ? cleanStr(req.body.occupation, 100) : current.occupation,
      voterStatus: req.body?.voterStatus !== undefined ? Boolean(req.body.voterStatus) : current.voterStatus,
      pwdStatus: req.body?.pwdStatus !== undefined ? Boolean(req.body.pwdStatus) : current.pwdStatus,
      seniorCitizenStatus:
        req.body?.seniorCitizenStatus !== undefined
          ? Boolean(req.body.seniorCitizenStatus)
          : current.seniorCitizenStatus,
      updatedAt: new Date().toISOString(),
    };

    db.residents[idx] = updated;
    const formattedName = formatResidentFullName(updated);
    db.transactions.forEach((t) => {
      if (t.residentCode === updated.code) t.residentName = formattedName;
    });
    db.payments.forEach((p) => {
      if (p.resCode === updated.code) p.residentName = formattedName;
    });

    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'Resident Updated',
      `Updated profile for ${formattedName} (${updated.code})`,
    );
    saveDatabase(db);
    res.json({resident: updated});
  });

  app.delete('/api/residents/:id', requireAuth, requireRole('Admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const idx = db.residents.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Resident not found.'});
      return;
    }
    const target = db.residents[idx];
    db.residents.splice(idx, 1);
    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'Resident Deleted',
      `Removed resident record ${formatResidentFullName(target)} (${target.code})`,
    );
    saveDatabase(db);
    res.json({ok: true});
  });

  // ---------------- TRANSACTIONS ROUTES ----------------

  app.get('/api/transactions', requireAuth, (req, res) => {
    const db = loadDatabase();
    const status = cleanStr(req.query.status, 40);
    const search = cleanStr(req.query.search, 100).toLowerCase();

    let list = [...db.transactions].sort(
      (a, b) => b.dateCreated.localeCompare(a.dateCreated) || b.code.localeCompare(a.code),
    );
    if (status && status !== 'All') {
      list = list.filter((t) => t.status === status);
    }
    if (search) {
      list = list.filter(
        (t) =>
          t.code.toLowerCase().includes(search) ||
          t.residentName.toLowerCase().includes(search) ||
          t.residentCode.toLowerCase().includes(search) ||
          t.documentType.toLowerCase().includes(search) ||
          t.purpose.toLowerCase().includes(search),
      );
    }
    res.json({transactions: list});
  });

  app.post('/api/transactions', requireAuth, requireRole('Admin', 'Staff'), (req: AuthenticatedRequest, res) => {
    const residentCode = cleanStr(req.body?.residentCode, 40);
    const templateCode = cleanStr(req.body?.templateCode, 40);
    const purpose = cleanStr(req.body?.purpose, 240);
    const remarks = cleanStr(req.body?.remarks, 240);
    const isBypass = req.auth!.role === 'Admin' && Boolean(req.body?.isBypass);
    const extraFields = sanitizeExtraFields(req.body?.extraFields);

    if (!residentCode || !templateCode || !purpose) {
      res.status(400).json({error: 'Resident, document type, and purpose are required.'});
      return;
    }

    const db = loadDatabase();
    const resident = db.residents.find((r) => r.code === residentCode);
    if (!resident) {
      res.status(404).json({error: 'Selected resident was not found.'});
      return;
    }

    const template = db.templates.find((t) => t.code === templateCode && t.isActive);
    if (!template) {
      res.status(404).json({error: 'Selected document template is not available.'});
      return;
    }

    const isWaived = !template.requiresPayment || template.defaultFee <= 0 || Boolean(extraFields.isFTJS) || isBypass;
    const feeAmount = isWaived ? 0 : template.defaultFee;
    const today = new Date().toISOString().slice(0, 10);
    const code = generateSequentialCode(db.settings.txnPrefix, db.transactions.map((t) => t.code));
    const validityLabel =
      template.validityDays >= 365
        ? `${Math.round(template.validityDays / 365)} Year`
        : `${Math.max(1, Math.round(template.validityDays / 30))} Months`;

    const newTxn = {
      id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      code,
      residentCode: resident.code,
      residentName: formatResidentFullName(resident),
      templateCode: template.code,
      documentType: template.name,
      category: template.category,
      purpose,
      dateCreated: today,
      issueDate: isWaived ? today : '',
      signedBy: template.signatoryName || db.settings.punongBarangay,
      processedBy: req.auth!.fullName,
      validity: validityLabel,
      remarks,
      isBypass,
      feeAmount,
      paymentStatus: isWaived ? ('Waived' as const) : ('Unpaid' as const),
      status: isWaived ? ('Processing' as TransactionStatus) : ('For Payment' as TransactionStatus),
      extraFields,
    };

    db.transactions.unshift(newTxn);
    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'Document Request Created',
      `${newTxn.code} — ${newTxn.documentType} for ${newTxn.residentName}`,
    );
    saveDatabase(db);
    res.status(201).json({transaction: newTxn});
  });

  app.patch('/api/transactions/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const idx = db.transactions.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Transaction not found.'});
      return;
    }

    const current = db.transactions[idx];
    const nextStatus = req.body?.status ? (req.body.status as TransactionStatus) : current.status;
    if (!VALID_TXN_STATUSES.includes(nextStatus)) {
      res.status(400).json({error: 'Invalid transaction status.'});
      return;
    }

    // Treasurer can only update notes or mark Ready for Release / For Payment unless payment settled
    if (req.auth!.role === 'Treasurer' && nextStatus === 'Completed' && current.paymentStatus === 'Unpaid') {
      res.status(400).json({error: 'Cannot complete an unpaid transaction before recording payment.'});
      return;
    }

    const nextBypass =
      req.auth!.role === 'Admin' && req.body?.isBypass !== undefined
        ? Boolean(req.body.isBypass)
        : current.isBypass;

    if (
      nextStatus === 'Completed' &&
      current.paymentStatus === 'Unpaid' &&
      !nextBypass
    ) {
      res.status(400).json({
        error: 'Payment must be settled by the Treasurer before releasing this document.',
      });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const updated = {
      ...current,
      status: nextStatus,
      isBypass: nextBypass,
      paymentStatus: nextBypass && current.paymentStatus === 'Unpaid' ? 'Waived' : current.paymentStatus,
      feeAmount: nextBypass ? 0 : current.feeAmount,
      issueDate:
        nextStatus === 'Ready for Release' || nextStatus === 'Completed'
          ? current.issueDate || today
          : current.issueDate,
      remarks: req.body?.remarks !== undefined ? cleanStr(req.body.remarks, 240) : current.remarks,
      purpose:
        req.auth!.role !== 'Treasurer' && req.body?.purpose
          ? cleanStr(req.body.purpose, 240)
          : current.purpose,
      extraFields:
        req.auth!.role !== 'Treasurer' && req.body?.extraFields
          ? sanitizeExtraFields(req.body.extraFields)
          : current.extraFields,
    };

    db.transactions[idx] = updated;
    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'Transaction Updated',
      `${updated.code} status set to ${updated.status}`,
    );
    saveDatabase(db);
    res.json({transaction: updated});
  });

  // ---------------- PAYMENTS ROUTES (Treasurer & Admin) ----------------

  app.get('/api/payments', requireAuth, requireRole('Treasurer', 'Admin'), (_req, res) => {
    const db = loadDatabase();
    const awaitingPayment = db.transactions.filter(
      (t) => t.paymentStatus === 'Unpaid' && t.status !== 'Cancelled' && t.feeAmount > 0,
    );
    const payments = [...db.payments].sort(
      (a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.code.localeCompare(a.code),
    );
    res.json({payments, awaitingPayment});
  });

  app.post('/api/payments', requireAuth, requireRole('Treasurer', 'Admin'), (req: AuthenticatedRequest, res) => {
    const transactionCode = cleanStr(req.body?.transactionCode, 40);
    const amount = cleanNum(req.body?.amount, -1);
    const paymentMethod = req.body?.paymentMethod as PaymentMethod;
    const cedulaNo = cleanStr(req.body?.cedulaNo, 60);
    const remarks = cleanStr(req.body?.remarks, 200);
    const requestedOrNo = cleanStr(req.body?.orNo, 40);

    if (!transactionCode || amount <= 0 || !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      res.status(400).json({error: 'Valid transaction, positive amount, and payment method are required.'});
      return;
    }

    const db = loadDatabase();
    const txnIdx = db.transactions.findIndex((t) => t.code === transactionCode);
    if (txnIdx === -1) {
      res.status(404).json({error: 'Referenced transaction not found.'});
      return;
    }
    const txn = db.transactions[txnIdx];
    if (txn.status === 'Cancelled') {
      res.status(400).json({error: 'Cannot record payment for a cancelled transaction.'});
      return;
    }
    if (txn.paymentStatus === 'Paid') {
      res.status(409).json({error: 'This transaction has already been paid.'});
      return;
    }

    const orNo =
      requestedOrNo || generateSequentialCode(db.settings.orPrefix, db.payments.map((p) => p.orNo));
    if (db.payments.some((p) => p.orNo.toLowerCase() === orNo.toLowerCase() && p.paymentStatus === 'Paid')) {
      res.status(409).json({error: 'Official Receipt (OR) number already exists.'});
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const newPayment = {
      id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      code: generateSequentialCode('PAY', db.payments.map((p) => p.code)),
      transactionCode: txn.code,
      resCode: txn.residentCode,
      residentName: txn.residentName,
      documentType: txn.documentType,
      amount,
      orNo,
      cedulaNo,
      paymentMethod,
      paymentDate: today,
      receivedBy: req.auth!.fullName,
      paymentStatus: 'Paid' as const,
      remarks,
    };

    db.payments.unshift(newPayment);
    db.transactions[txnIdx] = {
      ...txn,
      paymentStatus: 'Paid',
      issueDate: txn.issueDate || today,
      status:
        txn.status === 'For Payment' || txn.status === 'Pending'
          ? 'Ready for Release'
          : txn.status,
    };

    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'Payment Recorded',
      `${newPayment.orNo} (PHP ${amount.toFixed(2)}) for ${txn.code}`,
    );
    saveDatabase(db);
    res.status(201).json({payment: newPayment, transaction: db.transactions[txnIdx]});
  });

  app.post(
    '/api/payments/:id/refund',
    requireAuth,
    requireRole('Treasurer', 'Admin'),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const idx = db.payments.findIndex((p) => p.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({error: 'Payment record not found.'});
        return;
      }
      const current = db.payments[idx];
      if (current.paymentStatus === 'Refunded') {
        res.status(400).json({error: 'Payment has already been refunded.'});
        return;
      }

      db.payments[idx] = {
        ...current,
        paymentStatus: 'Refunded',
        remarks: cleanStr(req.body?.remarks, 200) || 'Refunded by Barangay Treasury',
      };

      const txnIdx = db.transactions.findIndex((t) => t.code === current.transactionCode);
      if (txnIdx !== -1) {
        db.transactions[txnIdx] = {
          ...db.transactions[txnIdx],
          paymentStatus: 'Refunded',
          status: 'Cancelled',
        };
      }

      appendActivityLog(
        db,
        req.auth!.fullName,
        req.auth!.role,
        'Payment Refunded',
        `Refunded ${current.orNo} (${current.transactionCode})`,
      );
      saveDatabase(db);
      res.json({payment: db.payments[idx]});
    },
  );

  // ---------------- STAFF & OFFICIALS + ORG CHART ----------------

  app.get('/api/staff', requireAuth, (_req, res) => {
    const db = loadDatabase();
    res.json({staffOfficials: db.staffOfficials});
  });

  app.post('/api/staff', requireAuth, requireRole('Admin'), (req: AuthenticatedRequest, res) => {
    const fullName = cleanStr(req.body?.fullName, 120);
    const position = cleanStr(req.body?.position, 100);
    const tier = [1, 2, 3].includes(Number(req.body?.tier)) ? (Number(req.body.tier) as 1 | 2 | 3) : 2;
    if (!fullName || !position) {
      res.status(400).json({error: 'Full name and position are required.'});
      return;
    }

    const db = loadDatabase();
    const record: StaffOfficialRecord = {
      id: `off-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      code: generateSequentialCode('OFF', db.staffOfficials.map((s) => s.code)),
      resCode: cleanStr(req.body?.resCode, 40),
      fullName,
      position,
      tier,
      committee: cleanStr(req.body?.committee, 140),
      reportsTo: cleanStr(req.body?.reportsTo, 40),
      contactNumber: cleanStr(req.body?.contactNumber, 30),
      termStart: cleanStr(req.body?.termStart, 20),
      termEnd: cleanStr(req.body?.termEnd, 20),
      status: req.body?.status === 'Inactive' ? 'Inactive' : 'Active',
    };

    db.staffOfficials.push(record);
    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'Official Added',
      `Added ${record.fullName} — ${record.position}`,
    );
    saveDatabase(db);
    res.status(201).json({official: record});
  });

  app.patch('/api/staff/:id', requireAuth, requireRole('Admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const idx = db.staffOfficials.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Official record not found.'});
      return;
    }

    const current = db.staffOfficials[idx];
    const nextTier = [1, 2, 3].includes(Number(req.body?.tier))
      ? (Number(req.body.tier) as 1 | 2 | 3)
      : current.tier;

    db.staffOfficials[idx] = {
      ...current,
      fullName: req.body?.fullName ? cleanStr(req.body.fullName, 120) : current.fullName,
      position: req.body?.position ? cleanStr(req.body.position, 100) : current.position,
      tier: nextTier,
      committee: req.body?.committee !== undefined ? cleanStr(req.body.committee, 140) : current.committee,
      reportsTo: req.body?.reportsTo !== undefined ? cleanStr(req.body.reportsTo, 40) : current.reportsTo,
      contactNumber:
        req.body?.contactNumber !== undefined ? cleanStr(req.body.contactNumber, 30) : current.contactNumber,
      termStart: req.body?.termStart !== undefined ? cleanStr(req.body.termStart, 20) : current.termStart,
      termEnd: req.body?.termEnd !== undefined ? cleanStr(req.body.termEnd, 20) : current.termEnd,
      resCode: req.body?.resCode !== undefined ? cleanStr(req.body.resCode, 40) : current.resCode,
      status:
        req.body?.status === 'Inactive' || req.body?.status === 'Active' ? req.body.status : current.status,
    };

    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'Official Updated',
      `Updated ${db.staffOfficials[idx].fullName}`,
    );
    saveDatabase(db);
    res.json({official: db.staffOfficials[idx]});
  });

  app.delete('/api/staff/:id', requireAuth, requireRole('Admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const idx = db.staffOfficials.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Official record not found.'});
      return;
    }
    const removed = db.staffOfficials[idx];
    db.staffOfficials.splice(idx, 1);
    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'Official Removed',
      `Removed ${removed.fullName} (${removed.code})`,
    );
    saveDatabase(db);
    res.json({ok: true});
  });

  // ---------------- DOCUMENT TEMPLATES & SETTINGS ----------------

  app.get('/api/templates', requireAuth, (_req, res) => {
    const db = loadDatabase();
    res.json({templates: db.templates});
  });

  app.post('/api/templates', requireAuth, requireRole('Admin'), (req: AuthenticatedRequest, res) => {
    const name = cleanStr(req.body?.name, 100);
    const headerTitle = cleanStr(req.body?.headerTitle, 140);
    const bodyTemplate = cleanStr(req.body?.bodyTemplate, 4000);
    const category = VALID_CATEGORIES.includes(req.body?.category)
      ? (req.body.category as DocumentCategory)
      : 'Custom';

    if (!name || !headerTitle || !bodyTemplate) {
      res.status(400).json({error: 'Document name, header title, and template body are required.'});
      return;
    }

    const db = loadDatabase();
    const newTemplate = {
      id: `tpl-${Date.now()}`,
      code: generateSequentialCode('TPL', db.templates.map((t) => t.code)),
      name,
      category,
      defaultFee: Math.max(0, cleanNum(req.body?.defaultFee, 0)),
      requiresPayment: Boolean(req.body?.requiresPayment),
      validityDays: Math.max(1, cleanNum(req.body?.validityDays, 180)),
      headerTitle,
      bodyTemplate,
      signatoryName: cleanStr(req.body?.signatoryName, 120) || db.settings.punongBarangay,
      signatoryTitle: cleanStr(req.body?.signatoryTitle, 80) || 'Punong Barangay',
      isActive: req.body?.isActive !== false,
      description: cleanStr(req.body?.description, 240),
    };

    db.templates.push(newTemplate);
    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'Template Created',
      `Created document template: ${newTemplate.name}`,
    );
    saveDatabase(db);
    res.status(201).json({template: newTemplate});
  });

  app.patch('/api/templates/:id', requireAuth, requireRole('Admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const idx = db.templates.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Template not found.'});
      return;
    }

    const current = db.templates[idx];
    db.templates[idx] = {
      ...current,
      name: req.body?.name ? cleanStr(req.body.name, 100) : current.name,
      category: VALID_CATEGORIES.includes(req.body?.category) ? req.body.category : current.category,
      defaultFee:
        req.body?.defaultFee !== undefined ? Math.max(0, cleanNum(req.body.defaultFee, 0)) : current.defaultFee,
      requiresPayment:
        req.body?.requiresPayment !== undefined ? Boolean(req.body.requiresPayment) : current.requiresPayment,
      validityDays:
        req.body?.validityDays !== undefined
          ? Math.max(1, cleanNum(req.body.validityDays, 180))
          : current.validityDays,
      headerTitle: req.body?.headerTitle ? cleanStr(req.body.headerTitle, 140) : current.headerTitle,
      bodyTemplate: req.body?.bodyTemplate ? cleanStr(req.body.bodyTemplate, 4000) : current.bodyTemplate,
      signatoryName:
        req.body?.signatoryName !== undefined
          ? cleanStr(req.body.signatoryName, 120)
          : current.signatoryName,
      signatoryTitle:
        req.body?.signatoryTitle !== undefined
          ? cleanStr(req.body.signatoryTitle, 80)
          : current.signatoryTitle,
      isActive: req.body?.isActive !== undefined ? Boolean(req.body.isActive) : current.isActive,
      description:
        req.body?.description !== undefined ? cleanStr(req.body.description, 240) : current.description,
    };

    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'Template Updated',
      `Updated template: ${db.templates[idx].name}`,
    );
    saveDatabase(db);
    res.json({template: db.templates[idx]});
  });

  app.delete('/api/templates/:id', requireAuth, requireRole('Admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const idx = db.templates.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Template not found.'});
      return;
    }
    const removed = db.templates[idx];
    db.templates.splice(idx, 1);
    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'Template Deleted',
      `Deleted template: ${removed.name}`,
    );
    saveDatabase(db);
    res.json({ok: true});
  });

  app.get('/api/settings', requireAuth, (_req, res) => {
    const db = loadDatabase();
    res.json({settings: db.settings});
  });

  app.patch('/api/settings', requireAuth, requireRole('Admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    db.settings = {
      ...db.settings,
      barangayName: req.body?.barangayName ? cleanStr(req.body.barangayName, 100) : db.settings.barangayName,
      cityMunicipal: req.body?.cityMunicipal
        ? cleanStr(req.body.cityMunicipal, 100)
        : db.settings.cityMunicipal,
      province: req.body?.province ? cleanStr(req.body.province, 100) : db.settings.province,
      region: req.body?.region ? cleanStr(req.body.region, 100) : db.settings.region,
      punongBarangay: req.body?.punongBarangay
        ? cleanStr(req.body.punongBarangay, 120)
        : db.settings.punongBarangay,
      secretaryName: req.body?.secretaryName
        ? cleanStr(req.body.secretaryName, 120)
        : db.settings.secretaryName,
      treasurerName: req.body?.treasurerName
        ? cleanStr(req.body.treasurerName, 120)
        : db.settings.treasurerName,
      orPrefix: req.body?.orPrefix ? cleanStr(req.body.orPrefix, 20) : db.settings.orPrefix,
      txnPrefix: req.body?.txnPrefix ? cleanStr(req.body.txnPrefix, 20) : db.settings.txnPrefix,
      resPrefix: req.body?.resPrefix ? cleanStr(req.body.resPrefix, 20) : db.settings.resPrefix,
      officeAddress: req.body?.officeAddress
        ? cleanStr(req.body.officeAddress, 240)
        : db.settings.officeAddress,
      contactInfo: req.body?.contactInfo ? cleanStr(req.body.contactInfo, 160) : db.settings.contactInfo,
    };
    appendActivityLog(
      db,
      req.auth!.fullName,
      req.auth!.role,
      'Settings Updated',
      'Updated Barangay Ocho system configuration',
    );
    saveDatabase(db);
    res.json({settings: db.settings});
  });

  app.get('/api/backup/export', requireAuth, requireRole('Admin'), (_req, res) => {
    const db = loadDatabase();
    res.json({
      exportedAt: new Date().toISOString(),
      settings: db.settings,
      residents: db.residents,
      transactions: db.transactions,
      payments: db.payments,
      staffOfficials: db.staffOfficials,
      templates: db.templates,
      users: db.users.map(toPublicUser),
    });
  });

  // ---------------- REPORTS ROUTE ----------------

  app.get('/api/reports', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const role = req.auth!.role;
    const from = cleanStr(req.query.from, 20);
    const to = cleanStr(req.query.to, 20);
    const docType = cleanStr(req.query.documentType, 100);

    let filteredTransactions = db.transactions;
    if (from) filteredTransactions = filteredTransactions.filter((t) => t.dateCreated >= from);
    if (to) filteredTransactions = filteredTransactions.filter((t) => t.dateCreated <= to);
    if (docType && docType !== 'All') {
      filteredTransactions = filteredTransactions.filter((t) => t.documentType === docType);
    }

    let filteredPayments = db.payments;
    if (from) filteredPayments = filteredPayments.filter((p) => p.paymentDate >= from);
    if (to) filteredPayments = filteredPayments.filter((p) => p.paymentDate <= to);
    if (docType && docType !== 'All') {
      filteredPayments = filteredPayments.filter((p) => p.documentType === docType);
    }

    const canSeeResidents = role === 'Admin' || role === 'Staff';
    const canSeeFinancials = role === 'Admin' || role === 'Treasurer';

    const residentSummary = canSeeResidents
      ? {
          total: db.residents.length,
          male: db.residents.filter((r) => r.sex === 'Male').length,
          female: db.residents.filter((r) => r.sex === 'Female').length,
          voters: db.residents.filter((r) => r.voterStatus).length,
          pwd: db.residents.filter((r) => r.pwdStatus).length,
          seniors: db.residents.filter((r) => r.seniorCitizenStatus).length,
          byPurok: Object.entries(
            db.residents.reduce<Record<string, number>>((acc, r) => {
              acc[r.purok] = (acc[r.purok] || 0) + 1;
              return acc;
            }, {}),
          )
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([purok, count]) => ({purok, count})),
          records: db.residents,
        }
      : null;

    const paidList = filteredPayments.filter((p) => p.paymentStatus === 'Paid');
    const refundedList = filteredPayments.filter((p) => p.paymentStatus === 'Refunded');
    const financialSummary = canSeeFinancials
      ? {
          totalCollected: paidList.reduce((s, p) => s + p.amount, 0),
          totalRefunded: refundedList.reduce((s, p) => s + p.amount, 0),
          receiptCount: paidList.length,
          byMethod: Object.entries(
            paidList.reduce<Record<string, number>>((acc, p) => {
              acc[p.paymentMethod] = (acc[p.paymentMethod] || 0) + p.amount;
              return acc;
            }, {}),
          ).map(([method, amount]) => ({method, amount})),
          byDate: Object.entries(
            paidList.reduce<Record<string, {count: number; amount: number}>>((acc, p) => {
              if (!acc[p.paymentDate]) acc[p.paymentDate] = {count: 0, amount: 0};
              acc[p.paymentDate].count += 1;
              acc[p.paymentDate].amount += p.amount;
              return acc;
            }, {}),
          )
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, v]) => ({date, ...v})),
          records: filteredPayments,
        }
      : null;

    res.json({
      residentSummary,
      transactionSummary: {
        total: filteredTransactions.length,
        byStatus: Object.entries(
          filteredTransactions.reduce<Record<string, number>>((acc, t) => {
            acc[t.status] = (acc[t.status] || 0) + 1;
            return acc;
          }, {}),
        ).map(([status, count]) => ({status, count})),
        byDocumentType: Object.entries(
          filteredTransactions.reduce<Record<string, number>>((acc, t) => {
            acc[t.documentType] = (acc[t.documentType] || 0) + 1;
            return acc;
          }, {}),
        ).map(([documentType, count]) => ({documentType, count})),
        records: filteredTransactions,
      },
      financialSummary,
    });
  });

  // ---------------- VITE / STATIC SERVING ----------------

  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(process.cwd(), 'dist');

  if (!isProd || !fs.existsSync(distPath)) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Barangay Ocho BDMS server running on http://0.0.0.0:${port}`);
  });
}

createApp();
