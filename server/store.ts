import fs from 'node:fs';
import path from 'node:path';
import type {
  ActivityLogRecord,
  BdmsDatabase,
  ResidentRecord,
  UserRecord,
  UserRole,
} from '../src/types/bdms.ts';
import {
  getLastMysqlError,
  getMysqlDisplayInfo,
  initMysqlDatabase,
  isMysqlConfigured,
  loadMysqlDatabase,
  saveMysqlDatabase,
} from './mysql.ts';
import {createInitialDatabase, DEFAULT_SETTINGS, DEFAULT_TEMPLATES} from './seed.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'bdms-store.json');

if (!DB_FILE.startsWith(DATA_DIR + path.sep)) {
  throw new Error('Invalid database file path confinement');
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {recursive: true});
  }
}

function computeAge(bday: string): number {
  const dob = new Date(bday);
  if (Number.isNaN(dob.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

let cachedDb: BdmsDatabase | null = null;
let activeDriver: 'json' | 'mysql' = 'json';

function readJsonFile(): BdmsDatabase {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialDatabase(false);
    writeJsonFile(initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<BdmsDatabase>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      residents: Array.isArray(parsed.residents)
        ? parsed.residents.map((r) => ({...r, age: computeAge(r.bday)}))
        : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : [],
      staffOfficials: Array.isArray(parsed.staffOfficials) ? parsed.staffOfficials : [],
      templates:
        Array.isArray(parsed.templates) && parsed.templates.length > 0
          ? parsed.templates
          : DEFAULT_TEMPLATES,
      settings: parsed.settings ? {...DEFAULT_SETTINGS, ...parsed.settings} : DEFAULT_SETTINGS,
      activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : [],
    };
  } catch {
    const fallback = createInitialDatabase(false);
    writeJsonFile(fallback);
    return fallback;
  }
}

function writeJsonFile(db: BdmsDatabase): void {
  ensureDataDir();
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

export async function initializeDatabase(): Promise<'json' | 'mysql'> {
  const jsonDb = readJsonFile();
  if (isMysqlConfigured()) {
    try {
      await initMysqlDatabase(jsonDb);
      cachedDb = await loadMysqlDatabase();
      activeDriver = 'mysql';
      const info = getMysqlDisplayInfo();
      console.log(`BDMS storage initialized with MySQL (${info.host}:${info.port}/${info.database}).`);
      return 'mysql';
    } catch (err) {
      console.warn(
        'MySQL connection unavailable; falling back to local JSON store:',
        err instanceof Error ? err.message : err,
      );
    }
  } else {
    console.log('MYSQL_HOST/MYSQL_DATABASE not set in .env; using local JSON database.');
  }
  cachedDb = jsonDb;
  activeDriver = 'json';
  console.log('BDMS storage initialized with local JSON database (data/bdms-store.json).');
  return 'json';
}

export function getActiveStorageStatus() {
  const mysqlInfo = getMysqlDisplayInfo();
  return {
    driver: activeDriver,
    mysqlConfigured: isMysqlConfigured(),
    mysqlTarget: isMysqlConfigured() ? `${mysqlInfo.host}:${mysqlInfo.port}/${mysqlInfo.database}` : '',
    mysqlError: getLastMysqlError(),
  };
}

export function loadDatabase(): BdmsDatabase {
  if (cachedDb) return cachedDb;
  cachedDb = readJsonFile();
  return cachedDb;
}

export async function saveDatabase(db: BdmsDatabase): Promise<void> {
  cachedDb = db;
  if (activeDriver === 'mysql') {
    await saveMysqlDatabase(db);
  } else {
    writeJsonFile(db);
  }
}

export function toPublicUser(user: BdmsDatabase['users'][number]): UserRecord {
  const {passwordHash: _removed, ...rest} = user;
  return rest;
}

export function appendActivityLog(
  db: BdmsDatabase,
  actor: string,
  role: UserRole,
  action: string,
  details: string,
): void {
  const entry: ActivityLogRecord = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    actor,
    role,
    action,
    details,
  };
  db.activityLogs.unshift(entry);
  if (db.activityLogs.length > 150) {
    db.activityLogs = db.activityLogs.slice(0, 150);
  }
}

export function formatResidentFullName(r: ResidentRecord): string {
  const middleInitial = r.middleName ? `${r.middleName.charAt(0)}. ` : '';
  const suffix = r.suffix ? ` ${r.suffix}` : '';
  return `${r.firstName} ${middleInitial}${r.lastName}${suffix}`.replace(/\s+/g, ' ').trim();
}

export function generateSequentialCode(prefix: string, existingCodes: string[]): string {
  const year = new Date().getFullYear();
  const basePrefix = prefix.includes(String(year)) ? prefix : `${prefix}-${year}`;
  let maxSeq = 0;
  for (const code of existingCodes) {
    const match = code.match(/(\d+)$/);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > maxSeq) {
        maxSeq = n;
      }
    }
  }
  return `${basePrefix}-${String(maxSeq + 1).padStart(4, '0')}`;
}

export function calculateAge(bday: string): number {
  return computeAge(bday);
}
