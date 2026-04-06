import { fetchWithFallback } from "./client"
import { MOCK_TEAM_MEMBERS } from "@/mocks"
import type { TeamMember } from "@/types"

export async function fetchTeamMembers(): Promise<{ data: TeamMember[]; error: string | null }> {
  try {
    const data = await fetchWithFallback<TeamMember[]>("/team", MOCK_TEAM_MEMBERS)
    return { data, error: null }
  } catch (err) {
    return { data: MOCK_TEAM_MEMBERS, error: String(err) }
  }
}
