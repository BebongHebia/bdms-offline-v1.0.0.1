import type {StaffOfficialRecord} from '../types/bdms';

export type StatutoryRoleKey =
  | 'punong_barangay'
  | 'kagawad'
  | 'sk_chairperson'
  | 'secretary'
  | 'treasurer';

export interface StatutoryRoleRule {
  key: StatutoryRoleKey;
  label: string;
  limit: number;
  defaultTier: 1 | 2 | 3;
}

export const STATUTORY_ROLE_RULES: StatutoryRoleRule[] = [
  {key: 'punong_barangay', label: 'Punong Barangay', limit: 1, defaultTier: 1},
  {key: 'kagawad', label: 'Barangay Kagawad', limit: 7, defaultTier: 2},
  {key: 'sk_chairperson', label: 'SK Chairperson', limit: 1, defaultTier: 2},
  {key: 'secretary', label: 'Barangay Secretary', limit: 1, defaultTier: 2},
  {key: 'treasurer', label: 'Barangay Treasurer', limit: 1, defaultTier: 2},
];

export const STANDARD_OFFICIAL_POSITIONS = [
  {value: 'Punong Barangay', defaultTier: 1 as const},
  {value: 'Barangay Kagawad', defaultTier: 2 as const},
  {value: 'SK Chairperson', defaultTier: 2 as const},
  {value: 'Barangay Secretary', defaultTier: 2 as const},
  {value: 'Barangay Treasurer', defaultTier: 2 as const},
  {value: 'Barangay Clerk / Records Staff', defaultTier: 3 as const},
  {value: 'Chief Barangay Tanod', defaultTier: 3 as const},
  {value: 'Barangay Tanod', defaultTier: 3 as const},
  {value: 'Barangay Health Worker', defaultTier: 3 as const},
];

export function matchStatutoryRole(position: string): StatutoryRoleRule | null {
  const norm = position.trim().toLowerCase();
  if (!norm) return null;
  if (norm.includes('punong barangay') || norm.includes('barangay captain')) {
    return STATUTORY_ROLE_RULES[0];
  }
  if (norm.includes('kagawad')) {
    return STATUTORY_ROLE_RULES[1];
  }
  if (norm.includes('sk chair') || norm.includes('sangguniang kabataan chair')) {
    return STATUTORY_ROLE_RULES[2];
  }
  if (norm === 'secretary' || norm.includes('barangay secretary')) {
    return STATUTORY_ROLE_RULES[3];
  }
  if (norm === 'treasurer' || norm.includes('barangay treasurer')) {
    return STATUTORY_ROLE_RULES[4];
  }
  return null;
}

export function validateActiveOfficialSeatLimit(
  officials: StaffOfficialRecord[],
  candidate: {position: string; status: 'Active' | 'Inactive'},
  excludeId?: string,
): string | null {
  if (candidate.status !== 'Active') return null;
  const rule = matchStatutoryRole(candidate.position);
  if (!rule) return null;

  const activeCount = officials.filter(
    (o) =>
      o.id !== excludeId &&
      o.status === 'Active' &&
      matchStatutoryRole(o.position)?.key === rule.key,
  ).length;

  if (activeCount >= rule.limit) {
    return `Active seat limit reached for ${rule.label} (${activeCount}/${rule.limit} active). Set an existing ${rule.label} to Inactive or remove a record before adding another active one.`;
  }
  return null;
}
