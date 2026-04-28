export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export interface FollowUpData {
  id?: string;
  date: string;
  customerName: string;
  customerPhone: string;
  pic: string;
  caption: string;
  screenshotUrl: string;
  monthYear: string;
  timestamp: any; // Server Timestamp
}

export enum ProgressOutcome {
  ADA_FEEDBACK = 'Ada feedback',
  TIDAK_ADA_RESPON = 'Tidak ada respon',
  RESPON_TANPA_FEEDBACK = 'Konsumen respon tapi tidak ada feedback'
}

export enum ProgressChannel {
  WHATSAPP = 'WhatsApp',
  GOOGLE = 'Google',
  INSTAGRAM = 'Instagram'
}

export interface ProgressData {
  id?: string;
  followupId: string;
  customerName: string; // From sibling
  outcome: ProgressOutcome;
  channels: ProgressChannel[];
  pic: string;
  date: string;
  caption: string;
  screenshotUrl: string;
  monthYear: string;
  timestamp: any;
}
