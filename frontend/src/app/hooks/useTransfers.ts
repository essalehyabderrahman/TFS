import { useState, useEffect, useCallback } from "react";
import { fetchTransfers } from "../api/transfers";
import type { Transfer } from "../api/transfers";

interface UseTransfersResult {
  transfers: Transfer[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTransfers(): UseTransfersResult {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchTransfers();
    setTransfers(data);
    setError(err);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { transfers, loading, error, refetch: load };
}
