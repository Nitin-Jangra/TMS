// Role and Designation-based dynamic feature flags / permissions matrix.
// Configurable by Root Admin under System Settings.
// Persisted in SystemSetting ("feature_permissions_matrix") with zero schema migrations.

import { getSetting, updateSettings } from "./settings";
import { type SessionUser } from "./types";

export interface RolePermissions {
  viewAllBranchTickets: boolean; // if false, can only view complaints assigned to them (or found via search)
  searchGlobally: boolean;       // can search complaints globally by ticket # or phone
  reassignTickets: boolean;      // can assign/reassign tickets to other group employees if mistaken
  transferBranch: boolean;       // can transfer tickets across branches
  updateStatus: boolean;         // can change ticket status (Start Work, On Hold, Resolve)
  changePriority: boolean;       // can change priority
  changeDepartment: boolean;     // can change assignment group/department
  addWorkNotes: boolean;         // can write internal work notes
  addCustomerComments: boolean;  // can write customer-visible comments
  viewReports: boolean;          // can access ticket reports
  viewEmployees: boolean;        // can view employee directory
  exportTickets: boolean;        // can export tickets to CSV
}

export const PERMISSION_DESCRIPTIONS: Record<keyof RolePermissions, { label: string; description: string }> = {
  viewAllBranchTickets: {
    label: "View All Branch Tickets",
    description: "Allows browsing all complaints in the branch with filters. If OFF, user can ONLY view complaints assigned to them.",
  },
  searchGlobally: {
    label: "Global Ticket Search",
    description: "Allows looking up any complaint across branches/system by ticket number, member phone, or keyword.",
  },
  reassignTickets: {
    label: "Reassign Tickets",
    description: "Allows assigning or reassigning tickets to other employees or groups (e.g. if assigned mistakenly).",
  },
  transferBranch: {
    label: "Transfer Branch",
    description: "Allows moving tickets to a different branch location.",
  },
  updateStatus: {
    label: "Update Status",
    description: "Allows changing ticket status (Start Work, Place on Hold, Resolve).",
  },
  changePriority: {
    label: "Change Priority",
    description: "Allows modifying ticket severity (Critical, High, Medium, Low).",
  },
  changeDepartment: {
    label: "Change Assignment Group",
    description: "Allows moving tickets between departments (Maintenance, Accounts, Trainers, etc.).",
  },
  addWorkNotes: {
    label: "Write Work Notes",
    description: "Allows adding internal, private-to-staff work notes in the activity stream.",
  },
  addCustomerComments: {
    label: "Reply to Customers",
    description: "Allows sending customer-visible updates and responses.",
  },
  viewReports: {
    label: "View Reports",
    description: "Allows viewing branch performance analytics, SLAs, and resolution metrics.",
  },
  viewEmployees: {
    label: "Employee Directory",
    description: "Allows browsing staff list and checking round-robin availability.",
  },
  exportTickets: {
    label: "Export to CSV/Excel",
    description: "Allows downloading ticket lists as spreadsheets.",
  },
};

