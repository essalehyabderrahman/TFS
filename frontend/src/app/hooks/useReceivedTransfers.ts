import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "../api/client";
import type { Transfer } from "../api/transfers";

interface UseReceivedTransfersResult {
  transfers: Transfer[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReceivedTransfers(): UseReceivedTransfersResult {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<Transfer[]>("/transfers/received");
      setTransfers(data);
    } catch (err) {
      setError(String(err));
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { transfers, loading, error, refresh: load };
}
