import { apiRequest } from "./client"

export interface QuotaRequestData {
  id: string
  userId: string
  userName?: string
  userEmail?: string
  userAvatar?: string
  currentQuotaBytes?: number | null
  justification: string
  requestedBytes: number
  status: "pending" | "approved" | "rejected"
  adminNote?: string | null
  adminName?: string
  createdAt: string
  resolvedAt?: string | null
}

export async function submitQuotaRequest(
  justification: string,
  requestedBytes: number
): Promise<{ data?: QuotaRequestData; error?: string }> {
  try {
    const data = await apiRequest<QuotaRequestData>("/quota-requests", {
      method: "POST",
      body: { justification, requestedBytes },
    })
    return { data }
  } catch (err: any) {
    return { error: err?.message ?? String(err) }
  }
}

export async function fetchMyQuotaRequests(): Promise<{
  data: QuotaRequestData[]
  error: string | null
}> {
  try {
    const data = await apiRequest<QuotaRequestData[]>("/quota-requests/mine")
    return { data, error: null }
  } catch (err: any) {
    return { data: [], error: err?.message ?? String(err) }
  }
}

export async function fetchPendingQuotaRequests(
  status: string = "pending"
): Promise<{ data: QuotaRequestData[]; error: string | null }> {
  try {
    const data = await apiRequest<QuotaRequestData[]>(
      `/quota-requests?status=${status}`
    )
    return { data, error: null }
  } catch (err: any) {
    return { data: [], error: err?.message ?? String(err) }
  }
}

export async function resolveQuotaRequest(
  id: string,
  action: "approve" | "reject",
  adminNote?: string
): Promise<{ data?: QuotaRequestData; error?: string }> {
  try {
    const data = await apiRequest<QuotaRequestData>(`/quota-requests/${id}`, {
      method: "PATCH",
      body: { action, adminNote },
    })
    return { data }
  } catch (err: any) {
    return { error: err?.message ?? String(err) }
  }
}
