// Role and Designation-based dynamic feature flags / permissions matrix.
// Configurable by Root Admin under System Settings.
// Persisted in SystemSetting ("feature_permissions_matrix") with zero schema migrations.

import { getSetting, updateSettings } from "./settings";
import { type SessionUser } from "./types";

export interface RolePermissions {
  // 1. Ticket Access & Visibility
  viewAllBranchTickets: boolean; // if false, can only view complaints assigned to them (or found via search)
  searchGlobally: boolean;       // can search complaints globally by ticket # or phone
  viewAuditLogs: boolean;        // can view audit trail tabs and system change logs

  // 2. Ticket Workflow & Lifecycle
  updateStatus: boolean;         // can change ticket status (Start Work, On Hold, Resolve)
  reassignTickets: boolean;      // can assign/reassign tickets to other group employees if mistaken
  transferBranch: boolean;       // can transfer tickets across branches
  changePriority: boolean;       // can modify ticket priority / severity
  changeDepartment: boolean;     // can change assignment group/department
  escalateTickets: boolean;      // can escalate tickets for priority attention
  reopenTickets: boolean;        // can reopen resolved tickets

  // 3. Communications & Customer Interaction
  addCustomerComments: boolean;  // can write customer-visible comments
  addWorkNotes: boolean;         // can write internal work notes
  sendCustomerEmail: boolean;    // can reply to customer via email with attachments
  useCannedResponses: boolean;   // can insert and use canned response templates

  // 4. File Management
  manageAttachments: boolean;    // can upload, preview, and delete ticket attachments

  // 5. Queue Operations & Reporting
  bulkOperations: boolean;       // can perform bulk actions on multiple tickets
  exportTickets: boolean;        // can export tickets to CSV/Excel
  viewReports: boolean;          // can access ticket reports and SLA analytics

  // 6. Staff & Directory
  viewEmployees: boolean;        // can view employee directory and open workloads
  manageStaffAvailability: boolean; // can toggle employee round-robin availability / leave status
}

export type PermissionCategory = "access" | "workflow" | "communication" | "files" | "batch_analytics" | "staff";

export interface PermissionMeta {
  label: string;
  description: string;
  category: PermissionCategory;
}

export const PERMISSION_CATEGORIES: Record<PermissionCategory, string> = {
  access: "Access & Visibility",
  workflow: "Workflow & Actions",
  communication: "Communications & Email",
  files: "Files & Attachments",
  batch_analytics: "Bulk Queue & Reports",
  staff: "Staff & Availability",
};

