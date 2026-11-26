import mysql from 'mysql2/promise';
import type {Pool, RowDataPacket} from 'mysql2/promise';
import type {
  ActivityLogRecord,
  BarangaySettings,
  BdmsDatabase,
  DocumentTemplateRecord,
  PaymentRecord,
  ResidentRecord,
  StaffOfficialRecord,
  StoredUserRecord,
  TransactionRecord,
} from '../src/types/bdms.ts';
import {DEFAULT_SETTINGS, DEFAULT_TEMPLATES} from './seed.ts';

let pool: Pool | null = null;
let lastMysqlError: string | null = null;

export function isMysqlConfigured(): boolean {
  return Boolean(process.env.MYSQL_HOST?.trim() && process.env.MYSQL_DATABASE?.trim());
}

export function getLastMysqlError(): string | null {
  return lastMysqlError;
}

export function getMysqlDisplayInfo(): {host: string; port: number; database: string} {
  const cfg = getMysqlConfig();
  return {host: cfg.host, port: cfg.port, database: cfg.database};
}

function getMysqlConfig() {
  const rawHost = process.env.MYSQL_HOST?.trim() || '127.0.0.1';
  // Force IPv4 loopback when localhost is specified so Node 22 does not hit ::1 ECONNREFUSED
  const host = rawHost.toLowerCase() === 'localhost' ? '127.0.0.1' : rawHost;
  const port = Number(process.env.MYSQL_PORT?.trim() || '3306');
  const user = process.env.MYSQL_USER?.trim() || 'root';
  const password = process.env.MYSQL_PASSWORD ?? '';
  const database = process.env.MYSQL_DATABASE?.trim() || 'bdms_offline';
  return {host, port, user, password, database};
}

