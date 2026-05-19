import { apiRequest } from "./client"
import type { TeamMember } from "@/types"

export async function fetchTeamMembers(): Promise<{ data: TeamMember[]; error: string | null }> {
  try {
    const data = await apiRequest<TeamMember[]>("/team")
    return { data, error: null }
  } catch (err: any) {
    const message = err?.message ?? String(err)
    return { data: [], error: message }
  }
}

export async function apiInviteMember(name: string, email: string, role: string, password?: string) {
  try {
    const data = await apiRequest<TeamMember>("/team", {
      method: "POST",
      body: { name, email, role, password }
    })
    return { data, ok: true }
  } catch (err: any) {
    const message = err?.message ?? String(err)
    return { error: message, ok: false }
  }
}

export async function apiUpdateMember(id: string, updates: Partial<TeamMember>) {
  try {
    const data = await apiRequest<TeamMember>(`/team/${id}`, {
      method: "PATCH",
      body: updates
    })
    return { data, ok: true }
  } catch (err: any) {
    const message = err?.message ?? String(err)
    return { error: message, ok: false }
  }
}

export async function apiDeleteMember(id: string) {
  try {
    await apiRequest(`/team/${id}`, {
      method: "DELETE"
    })
    return { ok: true }
  } catch (err: any) {
    const message = err?.message ?? String(err)
    return { error: message, ok: false }
  }
}

export interface TeamSettings {
  allowMemberDirectory: boolean
  allowMemberInvite: boolean
  allowExternalSharing: boolean
  updatedAt: string | null
  updatedBy: string | null
}

export async function fetchTeamSettings(): Promise<{ data: TeamSettings | null; error: string | null }> {
  try {
    const data = await apiRequest<TeamSettings>("/team/settings")
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? String(err) }
  }
}

export async function updateTeamSettings(updates: Partial<TeamSettings>): Promise<{ data: TeamSettings | null; error: string | null }> {
  try {
    const data = await apiRequest<TeamSettings>("/team/settings", {
      method: "PATCH",
      body: updates
    })
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? String(err) }
  }
}

export async function apiAdminSetPassword(userId: string, password: string) {
  try {
    await apiRequest(`/team/${userId}/password`, {
      method: "PATCH",
      body: { password }
    })
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "UNKNOWN_ERROR" }
  }
}

export async function apiAdminSendPasswordEmail(userId: string, emailData: { to: string; subject: string; body: string }) {
  try {
    const data = await apiRequest<{ ok: boolean; emailSent: boolean }>(`/team/${userId}/send-password-email`, {
      method: "POST",
      body: emailData
    })
    return { ok: true, emailSent: data.emailSent }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "UNKNOWN_ERROR" }
  }
}
