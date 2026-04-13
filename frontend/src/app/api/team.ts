import { apiRequest } from "./client"
import type { TeamMember } from "@/types"

export async function fetchTeamMembers(): Promise<{ data: TeamMember[]; error: string | null }> {
  try {
    const data = await apiRequest<TeamMember[]>("/team")
    return { data, error: null }
  } catch (err) {
    return { data: [], error: String(err) }
  }
}

export async function apiInviteMember(name: string, email: string, role: string) {
  try {
    const data = await apiRequest<TeamMember>("/team", {
      method: "POST",
      body: { name, email, role }
    })
    return { data, ok: true }
  } catch (err) {
    return { error: String(err), ok: false }
  }
}

export async function apiUpdateMember(id: string, updates: Partial<TeamMember>) {
  try {
    const data = await apiRequest<TeamMember>(`/team/${id}`, {
      method: "PATCH",
      body: updates
    })
    return { data, ok: true }
  } catch (err) {
    return { error: String(err), ok: false }
  }
}

export async function apiDeleteMember(id: string) {
  try {
    await apiRequest(`/team/${id}`, {
      method: "DELETE"
    })
    return { ok: true }
  } catch (err) {
    return { error: String(err), ok: false }
  }
}
