export type UserRole = 'Admin' | 'Staff' | 'Treasurer';
export type AccountStatus = 'Active' | 'Inactive';

export interface UserRecord {
  id: string;
  code: string;
  residentCode: string;
  fullName: string;
  username: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  dateCreated: string;
}

export interface StoredUserRecord extends UserRecord {
  passwordHash: string;
}

export interface ResidentRecord {
  id: string;
  code: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  sex: 'Male' | 'Female';
  bday: string;
  age: number;
  civilStatus: 'Single' | 'Married' | 'Widowed' | 'Separated';
  bloodType: string;
  completeAddress: string;
  purok: string;
  bldgNo: string;
  streetPurokSector: string;
  barangay: string;
  cityMunicipal: string;
  province: string;
  region: string;
  contactNumber: string;
  occupation: string;
  voterStatus: boolean;
  pwdStatus: boolean;
  seniorCitizenStatus: boolean;
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionStatus =
  | 'Pending'
  | 'Processing'
  | 'For Payment'
  | 'Ready for Release'
  | 'Completed'
  | 'Cancelled';

export type PaymentStatus = 'Unpaid' | 'Paid' | 'Refunded' | 'Waived';
export type PaymentMethod = 'Cash' | 'GCash' | 'Bank Transfer' | 'Check';

export type DocumentCategory =
  | 'Clearance'
  | 'Indigency'
  | 'Residency'
  | 'Certification'
  | 'Identification'
  | 'Business'
  | 'Custom';

export interface DocumentExtraFields {
  authorized?: string;
  patientName?: string;
  isWithPatient?: boolean;
  isFTJS?: boolean;
  monthlyEarning?: number;
  totalAmountExpenses?: number;
  businessName?: string;
  businessAddress?: string;
  closureDate?: string;
  residencyYears?: string;
}

export interface TransactionRecord {
  id: string;
  code: string;
  residentCode: string;
  residentName: string;
  templateCode: string;
  documentType: string;
  category: DocumentCategory;
  purpose: string;
  dateCreated: string;
  issueDate: string;
  signedBy: string;
  processedBy: string;
  validity: string;
  remarks: string;
  isBypass: boolean;
  feeAmount: number;
  paymentStatus: PaymentStatus;
  status: TransactionStatus;
  extraFields: DocumentExtraFields;
}

export interface PaymentRecord {
  id: string;
  code: string;
  transactionCode: string;
  resCode: string;
  residentName: string;
  documentType: string;
  amount: number;
  orNo: string;
  cedulaNo: string;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  receivedBy: string;
  paymentStatus: 'Unpaid' | 'Paid' | 'Refunded';
  remarks: string;
}

export interface StaffOfficialRecord {
  id: string;
  code: string;
  resCode: string;
  fullName: string;
  position: string;
  tier: 1 | 2 | 3;
  committee: string;
  reportsTo: string;
  contactNumber: string;
  termStart: string;
  termEnd: string;
  photoUrl?: string;
  status: 'Active' | 'Inactive';
}

export interface DocumentTemplateRecord {
  id: string;
  code: string;
  name: string;
  category: DocumentCategory;
  defaultFee: number;
  requiresPayment: boolean;
  validityDays: number;
  headerTitle: string;
  bodyTemplate: string;
  signatoryName: string;
  signatoryTitle: string;
  isActive: boolean;
  description: string;
}

export interface BarangaySettings {
  barangayName: string;
  cityMunicipal: string;
  province: string;
  region: string;
  punongBarangay: string;
  secretaryName: string;
  treasurerName: string;
  orPrefix: string;
  txnPrefix: string;
  resPrefix: string;
  officeAddress: string;
  contactInfo: string;
}

export interface ActivityLogRecord {
  id: string;
  timestamp: string;
  actor: string;
  role: UserRole;
  action: string;
  details: string;
}

export interface BdmsDatabase {
  users: StoredUserRecord[];
  residents: ResidentRecord[];
  transactions: TransactionRecord[];
  payments: PaymentRecord[];
  staffOfficials: StaffOfficialRecord[];
  templates: DocumentTemplateRecord[];
  settings: BarangaySettings;
  activityLogs: ActivityLogRecord[];
}

export interface AuthSession {
  token: string;
  user: UserRecord;
}

export interface AuthBootstrapStatus {
  needsInitialSetup: boolean;
  hasEnvPasscode: boolean;
  barangayName: string;
  cityMunicipal: string;
  province: string;
}
