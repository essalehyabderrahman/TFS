import { apiRequest } from "./client";
// no token imported
import type { Transfer } from "@/types";

export type { Transfer };

// ── List transfers ─────────────────────────────────────────────────────────────

export async function fetchTransfers(): Promise<{ data: Transfer[]; error: string | null }> {
  try {
    const data = await apiRequest<Transfer[]>("/transfers");
    return { data, error: null };
  } catch (err) {
    return { data: [], error: String(err) };
  }
}

// ── Upload a new transfer ──────────────────────────────────────────────────────

interface UploadResult {
  ok: boolean;
  transfer?: Transfer;
  error?: string;
}

/**
 * Uploads a file to the backend using multipart/form-data.
 */
export async function uploadTransfer(
  file: File,
  recipientEmail = "",
  expiryDays = 7,
  encrypt = true,
): Promise<UploadResult> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  if (API_BASE_URL === undefined) {
    return { ok: false, error: "API_BASE_URL not configured" };
  }

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("recipientEmail", recipientEmail);
    formData.append("expiryDays", String(expiryDays));
    formData.append("encrypt", String(encrypt));

    const res = await fetch(`${API_BASE_URL}/transfers`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": document.cookie.split("; ").find(r => r.startsWith("csrf_token="))?.split("=")[1] ?? "" },
      // Do NOT set Content-Type — browser must compute multipart boundary automatically
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      return { ok: false, error: data.error ?? "UPLOAD_FAILED" };
    }

    return { ok: true, transfer: data as Transfer };
  } catch {
    return { ok: false, error: "NETWORK_ERROR" };
  }
}

// ── Shared Access Control (ACL) ────────────────────────────────────────────────

export interface AclEntry {
  id: string;
  transferId: string;
  userId: string;
  userEmail: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canShare: boolean;
  grantedAt: string;
}

export interface AclPayload {
  userEmail: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canShare: boolean;
}

export async function fetchAcl(transferId: string): Promise<{ data: AclEntry[]; error: string | null }> {
  try {
    const data = await apiRequest<AclEntry[]>(`/transfers/${transferId}/acl`);
    return { data, error: null };
  } catch (err) {
    return { data: [], error: String(err) };
  }
}

export async function grantAcl(transferId: string, payload: AclPayload): Promise<{ data: AclEntry | null; error: string | null }> {
  try {
    const data = await apiRequest<AclEntry>(`/transfers/${transferId}/acl`, {
      method: "POST",
      body: payload
    });
    return { data, error: null };
  } catch (err) {
    return { data: null, error: String(err) };
  }
}

export async function revokeAcl(transferId: string, userId: string): Promise<{ ok: boolean; error: string | null }> {
  try {
    await apiRequest(`/transfers/${transferId}/acl/${userId}`, {
      method: "DELETE"
    });
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
