import { fetchWithFallback } from "./client";
import { getToken } from "./auth";
import { MOCK_TRANSFERS } from "@/mocks";
import type { Transfer } from "@/types";

export type { Transfer };

// ── List transfers ─────────────────────────────────────────────────────────────

export async function fetchTransfers(): Promise<{ data: Transfer[]; error: string | null }> {
  try {
    const data = await fetchWithFallback<Transfer[]>("/transfers", MOCK_TRANSFERS);
    return { data, error: null };
  } catch (err) {
    return { data: MOCK_TRANSFERS, error: String(err) };
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
 * Falls back gracefully when VITE_API_BASE_URL is not set (mock mode).
 */
export async function uploadTransfer(
  file: File,
  recipientEmail = "",
  expiryDays = 7,
): Promise<UploadResult> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  // ── Mock mode ────────────────────────────────────────────────────────────────
  if (!API_BASE_URL) {
    await new Promise((r) => setTimeout(r, 1000)); // simulate network
    const mockTransfer: Transfer = {
      id: `mock-${Date.now()}`,
      file_name: file.name,
      original_name: file.name,
      file_type: "other",
      size_bytes: file.size,
      recipient_email: recipientEmail || null,
      expiry_date: null,
      uploaded_by_id: "mock-1",
      status: recipientEmail ? "Delivered" : "Pending",
      current_version: 1,
      download_count: 0,
      locked_by_id: null,
      locked_at: null,
      is_deleted: false,
      created_at: new Date().toISOString(),
    } as unknown as Transfer;
    return { ok: true, transfer: mockTransfer };
  }

  // ── Real backend ─────────────────────────────────────────────────────────────
  try {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("recipientEmail", recipientEmail);
    formData.append("expiryDays", String(expiryDays));

    const res = await fetch(`${API_BASE_URL}/transfers`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
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