export const DEFAULT_ROLE_PERMISSIONS: Record<string, RolePermissions> = {
  ROOT_ADMIN: {
    viewAllBranchTickets: true,
    searchGlobally: true,
    reassignTickets: true,
    transferBranch: true,
    updateStatus: true,
    changePriority: true,
    changeDepartment: true,
    addWorkNotes: true,
    addCustomerComments: true,
    viewReports: true,
    viewEmployees: true,
    exportTickets: true,
  },
  CENTRAL_ADMIN: {
    viewAllBranchTickets: true,
    searchGlobally: true,
    reassignTickets: true,
    transferBranch: true,
    updateStatus: true,
    changePriority: true,
    changeDepartment: true,
    addWorkNotes: true,
    addCustomerComments: true,
    viewReports: true,
    viewEmployees: true,
    exportTickets: true,
  },
  CENTRAL_AGENT: {
    viewAllBranchTickets: true,
    searchGlobally: true,
    reassignTickets: true,
    transferBranch: true,
    updateStatus: true,
    changePriority: true,
    changeDepartment: true,
    addWorkNotes: true,
    addCustomerComments: true,
    viewReports: true,
    viewEmployees: true,
    exportTickets: true,
  },
  BRANCH_MANAGER: {
    viewAllBranchTickets: true,
    searchGlobally: true,
    reassignTickets: true,
    transferBranch: true,
    updateStatus: true,
    changePriority: true,
    changeDepartment: true,
    addWorkNotes: true,
    addCustomerComments: true,
    viewReports: true,
    viewEmployees: true,
    exportTickets: true,
  },
  SUPPORT_AGENT: {
    viewAllBranchTickets: true,
    searchGlobally: true,
    reassignTickets: true,
    transferBranch: false,
    updateStatus: true,
    changePriority: true,
    changeDepartment: true,
    addWorkNotes: true,
    addCustomerComments: true,
    viewReports: false,
    viewEmployees: true,
    exportTickets: false,
  },
  // Specific designation presets
  "Senior Support Agent": {
    viewAllBranchTickets: true, // Senior can see all tickets in the branch with filters
    searchGlobally: true,
    reassignTickets: true,
    transferBranch: true,
    updateStatus: true,
    changePriority: true,
    changeDepartment: true,
    addWorkNotes: true,
    addCustomerComments: true,
    viewReports: true,
    viewEmployees: true,
    exportTickets: true,
  },
  "Junior Support Agent": {
    viewAllBranchTickets: false, // Junior can ONLY see complaints assigned to them
    searchGlobally: true,        // but CAN search a complaint globally
    reassignTickets: true,       // and CAN assign tickets to other group emps if mistaken
    transferBranch: false,
    updateStatus: true,
    changePriority: false,
    changeDepartment: true,
    addWorkNotes: true,
    addCustomerComments: true,
    viewReports: false,
    viewEmployees: false,
    exportTickets: false,
  },
};

const SETTING_KEY = "feature_permissions_matrix";

export async function getPermissionsMatrix(): Promise<Record<string, RolePermissions>> {
  const raw = await getSetting(SETTING_KEY);
  if (!raw) return { ...DEFAULT_ROLE_PERMISSIONS };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_ROLE_PERMISSIONS, ...parsed };
  } catch {
    return { ...DEFAULT_ROLE_PERMISSIONS };
  }
}

export async function savePermissionsMatrix(
  matrix: Record<string, RolePermissions>,
  actor: { id?: string; name: string } | null,
  reason = "Updated permissions matrix"
): Promise<void> {
  await updateSettings(
    [
      {
        key: SETTING_KEY,
        value: JSON.stringify(matrix),
        reason,
      },
    ],
    actor
  );
}

/**
 * Resolves effective permissions for a logged-in user.
 * 1. ROOT_ADMIN always has 100% permissions.
 * 2. Matches user.designation (exact or fuzzy e.g. "Junior", "Senior").
 * 3. Falls back to user.role.
 * 4. Falls back to SUPPORT_AGENT default.
 */
export async function getUserPermissions(user: SessionUser): Promise<RolePermissions> {
  if (user.role === "ROOT_ADMIN") {
    return DEFAULT_ROLE_PERMISSIONS.ROOT_ADMIN;
  }

  const matrix = await getPermissionsMatrix();
  const desig = (user.designation || "").trim().toLowerCase();

  // 1. Direct match on designation
  for (const [key, perms] of Object.entries(matrix)) {
    if (key.toLowerCase() === desig) {
      return perms;
    }
  }

  // 2. Fuzzy match on designation (e.g. "Junior Support Executive" matches "Junior Support Agent")
  if (desig) {
    if (desig.includes("junior")) {
      const juniorRule = Object.keys(matrix).find((k) => k.toLowerCase().includes("junior"));
      if (juniorRule) return matrix[juniorRule];
    }
    if (desig.includes("senior")) {
      const seniorRule = Object.keys(matrix).find((k) => k.toLowerCase().includes("senior"));
      if (seniorRule) return matrix[seniorRule];
    }
  }

  // 3. Match on role
  if (matrix[user.role]) {
    return matrix[user.role];
  }

  return DEFAULT_ROLE_PERMISSIONS.SUPPORT_AGENT;
}
