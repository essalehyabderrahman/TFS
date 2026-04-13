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
): Promise<UploadResult> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  if (!API_BASE_URL) {
    return { ok: false, error: "API_BASE_URL not configured" };
  }

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("recipientEmail", recipientEmail);
    formData.append("expiryDays", String(expiryDays));

    const res = await fetch(`${API_BASE_URL}/transfers`, {
      method: "POST",
      credentials: "include",
      headers: { "X-TFS-CSRF": "true" },
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