async function ensureColumn(
  p: Pool,
  database: string,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const [rows] = await p.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [database, table, column],
  );
  if (Number(rows[0]?.cnt || 0) === 0) {
    await p.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

export async function initMysqlDatabase(fallbackJsonDb?: BdmsDatabase): Promise<void> {
  const cfg = getMysqlConfig();
  if (!/^[a-zA-Z0-9_]+$/.test(cfg.database)) {
    throw new Error('Invalid MYSQL_DATABASE identifier');
  }

  try {
    const bootstrapConn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
    });
    await bootstrapConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await bootstrapConn.end();

    pool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      waitForConnections: true,
      connectionLimit: 10,
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(40) NOT NULL UNIQUE,
        resident_code VARCHAR(40) NOT NULL DEFAULT '',
        full_name VARCHAR(120) NOT NULL,
        username VARCHAR(60) NOT NULL UNIQUE,
        email VARCHAR(120) NOT NULL DEFAULT '',
        role ENUM('Admin', 'Staff', 'Treasurer') NOT NULL,
        status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
        date_created VARCHAR(20) NOT NULL,
        password_hash VARCHAR(255) NOT NULL
      ) ENGINE=InnoDB
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS residents (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(40) NOT NULL UNIQUE,
        first_name VARCHAR(80) NOT NULL,
        middle_name VARCHAR(80) NOT NULL DEFAULT '',
        last_name VARCHAR(80) NOT NULL,
        suffix VARCHAR(20) NOT NULL DEFAULT '',
        sex ENUM('Male', 'Female') NOT NULL,
        bday VARCHAR(20) NOT NULL,
        age INT NOT NULL DEFAULT 0,
        civil_status VARCHAR(30) NOT NULL,
        blood_type VARCHAR(10) NOT NULL DEFAULT 'O+',
        complete_address VARCHAR(255) NOT NULL DEFAULT '',
        purok VARCHAR(60) NOT NULL,
        bldg_no VARCHAR(60) NOT NULL DEFAULT '',
        street_purok_sector VARCHAR(120) NOT NULL DEFAULT '',
        barangay VARCHAR(100) NOT NULL,
        city_municipal VARCHAR(100) NOT NULL,
        province VARCHAR(100) NOT NULL,
        region VARCHAR(100) NOT NULL,
        contact_number VARCHAR(30) NOT NULL DEFAULT '',
        occupation VARCHAR(100) NOT NULL DEFAULT '',
        voter_status TINYINT(1) NOT NULL DEFAULT 0,
        pwd_status TINYINT(1) NOT NULL DEFAULT 0,
        senior_citizen_status TINYINT(1) NOT NULL DEFAULT 0,
        photo_url VARCHAR(255) NOT NULL DEFAULT '',
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL
      ) ENGINE=InnoDB
    `);

    // Ensure photo_url exists even if residents table was created earlier without it
    await ensureColumn(pool, cfg.database, 'residents', 'photo_url', "VARCHAR(255) NOT NULL DEFAULT ''");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(40) NOT NULL UNIQUE,
        resident_code VARCHAR(40) NOT NULL,
        resident_name VARCHAR(180) NOT NULL,
        template_code VARCHAR(40) NOT NULL,
        document_type VARCHAR(120) NOT NULL,
        category VARCHAR(40) NOT NULL,
        purpose_type VARCHAR(120) NOT NULL DEFAULT '',
        purpose_code VARCHAR(40) NOT NULL DEFAULT '',
        purpose VARCHAR(255) NOT NULL,
        date_created VARCHAR(20) NOT NULL,
        issue_date VARCHAR(20) NOT NULL DEFAULT '',
        signed_by VARCHAR(120) NOT NULL DEFAULT '',
        processed_by VARCHAR(120) NOT NULL DEFAULT '',
        validity VARCHAR(60) NOT NULL DEFAULT '',
        remarks VARCHAR(255) NOT NULL DEFAULT '',
        is_bypass TINYINT(1) NOT NULL DEFAULT 0,
        fee_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        payment_status VARCHAR(30) NOT NULL,
        status VARCHAR(40) NOT NULL,
        extra_fields LONGTEXT NULL
      ) ENGINE=InnoDB
    `);

    await ensureColumn(pool, cfg.database, 'transactions', 'purpose_type', "VARCHAR(120) NOT NULL DEFAULT ''");
    await ensureColumn(pool, cfg.database, 'transactions', 'purpose_code', "VARCHAR(40) NOT NULL DEFAULT ''");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(40) NOT NULL UNIQUE,
        transaction_code VARCHAR(40) NOT NULL,
        res_code VARCHAR(40) NOT NULL,
        resident_name VARCHAR(180) NOT NULL,
        document_type VARCHAR(120) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        or_no VARCHAR(40) NOT NULL,
        cedula_no VARCHAR(60) NOT NULL DEFAULT '',
        payment_method VARCHAR(40) NOT NULL,
        payment_date VARCHAR(20) NOT NULL,
        received_by VARCHAR(120) NOT NULL,
        payment_status VARCHAR(30) NOT NULL,
        remarks VARCHAR(255) NOT NULL DEFAULT ''
      ) ENGINE=InnoDB
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff_officials (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(40) NOT NULL UNIQUE,
        res_code VARCHAR(40) NOT NULL DEFAULT '',
        full_name VARCHAR(120) NOT NULL,
        position VARCHAR(100) NOT NULL,
        tier INT NOT NULL DEFAULT 2,
        committee VARCHAR(160) NOT NULL DEFAULT '',
        reports_to VARCHAR(40) NOT NULL DEFAULT '',
        contact_number VARCHAR(30) NOT NULL DEFAULT '',
        term_start VARCHAR(20) NOT NULL DEFAULT '',
        term_end VARCHAR(20) NOT NULL DEFAULT '',
        photo_url VARCHAR(255) NOT NULL DEFAULT '',
        status VARCHAR(20) NOT NULL DEFAULT 'Active'
      ) ENGINE=InnoDB
    `);

    await ensureColumn(pool, cfg.database, 'staff_officials', 'photo_url', "VARCHAR(255) NOT NULL DEFAULT ''");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_templates (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(40) NOT NULL UNIQUE,
        name VARCHAR(120) NOT NULL,
        category VARCHAR(40) NOT NULL,
        default_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        requires_payment TINYINT(1) NOT NULL DEFAULT 1,
        validity_days INT NOT NULL DEFAULT 180,
        header_title VARCHAR(160) NOT NULL,
        body_template TEXT NOT NULL,
        signatory_name VARCHAR(120) NOT NULL,
        signatory_title VARCHAR(80) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        description VARCHAR(255) NOT NULL DEFAULT ''
      ) ENGINE=InnoDB
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS barangay_settings (
        id INT PRIMARY KEY,
        barangay_name VARCHAR(100) NOT NULL,
        city_municipal VARCHAR(100) NOT NULL,
        province VARCHAR(100) NOT NULL,
        region VARCHAR(100) NOT NULL,
        punong_barangay VARCHAR(120) NOT NULL,
        secretary_name VARCHAR(120) NOT NULL,
        treasurer_name VARCHAR(120) NOT NULL,
        or_prefix VARCHAR(20) NOT NULL,
        txn_prefix VARCHAR(20) NOT NULL,
        res_prefix VARCHAR(20) NOT NULL,
        office_address VARCHAR(255) NOT NULL,
        contact_info VARCHAR(180) NOT NULL
      ) ENGINE=InnoDB
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id VARCHAR(64) PRIMARY KEY,
        timestamp VARCHAR(40) NOT NULL,
        actor VARCHAR(120) NOT NULL,
        role VARCHAR(20) NOT NULL,
        action VARCHAR(120) NOT NULL,
        details VARCHAR(255) NOT NULL
      ) ENGINE=InnoDB
    `);

    const [userCountRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM users');
    const [tplCountRows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM document_templates',
    );
    const [setCountRows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM barangay_settings',
    );

    const userCnt = Number(userCountRows[0]?.cnt || 0);
    const tplCnt = Number(tplCountRows[0]?.cnt || 0);
    const setCnt = Number(setCountRows[0]?.cnt || 0);

    if (userCnt === 0 && fallbackJsonDb && fallbackJsonDb.users.length > 0) {
      await saveMysqlDatabase(fallbackJsonDb);
    } else if (tplCnt === 0 || setCnt === 0) {
      const existing = await loadMysqlDatabase();
      await saveMysqlDatabase({
        ...existing,
        templates: tplCnt === 0 ? DEFAULT_TEMPLATES : existing.templates,
        settings: setCnt === 0 ? DEFAULT_SETTINGS : existing.settings,
      });
    }

    lastMysqlError = null;
  } catch (err) {
    lastMysqlError = err instanceof Error ? err.message : 'Unknown MySQL connection error';
    throw err;
  }
}

