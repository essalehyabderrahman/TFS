import { useState, useEffect, useCallback } from "react"
import { fetchTeamMembers } from "@/app/api/team"
import type { TeamMember, TeamRole } from "@/types"

interface UseTeamReturn {
  members: TeamMember[]
  loading: boolean
  error: string | null
  inviteMember: (email: string, role: TeamRole) => void
  updateRole: (id: string, role: TeamRole) => void
  removeMember: (id: string) => void
}

export function useTeam(): UseTeamReturn {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await fetchTeamMembers()
      if (!cancelled) {
        setMembers(data)
        setError(fetchError)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const inviteMember = useCallback((email: string, role: TeamRole) => {
    const newMember: TeamMember = {
      id: crypto.randomUUID(),
      name: email.split("@")[0],
      email,
      role,
      status: "pending",
      joinedAt: new Date(),
      lastActive: new Date(),
      transfersCount: 0,
      avatar: email.slice(0, 2).toUpperCase(),
    }
    setMembers((prev) => [...prev, newMember])
  }, [])

  const updateRole = useCallback((id: string, role: TeamRole) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, role } : m))
    )
  }, [])

  const removeMember = useCallback((id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id))
  }, [])

  return { members, loading, error, inviteMember, updateRole, removeMember }
}
