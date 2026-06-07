import { apiRequest } from "./client"
import { csrfFetch } from "@/app/lib/csrfFetch"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FSItem {
  id: string
  type: "folder" | "file"
  name: string
  parentId: string | null
  size: number | null
  sizeLabel: string | null
  fileKind: "pdf" | "img" | "zip" | "video" | "doc" | "other" | null
  isEncrypted: boolean
  createdAt: string
  dateTimestamp: number
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function apiListItems(
  parentId: string | null
): Promise<{ data: FSItem[]; error: string | null }> {
  try {
    const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "?parentId=null"
    const data = await apiRequest<FSItem[]>(`/explorer${qs}`)
    return { data, error: null }
  } catch (err: any) {
    return { data: [], error: err?.message ?? "UNKNOWN_ERROR" }
  }
}

// ─── Create Folder ────────────────────────────────────────────────────────────

export async function apiCreateFolder(
  name: string,
  parentId: string | null
): Promise<{ data: FSItem | null; error: string | null }> {
  try {
    const data = await apiRequest<FSItem>("/explorer/folders", {
      method: "POST",
      body: { name, parentId: parentId ?? null },
    })
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? "UNKNOWN_ERROR" }
  }
}

// ─── Upload File ──────────────────────────────────────────────────────────────

export async function apiUploadFile(
  file: File,
  parentId: string | null,
  encrypt: boolean = true
): Promise<{ data: FSItem | null; error: string | null }> {
  if (!API_BASE_URL) return { data: null, error: "API_BASE_URL not configured" }

  const formData = new FormData()
  formData.append("file", file)
  formData.append("parentId", parentId ?? "null")
  formData.append("encrypt", String(encrypt))

  try {
    // IMPORTANT: Do NOT set Content-Type — the browser must set it automatically
    // so it can include the correct multipart boundary.
    const res = await csrfFetch(`${API_BASE_URL}/explorer/upload`, {
      method: "POST",
      credentials: "include",
      body: formData,
    })

    const json = await res.json()
    if (!res.ok) {
      console.error("[apiUploadFile] Upload failed:", res.status, json)
      return { data: null, error: json.error ?? "UPLOAD_FAILED" }
    }
    return { data: json as FSItem, error: null }
  } catch (err: any) {
    console.error("[apiUploadFile] Network error:", err)
    return { data: null, error: "NETWORK_ERROR" }
  }
}

// ─── Rename ───────────────────────────────────────────────────────────────────

export async function apiRenameItem(
  itemId: string,
  newName: string
): Promise<{ data: FSItem | null; error: string | null }> {
  try {
    const data = await apiRequest<FSItem>(`/explorer/${itemId}/rename`, {
      method: "PATCH",
      body: { name: newName },
    })
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? "UNKNOWN_ERROR" }
  }
}

// ─── Move ─────────────────────────────────────────────────────────────────────

export async function apiMoveItem(
  itemId: string,
  targetParentId: string | null
): Promise<{ data: FSItem | null; error: string | null }> {
  try {
    const data = await apiRequest<FSItem>(`/explorer/${itemId}/move`, {
      method: "PATCH",
      body: { targetParentId: targetParentId ?? null },
    })
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? "UNKNOWN_ERROR" }
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function apiDeleteItem(
  itemId: string
): Promise<{ ok: boolean; error: string | null }> {
  try {
    await apiRequest(`/explorer/${itemId}`, { method: "DELETE" })
    return { ok: true, error: null }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "UNKNOWN_ERROR" }
  }
}

// ─── Download ─────────────────────────────────────────────────────────────────

export function getFileDownloadUrl(itemId: string): string {
  return `${API_BASE_URL}/explorer/${itemId}/download`
}

// ─── Inline content edit (Personal Storage) ───────────────────────────────────

/**
 * Overwrite a Personal Storage text file's content in place.
 * No lock is required — Personal Storage files are single-owner.
 * Encryption is transparently preserved by the backend.
 */
export async function updateExplorerFileContent(
  itemId: string,
  content: string,
): Promise<{ data: FSItem | null; error: string | null }> {
  try {
    const data = await apiRequest<FSItem>(`/explorer/${itemId}/content`, {
      method: "PUT",
      body: { content },
    })
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? "UNKNOWN_ERROR" }
  }
}

// ─── Trash ────────────────────────────────────────────────────────────────────

export async function apiListTrash(): Promise<{ data: FSItem[]; error: string | null }> {
  try {
    const data = await apiRequest<FSItem[]>("/explorer/trash")
    return { data, error: null }
  } catch (err: any) {
    return { data: [], error: err?.message ?? "UNKNOWN_ERROR" }
  }
}

export async function apiRestoreItem(
  itemId: string
): Promise<{ ok: boolean; error: string | null }> {
  try {
    await apiRequest(`/explorer/${itemId}/restore`, { method: "POST" })
    return { ok: true, error: null }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "UNKNOWN_ERROR" }
  }
}

export async function apiPermanentDeleteItem(
  itemId: string
): Promise<{ ok: boolean; error: string | null }> {
  try {
    await apiRequest(`/explorer/${itemId}/permanent`, { method: "DELETE" })
    return { ok: true, error: null }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "UNKNOWN_ERROR" }
  }
}

