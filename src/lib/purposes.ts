export interface PurposeOption {
  code: string;
  label: string;
  isCustom?: boolean;
}

export interface PurposeCategoryGroup {
  type: string;
  codePrefix: string;
  options: PurposeOption[];
}

export const PURPOSE_CATEGORIES: PurposeCategoryGroup[] = [
  {
    type: 'Food & Beverage (F&B)',
    codePrefix: 'PRP-FB',
    options: [
      {code: 'PRP-FB-01', label: 'Sari-sari stores and micro-convenience shops'},
      {code: 'PRP-FB-02', label: 'Carinderias, eateries, and turo-turo stalls'},
      {code: 'PRP-FB-03', label: 'Bakeries and panaderias'},
      {code: 'PRP-FB-04', label: 'Food carts, kiosks, and food trucks (street food, milk tea, juice bars)'},
      {code: 'PRP-FB-05', label: 'Cafes and specialty coffee shops'},
      {code: 'PRP-FB-06', label: 'Casual & fine dining restaurants'},
      {code: 'PRP-FB-07', label: 'Catering services'},
      {code: 'PRP-FB-08', label: 'Home-based food production (native delicacies, baked goods, preserved meats)'},
      {code: 'PRP-FB-09', label: 'Meat, fish, and produce markets (palengke stalls)'},
    ],
  },
  {
    type: 'Real Estate & Property',
    codePrefix: 'PRP-RE',
    options: [
      {code: 'PRP-RE-01', label: 'Residential leasing (apartments, boarding houses, dormitories, condo rentals)'},
      {code: 'PRP-RE-02', label: 'Commercial leasing (office spaces, retail stalls, warehouses)'},
      {code: 'PRP-RE-03', label: 'Real estate brokerage and sales agencies'},
      {code: 'PRP-RE-04', label: 'Property management services'},
      {code: 'PRP-RE-05', label: 'Land development and subdivision construction'},
      {code: 'PRP-RE-06', label: 'Co-working spaces and event venue rentals'},
    ],
  },
  {
    type: 'Retail & Wholesale Trade',
    codePrefix: 'PRP-RW',
    options: [
      {code: 'PRP-RW-01', label: 'Hardware and construction supply stores'},
      {code: 'PRP-RW-02', label: 'Agri-vet supplies (feeds, fertilizers, farm equipment)'},
      {code: 'PRP-RW-03', label: 'Pharmacy and medical supply stores'},
      {code: 'PRP-RW-04', label: 'Apparel, footwear, and accessory boutiques'},
      {code: 'PRP-RW-05', label: 'Auto and motorcycle parts shops'},
      {code: 'PRP-RW-06', label: 'Electronic and appliance retail'},
      {code: 'PRP-RW-07', label: 'E-commerce and online buy-and-sell shops'},
      {code: 'PRP-RW-08', label: 'Wholesale distribution hubs (beverages, dry goods, consumer goods)'},
      {code: 'PRP-RW-09', label: 'LPG and fuel distribution stations'},
    ],
  },
  {
    type: 'Personal & Wellness Services',
    codePrefix: 'PRP-PW',
    options: [
      {code: 'PRP-PW-01', label: 'Barbershops and beauty salons'},
      {code: 'PRP-PW-02', label: 'Spas, massage centers, and nail care salons'},
      {code: 'PRP-PW-03', label: 'Fitness gyms and sports facilities'},
      {code: 'PRP-PW-04', label: 'Tailoring and dressmaking shops'},
      {code: 'PRP-PW-05', label: 'Tattoo and body art studios'},
    ],
  },
  {
    type: 'Essential Household & Repair Services',
    codePrefix: 'PRP-EH',
    options: [
      {code: 'PRP-EH-01', label: 'Laundromats (self-service and full-service)'},
      {code: 'PRP-EH-02', label: 'Water refilling stations'},
      {code: 'PRP-EH-03', label: 'Automotive repair, vulcanizing, and car washes'},
      {code: 'PRP-EH-04', label: 'Electronics and appliance repair shops'},
      {code: 'PRP-EH-05', label: 'Junk shops and recycling centers'},
      {code: 'PRP-EH-06', label: 'Pest control and disinfection services'},
    ],
  },
  {
    type: 'Professional & Technical Services',
    codePrefix: 'PRP-PT',
    options: [
      {code: 'PRP-PT-01', label: 'Printing, signage, and advertising hubs'},
      {code: 'PRP-PT-02', label: 'Accounting, auditing, and bookkeeping services'},
      {code: 'PRP-PT-03', label: 'Legal practices and notary offices'},
      {code: 'PRP-PT-04', label: 'Architecture, engineering, and construction firms'},
      {code: 'PRP-PT-05', label: 'IT, web development, and digital marketing agencies'},
      {code: 'PRP-PT-06', label: 'Photography and videography studios'},
    ],
  },
  {
    type: 'Financial, Administrative & Logistics',
    codePrefix: 'PRP-FA',
    options: [
      {code: 'PRP-FA-01', label: 'Payment hubs and remittance centers'},
      {code: 'PRP-FA-02', label: 'Pawnshops and micro-lending offices'},
      {code: 'PRP-FA-03', label: 'Courier, delivery, and logistics agents'},
      {code: 'PRP-FA-04', label: 'Travel, tour, and ticketing agencies'},
      {code: 'PRP-FA-05', label: 'Security agencies and manpower staffing'},
    ],
  },
  {
    type: 'Agriculture, Livestock & Natural Resources',
    codePrefix: 'PRP-AG',
    options: [
      {code: 'PRP-AG-01', label: 'Crop farming (rice, corn, high-value vegetables, fruits)'},
      {code: 'PRP-AG-02', label: 'Livestock and poultry raising (hog raising, egg farms, broiler production)'},
      {code: 'PRP-AG-03', label: 'Aquaculture (fishponds, fish cages, hatcheries)'},
      {code: 'PRP-AG-04', label: 'Nursery and ornamental plant trade'},
    ],
  },
  {
    type: 'General & Personal Purposes',
    codePrefix: 'PRP-GP',
    options: [
      {code: 'PRP-GP-01', label: 'Local Employment Application'},
      {code: 'PRP-GP-02', label: 'First Time Jobseeker Requirement (RA 11261)'},
      {code: 'PRP-GP-03', label: 'Medical / Hospital / DSWD Assistance'},
      {code: 'PRP-GP-04', label: 'Scholarship / Educational Requirement'},
      {code: 'PRP-GP-05', label: 'NBI / Police / Postal / Government ID Requirement'},
      {code: 'PRP-GP-06', label: 'Bank Account / Loan / Financial Requirement'},
      {code: 'PRP-GP-07', label: 'Barangay Resident Identification Issuance'},
      {code: 'PRP-GP-99', label: 'Other (Specify Custom Purpose)', isCustom: true},
    ],
  },
];

export function findPurposeEntryByCode(
  code?: string,
): {type: string; option: PurposeOption} | undefined {
  if (!code) return undefined;
  for (const cat of PURPOSE_CATEGORIES) {
    const found = cat.options.find((opt) => opt.code === code);
    if (found) return {type: cat.type, option: found};
  }
  return undefined;
}