export const PERMISSION_DESCRIPTIONS: Record<keyof RolePermissions, PermissionMeta> = {
  viewAllBranchTickets: {
    label: "View All Branch Tickets",
    description: "Allows browsing all complaints in the branch with filters. If OFF, user can ONLY view complaints assigned to them.",
    category: "access",
  },
  searchGlobally: {
    label: "Global Ticket Search",
    description: "Allows looking up any complaint across branches/system by ticket number, member phone, or keyword.",
    category: "access",
  },
  viewAuditLogs: {
    label: "View Audit Logs & Timeline",
    description: "Allows viewing ticket change history, state transitions, and system configuration audit trails.",
    category: "access",
  },
  updateStatus: {
    label: "Update Status",
    description: "Allows changing ticket status (Start Work, Place on Hold, Resolve).",
    category: "workflow",
  },
  reassignTickets: {
    label: "Reassign Tickets",
    description: "Allows assigning or reassigning tickets to other employees or groups (e.g. if assigned mistakenly).",
    category: "workflow",
  },
  transferBranch: {
    label: "Transfer Branch",
    description: "Allows moving tickets to a different branch location.",
    category: "workflow",
  },
  changePriority: {
    label: "Change Priority",
    description: "Allows modifying ticket severity (Critical, High, Medium, Low).",
    category: "workflow",
  },
  changeDepartment: {
    label: "Change Assignment Group",
    description: "Allows moving tickets between departments (Maintenance, Accounts, Trainers, etc.).",
    category: "workflow",
  },
  escalateTickets: {
    label: "Escalate Tickets",
    description: "Allows manually escalating tickets for urgent manager/central SLA attention.",
    category: "workflow",
  },
  reopenTickets: {
    label: "Reopen Resolved Tickets",
    description: "Allows reopening tickets from Resolved status within the configured reopen window.",
    category: "workflow",
  },
  addCustomerComments: {
    label: "Reply to Customers",
    description: "Allows sending customer-visible updates and responses.",
    category: "communication",
  },
  addWorkNotes: {
    label: "Write Work Notes",
    description: "Allows adding internal, private-to-staff work notes in the activity stream.",
    category: "communication",
  },
  sendCustomerEmail: {
    label: "Direct Email Replies",
    description: "Allows sending direct email replies to customers with optional attachments via the Mail dialog.",
    category: "communication",
  },
  useCannedResponses: {
    label: "Canned Responses",
    description: "Allows inserting and using predefined response templates in ticket notes and replies.",
    category: "communication",
  },
  manageAttachments: {
    label: "Manage Attachments",
    description: "Allows uploading new attachments, previewing files, and removing attachments from tickets.",
    category: "files",
  },
  bulkOperations: {
    label: "Bulk Queue Actions",
    description: "Allows performing batch updates (status, assignment group, escalation) across multiple selected tickets.",
    category: "batch_analytics",
  },
  exportTickets: {
    label: "Export to CSV/Excel",
    description: "Allows downloading ticket lists and reports as spreadsheets.",
    category: "batch_analytics",
  },
  viewReports: {
    label: "View Reports & Metrics",
    description: "Allows viewing branch performance analytics, SLAs, and resolution metrics.",
    category: "batch_analytics",
  },
  viewEmployees: {
    label: "Employee Directory",
    description: "Allows browsing the staff directory and viewing staff assignment workloads.",
    category: "staff",
  },
  manageStaffAvailability: {
    label: "Manage Staff Availability",
    description: "Allows toggling staff availability for round-robin ticket assignments and leave handover.",
    category: "staff",
  },
};

