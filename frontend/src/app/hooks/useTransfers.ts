import { useState, useEffect } from "react"
import { fetchTransfers } from "@/app/api/transfers"
import type { Transfer } from "@/types"

interface UseTransfersReturn {
  transfers: Transfer[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useTransfers(): UseTransfersReturn {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [tick, setTick]           = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await fetchTransfers()
      if (!cancelled) {
        setTransfers(data)
        setError(fetchError)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [tick])

  return {
    transfers,
    loading,
    error,
    refetch: () => setTick((n) => n + 1),
  }
}
