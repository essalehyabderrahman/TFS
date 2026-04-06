// ─── Transfers ────────────────────────────────────────────────────────────────

export type TransferStatus = "Delivered" | "Sending..." | "Expired" | "Pending"

export type FileType = "pdf" | "img" | "zip" | "video" | "doc" | "other"

export interface Transfer {
  id: string
  fileName: string
  fileType: FileType
  recipient: string
  size: string
  sizeBytes: number
  status: TransferStatus
  date: string
  dateTimestamp: number
  encryptionType: string
  downloadCount: number
  expiryDate: string
  uploadedBy: string
}

// ─── Team ─────────────────────────────────────────────────────────────────────

export type TeamRole = "admin" | "editor" | "viewer"

export type MemberStatus = "active" | "pending" | "suspended"

export interface TeamMember {
  id: string
  name: string
  email: string
  role: TeamRole
  status: MemberStatus
  joinedAt: Date
  lastActive: Date
  transfersCount: number
  avatar: string
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  name: string
  email: string
  role: TeamRole
}

// ─── API ──────────────────────────────────────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface RequestOptions {
  method?: HttpMethod
  body?: unknown
  headers?: Record<string, string>
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export type AuditStatus = "success" | "failed" | "warning"

export interface AuditLog {
  id: string
  timestamp: Date
  user: string
  action: string
  resource: string
  ipAddress: string
  location: string
  status: AuditStatus
  details: string
}
