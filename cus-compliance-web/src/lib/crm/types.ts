export type Assignee = "Yatin" | "Jayraj";

export type ContactMethod =
  | "Call"
  | "WhatsApp"
  | "Email"
  | "In-Person"
  | "No Contact";

export type CrmView =
  | "dashboard"
  | "daily"
  | "master"
  | "compliance"
  | "target"
  | "incentive"
  | "history"
  | "reports"
  | "workflows"
  | "backup"
  | "admin";

export interface Installment {
  amount: string;
  date: string;
  paid: boolean;
  receipt: string;
  notes: string;
  paymentDate: string;
}

export interface MessageLogEntry {
  id: number;
  template: string;
  timestamp: string;
  message: string;
}

export interface Candidate {
  id: number;
  name: string;
  phoneNumber: string;
  candidateNumber: string;
  assignedTo: Assignee;
  floor: string;
  annualPackage: number;
  serviceFeePercent: number;
  totalServiceFee: number;
  terms: string;
  po: string;
  poMonth: string;
  startDate: string;
  status: string;
  remarks: string;
  installmentCount: number;
  installments: Installment[];
  lastContactDate: string;
  nextFollowUpDate: string;
  contactMethod: ContactMethod;
  contactNotes: string;
  messageLog: MessageLogEntry[];
  /** Payment Target extras */
  expectedDate?: string;
  expectedAmount?: number | string;
  monthRemarks?: string;
  targetPaidManual?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentHistory {
  id: number;
  candidateId: number;
  candidateName: string;
  assignedTo: string;
  floor: string;
  date: string;
  amount: number;
  type: string;
  notes: string;
  template?: string;
  message?: string;
  timestamp: string;
}

export interface WhatsappTemplates {
  "Payment Reminder": string;
  "Payment Overdue": string;
  "Payment Confirmation": string;
  "Settlement Offer": string;
  "Follow-up": string;
  Custom: string;
  [key: string]: string;
}

export interface WorkflowRules {
  autoOverdue: boolean;
  autoNoResponse: boolean;
  autoFullyPaid: boolean;
  followUpReminder: boolean;
}

export interface WorkflowLogEntry {
  id: number;
  timestamp: string;
  rule: string;
  candidateId: number | string;
  candidateName: string;
  action: string;
}

export interface CrmSettings {
  targetMonth: string;
  incentiveStart: string;
  incentiveFrom: string;
  incentiveTo: string;
  whatsappTemplates: WhatsappTemplates;
  workflowRules: WorkflowRules;
  workflowLog: WorkflowLogEntry[];
  workflowState: Record<string, string>;
  workflowLastRun: string;
  lastDigestRead: string;
  masterColumnConfig?: string[];
  masterDensity?: string;
  masterFreezeMode?: string;
  targetPaidMonthFilter?: string;
  targetSortByDate?: boolean;
}

export interface ActiveFilters {
  assignedTo?: string;
  floor?: string;
  status?: string;
  po?: string;
  poMonth?: string;
}

export interface CrmBackup {
  version: string;
  exportedAt: string;
  candidates: Candidate[];
  history: PaymentHistory[];
  settings: CrmSettings;
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

export const DEFAULT_STATUSES = [
  "Active",
  "Fully Paid",
  "Inactive",
  "Cancelled",
  "Lost Job",
  "Job Lost",
  "Refunded",
  "Closed",
  "Run Away",
  "No Response",
  "Payment Hold",
  "Custom",
] as const;

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const CONTACT_METHODS: ContactMethod[] = [
  "Call",
  "WhatsApp",
  "Email",
  "In-Person",
  "No Contact",
];

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsappTemplates = {
  "Payment Reminder":
    "Hi [Name], friendly reminder: payment of [Amount] due on [Date]. Please arrange at earliest. - CareerUS Solutions",
  "Payment Overdue":
    "Hi [Name], payment of [Amount] was due [Date] and is now overdue. Late charges $25/day apply. Settle immediately. - CareerUS Solutions",
  "Payment Confirmation":
    "Hi [Name], thank you for payment of [Amount] received [Date]. Remaining: [Remaining]. - CareerUS Solutions",
  "Settlement Offer":
    "Hi [Name], special settlement: pay [DiscountedAmount] by [Date] to clear balance [Original]. Reply to confirm. - CareerUS Solutions",
  "Follow-up":
    "Hi [Name], following up on pending payment. When can we expect it? - CareerUS Solutions",
  Custom: "",
};

export const DEFAULT_WORKFLOW_RULES: WorkflowRules = {
  autoOverdue: true,
  autoNoResponse: true,
  autoFullyPaid: true,
  followUpReminder: true,
};
