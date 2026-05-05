import { apiRequest } from "./client"
import type { Transfer } from "@/types"

export interface Group {
  id: string
  name: string
  description: string
  createdBy: string
  createdAt: string
  memberCount: number
  myRole: "admin" | "member" | null
}

export interface GroupMember {
  id: string
  groupId: string
  userId: string
  userEmail: string
  userName: string
  userAvatar: string
  role: "admin" | "member"
  joinedAt: string
  invitedBy: string
}

export interface GroupSettings {
  groupId: string
  allowMemberDirectory: boolean
  allowMemberInvite: boolean
  allowExternalSharing: boolean
  allowGroupTransfers: boolean
  updatedAt: string | null
  updatedBy: string | null
}

export interface UserSuggestion {
  id: string
  email: string
  name: string
  avatar: string
}

export async function searchUsers(q: string): Promise<UserSuggestion[]> {
  if (q.length < 2) return []
  try {
    return await apiRequest<UserSuggestion[]>(`/team/search?q=${encodeURIComponent(q)}`)
  } catch {
    return []
  }
}

export async function fetchGroups(): Promise<{ data: Group[]; error: string | null }> {
  try {
    const data = await apiRequest<Group[]>("/groups")
    return { data, error: null }
  } catch (err: any) {
    return { data: [], error: err?.message ?? String(err) }
  }
}

export async function createGroup(name: string, description: string): Promise<{ data: Group | null; error: string | null }> {
  try {
    const data = await apiRequest<Group>("/groups", {
      method: "POST",
      body: { name, description }
    })
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? String(err) }
  }
}

export async function deleteGroup(groupId: string): Promise<{ ok: boolean; error: string | null }> {
  try {
    await apiRequest(`/groups/${groupId}`, { method: "DELETE" })
    return { ok: true, error: null }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

export async function fetchGroupMembers(groupId: string): Promise<{ data: GroupMember[]; error: string | null }> {
  try {
    const data = await apiRequest<GroupMember[]>(`/groups/${groupId}/members`)
    return { data, error: null }
  } catch (err: any) {
    return { data: [], error: err?.message ?? String(err) }
  }
}

export async function inviteGroupMember(groupId: string, email: string, role: "admin" | "member"): Promise<{ data: GroupMember | null; error: string | null }> {
  try {
    const data = await apiRequest<GroupMember>(`/groups/${groupId}/members`, {
      method: "POST",
      body: { email, role }
    })
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? String(err) }
  }
}

export async function updateGroupMember(groupId: string, userId: string, role: "admin" | "member"): Promise<{ data: GroupMember | null; error: string | null }> {
  try {
    const data = await apiRequest<GroupMember>(`/groups/${groupId}/members/${userId}`, {
      method: "PATCH",
      body: { role }
    })
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? String(err) }
  }
}

export async function removeGroupMember(groupId: string, userId: string): Promise<{ ok: boolean; error: string | null }> {
  try {
    await apiRequest(`/groups/${groupId}/members/${userId}`, { method: "DELETE" })
    return { ok: true, error: null }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

export async function fetchGroupSettings(groupId: string): Promise<{ data: GroupSettings | null; error: string | null }> {
  try {
    const data = await apiRequest<GroupSettings>(`/groups/${groupId}/settings`)
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? String(err) }
  }
}

export async function updateGroupSettings(groupId: string, updates: Partial<GroupSettings>): Promise<{ data: GroupSettings | null; error: string | null }> {
  try {
    const data = await apiRequest<GroupSettings>(`/groups/${groupId}/settings`, {
      method: "PATCH",
      body: updates
    })
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? String(err) }
  }
}

export async function fetchGroupTransfers(groupId: string): Promise<{ data: Transfer[]; error: string | null }> {
  try {
    const data = await apiRequest<Transfer[]>(`/groups/${groupId}/transfers`)
    return { data, error: null }
  } catch (err: any) {
    return { data: [], error: err?.message ?? String(err) }
  }
}

export async function uploadGroupTransfer(
  groupId: string,
  file: File,
  expiryDays = 7,
): Promise<{ ok: boolean; transfer?: Transfer; error?: string }> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  if (!API_BASE_URL) return { ok: false, error: "API_BASE_URL not configured" }
  try {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("expiryDays", String(expiryDays))
    const csrfToken = document.cookie.split("; ").find(r => r.startsWith("csrf_token="))?.split("=")[1] ?? ""
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}/transfers`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": csrfToken },
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error ?? "UPLOAD_FAILED" }
    return { ok: true, transfer: data as Transfer }
  } catch {
    return { ok: false, error: "NETWORK_ERROR" }
  }
}