export const DEFAULT_ROLE_PERMISSIONS: Record<string, RolePermissions> = {
  ROOT_ADMIN: {
    viewAllBranchTickets: true,
    searchGlobally: true,
    viewAuditLogs: true,
    updateStatus: true,
    reassignTickets: true,
    transferBranch: true,
    changePriority: true,
    changeDepartment: true,
    escalateTickets: true,
    reopenTickets: true,
    addCustomerComments: true,
    addWorkNotes: true,
    sendCustomerEmail: true,
    useCannedResponses: true,
    manageAttachments: true,
    bulkOperations: true,
    exportTickets: true,
    viewReports: true,
    viewEmployees: true,
    manageStaffAvailability: true,
  },
  CENTRAL_ADMIN: {
    viewAllBranchTickets: true,
    searchGlobally: true,
    viewAuditLogs: true,
    updateStatus: true,
    reassignTickets: true,
    transferBranch: true,
    changePriority: true,
    changeDepartment: true,
    escalateTickets: true,
    reopenTickets: true,
    addCustomerComments: true,
    addWorkNotes: true,
    sendCustomerEmail: true,
    useCannedResponses: true,
    manageAttachments: true,
    bulkOperations: true,
    exportTickets: true,
    viewReports: true,
    viewEmployees: true,
    manageStaffAvailability: true,
  },
  CENTRAL_AGENT: {
    viewAllBranchTickets: true,
    searchGlobally: true,
    viewAuditLogs: true,
    updateStatus: true,
    reassignTickets: true,
    transferBranch: true,
    changePriority: true,
    changeDepartment: true,
    escalateTickets: true,
    reopenTickets: true,
    addCustomerComments: true,
    addWorkNotes: true,
    sendCustomerEmail: true,
    useCannedResponses: true,
    manageAttachments: true,
    bulkOperations: true,
    exportTickets: true,
    viewReports: true,
    viewEmployees: true,
    manageStaffAvailability: true,
  },
  BRANCH_MANAGER: {
    viewAllBranchTickets: true,
    searchGlobally: true,
    viewAuditLogs: true,
    updateStatus: true,
    reassignTickets: true,
    transferBranch: true,
    changePriority: true,
    changeDepartment: true,
    escalateTickets: true,
    reopenTickets: true,
    addCustomerComments: true,
    addWorkNotes: true,
    sendCustomerEmail: true,
    useCannedResponses: true,
    manageAttachments: true,
    bulkOperations: true,
    exportTickets: true,
    viewReports: true,
    viewEmployees: true,
    manageStaffAvailability: true,
  },
  SUPPORT_AGENT: {
    viewAllBranchTickets: true,
    searchGlobally: true,
    viewAuditLogs: false,
    updateStatus: true,
    reassignTickets: true,
    transferBranch: false,
    changePriority: true,
    changeDepartment: true,
    escalateTickets: false,
    reopenTickets: false,
    addCustomerComments: true,
    addWorkNotes: true,
    sendCustomerEmail: true,
    useCannedResponses: true,
    manageAttachments: true,
    bulkOperations: false,
    exportTickets: false,
    viewReports: false,
    viewEmployees: true,
    manageStaffAvailability: false,
  },
  // Specific designation presets
  "Senior Support Agent": {
    viewAllBranchTickets: true, // Senior can see all tickets in the branch with filters
    searchGlobally: true,
    viewAuditLogs: true,
    reassignTickets: true,
    transferBranch: true,
    updateStatus: true,
    changePriority: true,
    changeDepartment: true,
    escalateTickets: true,
    reopenTickets: true,
    addCustomerComments: true,
    addWorkNotes: true,
    sendCustomerEmail: true,
    useCannedResponses: true,
    manageAttachments: true,
    bulkOperations: true,
    exportTickets: true,
    viewReports: true,
    viewEmployees: true,
    manageStaffAvailability: true,
  },
  "Junior Support Agent": {
    viewAllBranchTickets: false, // Junior can ONLY see complaints assigned to them
    searchGlobally: true,        // but CAN search a complaint globally
    viewAuditLogs: false,
    reassignTickets: true,       // and CAN assign tickets to other group emps if mistaken
    transferBranch: false,
    updateStatus: true,
    changePriority: false,
    changeDepartment: true,
    escalateTickets: false,
    reopenTickets: false,
    addCustomerComments: true,
    addWorkNotes: true,
    sendCustomerEmail: true,
    useCannedResponses: true,
    manageAttachments: true,
    bulkOperations: false,
    exportTickets: false,
    viewReports: false,
    viewEmployees: false,
    manageStaffAvailability: false,
  },
};

const SETTING_KEY = "feature_permissions_matrix";

export async function getPermissionsMatrix(): Promise<Record<string, RolePermissions>> {
  const raw = await getSetting(SETTING_KEY);
  if (!raw) return { ...DEFAULT_ROLE_PERMISSIONS };
  try {
    const parsed = JSON.parse(raw);
    const result: Record<string, RolePermissions> = { ...DEFAULT_ROLE_PERMISSIONS };
    for (const [key, perms] of Object.entries(parsed)) {
      const fallback =
        result[key] ||
        (key.toLowerCase().includes("senior")
          ? DEFAULT_ROLE_PERMISSIONS["Senior Support Agent"]
          : key.toLowerCase().includes("junior")
          ? DEFAULT_ROLE_PERMISSIONS["Junior Support Agent"]
          : DEFAULT_ROLE_PERMISSIONS.SUPPORT_AGENT);
      result[key] = {
        ...fallback,
        ...(perms as RolePermissions),
      };
    }
    return result;
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