function getPool(): Pool {
  if (!pool) {
    throw new Error('MySQL pool has not been initialized');
  }
  return pool;
}

export async function loadMysqlDatabase(): Promise<BdmsDatabase> {
  const p = getPool();
  const [
    [userRows],
    [resRows],
    [txnRows],
    [payRows],
    [staffRows],
    [tplRows],
    [setRows],
    [logRows],
  ] = await Promise.all([
    p.query<RowDataPacket[]>('SELECT * FROM users'),
    p.query<RowDataPacket[]>('SELECT * FROM residents ORDER BY created_at DESC'),
    p.query<RowDataPacket[]>('SELECT * FROM transactions ORDER BY date_created DESC, code DESC'),
    p.query<RowDataPacket[]>('SELECT * FROM payments ORDER BY payment_date DESC, code DESC'),
    p.query<RowDataPacket[]>('SELECT * FROM staff_officials ORDER BY tier ASC, code ASC'),
    p.query<RowDataPacket[]>('SELECT * FROM document_templates'),
    p.query<RowDataPacket[]>('SELECT * FROM barangay_settings WHERE id = 1'),
    p.query<RowDataPacket[]>('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 150'),
  ]);

  const users: StoredUserRecord[] = userRows.map((r) => ({
    id: String(r.id),
    code: String(r.code),
    residentCode: String(r.resident_code || ''),
    fullName: String(r.full_name),
    username: String(r.username),
    email: String(r.email || ''),
    role: r.role as StoredUserRecord['role'],
    status: r.status as StoredUserRecord['status'],
    dateCreated: String(r.date_created),
    passwordHash: String(r.password_hash),
  }));

  const residents: ResidentRecord[] = resRows.map((r) => ({
    id: String(r.id),
    code: String(r.code),
    firstName: String(r.first_name),
    middleName: String(r.middle_name || ''),
    lastName: String(r.last_name),
    suffix: String(r.suffix || ''),
    sex: r.sex as ResidentRecord['sex'],
    bday: String(r.bday),
    age: Number(r.age || 0),
    civilStatus: r.civil_status as ResidentRecord['civilStatus'],
    bloodType: String(r.blood_type || 'O+'),
    completeAddress: String(r.complete_address || ''),
    purok: String(r.purok),
    bldgNo: String(r.bldg_no || ''),
    streetPurokSector: String(r.street_purok_sector || ''),
    barangay: String(r.barangay),
    cityMunicipal: String(r.city_municipal),
    province: String(r.province),
    region: String(r.region),
    contactNumber: String(r.contact_number || ''),
    occupation: String(r.occupation || ''),
    voterStatus: Boolean(r.voter_status),
    pwdStatus: Boolean(r.pwd_status),
    seniorCitizenStatus: Boolean(r.senior_citizen_status),
    photoUrl: String(r.photo_url || ''),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));

  const transactions: TransactionRecord[] = txnRows.map((r) => {
    let extra = {};
    if (r.extra_fields) {
      try {
        extra = typeof r.extra_fields === 'string' ? JSON.parse(r.extra_fields) : r.extra_fields;
      } catch {
        extra = {};
      }
    }
    return {
      id: String(r.id),
      code: String(r.code),
      residentCode: String(r.resident_code),
      residentName: String(r.resident_name),
      templateCode: String(r.template_code),
      documentType: String(r.document_type),
      category: r.category as TransactionRecord['category'],
      purposeType: String(r.purpose_type || ''),
      purposeCode: String(r.purpose_code || ''),
      purpose: String(r.purpose),
      dateCreated: String(r.date_created),
      issueDate: String(r.issue_date || ''),
      signedBy: String(r.signed_by || ''),
      processedBy: String(r.processed_by || ''),
      validity: String(r.validity || ''),
      remarks: String(r.remarks || ''),
      isBypass: Boolean(r.is_bypass),
      feeAmount: Number(r.fee_amount || 0),
      paymentStatus: r.payment_status as TransactionRecord['paymentStatus'],
      status: r.status as TransactionRecord['status'],
      extraFields: extra,
    };
  });

  const payments: PaymentRecord[] = payRows.map((r) => ({
    id: String(r.id),
    code: String(r.code),
    transactionCode: String(r.transaction_code),
    resCode: String(r.res_code),
    residentName: String(r.resident_name),
    documentType: String(r.document_type),
    amount: Number(r.amount || 0),
    orNo: String(r.or_no),
    cedulaNo: String(r.cedula_no || ''),
    paymentMethod: r.payment_method as PaymentRecord['paymentMethod'],
    paymentDate: String(r.payment_date),
    receivedBy: String(r.received_by),
    paymentStatus: r.payment_status as PaymentRecord['paymentStatus'],
    remarks: String(r.remarks || ''),
  }));

  const staffOfficials: StaffOfficialRecord[] = staffRows.map((r) => ({
    id: String(r.id),
    code: String(r.code),
    resCode: String(r.res_code || ''),
    fullName: String(r.full_name),
    position: String(r.position),
    tier: (Number(r.tier) as 1 | 2 | 3) || 2,
    committee: String(r.committee || ''),
    reportsTo: String(r.reports_to || ''),
    contactNumber: String(r.contact_number || ''),
    termStart: String(r.term_start || ''),
    termEnd: String(r.term_end || ''),
    photoUrl: String(r.photo_url || ''),
    status: r.status as StaffOfficialRecord['status'],
  }));

  const templates: DocumentTemplateRecord[] = tplRows.map((r) => ({
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    category: r.category as DocumentTemplateRecord['category'],
    defaultFee: Number(r.default_fee || 0),
    requiresPayment: Boolean(r.requires_payment),
    validityDays: Number(r.validity_days || 180),
    headerTitle: String(r.header_title),
    bodyTemplate: String(r.body_template),
    signatoryName: String(r.signatory_name),
    signatoryTitle: String(r.signatory_title),
    isActive: Boolean(r.is_active),
    description: String(r.description || ''),
  }));

  const sRow = setRows[0];
  const settings: BarangaySettings = sRow
    ? {
        barangayName: String(sRow.barangay_name),
        cityMunicipal: String(sRow.city_municipal),
        province: String(sRow.province),
        region: String(sRow.region),
        punongBarangay: String(sRow.punong_barangay),
        secretaryName: String(sRow.secretary_name),
        treasurerName: String(sRow.treasurer_name),
        orPrefix: String(sRow.or_prefix),
        txnPrefix: String(sRow.txn_prefix),
        resPrefix: String(sRow.res_prefix),
        officeAddress: String(sRow.office_address),
        contactInfo: String(sRow.contact_info),
      }
    : DEFAULT_SETTINGS;

  const activityLogs: ActivityLogRecord[] = logRows.map((r) => ({
    id: String(r.id),
    timestamp: String(r.timestamp),
    actor: String(r.actor),
    role: r.role as ActivityLogRecord['role'],
    action: String(r.action),
    details: String(r.details),
  }));

  return {
    users,
    residents,
    transactions,
    payments,
    staffOfficials,
    templates: templates.length > 0 ? templates : DEFAULT_TEMPLATES,
    settings,
    activityLogs,
  };
}

export async function saveMysqlDatabase(db: BdmsDatabase): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    await conn.query('DELETE FROM users');
    for (const u of db.users) {
      await conn.query(
        `INSERT INTO users (id, code, resident_code, full_name, username, email, role, status, date_created, password_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          u.id,
          u.code,
          u.residentCode || '',
          u.fullName,
          u.username,
          u.email || '',
          u.role,
          u.status,
          u.dateCreated,
          u.passwordHash,
        ],
      );
    }

    await conn.query('DELETE FROM residents');
    for (const r of db.residents) {
      await conn.query(
        `INSERT INTO residents (
          id, code, first_name, middle_name, last_name, suffix, sex, bday, age,
          civil_status, blood_type, complete_address, purok, bldg_no, street_purok_sector,
          barangay, city_municipal, province, region, contact_number, occupation,
          voter_status, pwd_status, senior_citizen_status, photo_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.id,
          r.code,
          r.firstName,
          r.middleName || '',
          r.lastName,
          r.suffix || '',
          r.sex,
          r.bday,
          r.age,
          r.civilStatus,
          r.bloodType || 'O+',
          r.completeAddress || '',
          r.purok,
          r.bldgNo || '',
          r.streetPurokSector || '',
          r.barangay,
          r.cityMunicipal,
          r.province,
          r.region,
          r.contactNumber || '',
          r.occupation || '',
          r.voterStatus ? 1 : 0,
          r.pwdStatus ? 1 : 0,
          r.seniorCitizenStatus ? 1 : 0,
          r.photoUrl || '',
          r.createdAt,
          r.updatedAt,
        ],
      );
    }

    await conn.query('DELETE FROM transactions');
    for (const t of db.transactions) {
      await conn.query(
        `INSERT INTO transactions (
          id, code, resident_code, resident_name, template_code, document_type, category,
          purpose_type, purpose_code, purpose, date_created, issue_date, signed_by, processed_by,
          validity, remarks, is_bypass, fee_amount, payment_status, status, extra_fields
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id,
          t.code,
          t.residentCode,
          t.residentName,
          t.templateCode,
          t.documentType,
          t.category,
          t.purposeType || '',
          t.purposeCode || '',
          t.purpose,
          t.dateCreated,
          t.issueDate || '',
          t.signedBy || '',
          t.processedBy || '',
          t.validity || '',
          t.remarks || '',
          t.isBypass ? 1 : 0,
          t.feeAmount,
          t.paymentStatus,
          t.status,
          JSON.stringify(t.extraFields || {}),
        ],
      );
    }

    await conn.query('DELETE FROM payments');
    for (const pay of db.payments) {
      await conn.query(
        `INSERT INTO payments (
          id, code, transaction_code, res_code, resident_name, document_type,
          amount, or_no, cedula_no, payment_method, payment_date, received_by, payment_status, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pay.id,
          pay.code,
          pay.transactionCode,
          pay.resCode,
          pay.residentName,
          pay.documentType,
          pay.amount,
          pay.orNo,
          pay.cedulaNo || '',
          pay.paymentMethod,
          pay.paymentDate,
          pay.receivedBy,
          pay.paymentStatus,
          pay.remarks || '',
        ],
      );
    }

    await conn.query('DELETE FROM staff_officials');
    for (const s of db.staffOfficials) {
      await conn.query(
        `INSERT INTO staff_officials (
          id, code, res_code, full_name, position, tier, committee, reports_to,
          contact_number, term_start, term_end, photo_url, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.id,
          s.code,
          s.resCode || '',
          s.fullName,
          s.position,
          s.tier,
          s.committee || '',
          s.reportsTo || '',
          s.contactNumber || '',
          s.termStart || '',
          s.termEnd || '',
          s.photoUrl || '',
          s.status,
        ],
      );
    }

    await conn.query('DELETE FROM document_templates');
    for (const tpl of db.templates) {
      await conn.query(
        `INSERT INTO document_templates (
          id, code, name, category, default_fee, requires_payment, validity_days,
          header_title, body_template, signatory_name, signatory_title, is_active, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tpl.id,
          tpl.code,
          tpl.name,
          tpl.category,
          tpl.defaultFee,
          tpl.requiresPayment ? 1 : 0,
          tpl.validityDays,
          tpl.headerTitle,
          tpl.bodyTemplate,
          tpl.signatoryName,
          tpl.signatoryTitle,
          tpl.isActive ? 1 : 0,
          tpl.description || '',
        ],
      );
    }

    await conn.query('DELETE FROM barangay_settings');
    await conn.query(
      `INSERT INTO barangay_settings (
        id, barangay_name, city_municipal, province, region, punong_barangay,
        secretary_name, treasurer_name, or_prefix, txn_prefix, res_prefix, office_address, contact_info
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        db.settings.barangayName,
        db.settings.cityMunicipal,
        db.settings.province,
        db.settings.region,
        db.settings.punongBarangay,
        db.settings.secretaryName,
        db.settings.treasurerName,
        db.settings.orPrefix,
        db.settings.txnPrefix,
        db.settings.resPrefix,
        db.settings.officeAddress,
        db.settings.contactInfo,
      ],
    );

    await conn.query('DELETE FROM activity_logs');
    for (const log of db.activityLogs.slice(0, 150)) {
      await conn.query(
        `INSERT INTO activity_logs (id, timestamp, actor, role, action, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [log.id, log.timestamp, log.actor, log.role, log.action, log.details],
      );
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    await conn.commit();
  } catch (err) {
    try {
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    } catch {
      // Ignore cleanup error
    }
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
