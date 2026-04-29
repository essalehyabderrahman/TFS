import { apiRequest } from "./client"

export interface AuditLog {
  id: string
  timestamp: string
  user: string        // backend to_dict() returns "user" key (mapped from user_email)
  action: string
  resource: string
  ipAddress: string   // backend to_dict() returns camelCase "ipAddress"
  location: string
  userAgent: string
  status: "success" | "failed" | "warning"
  details: string
  groupId: string
}

export async function fetchAuditLogs(params: Record<string, any> = {}): Promise<{ logs: AuditLog[]; total: number; error: string | null }> {
  try {
    const query = new URLSearchParams(params).toString()
    const endpoint = `/audit${query ? `?${query}` : ""}`
    const data = await apiRequest<{ logs: AuditLog[]; total: number }>(endpoint)
    return { ...data, error: null }
  } catch (err) {
    return { logs: [], total: 0, error: String(err) }
  }
}
