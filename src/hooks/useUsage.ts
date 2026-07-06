import { useCallback, useEffect, useState } from "react";
import { getUsageSummary, listUsage, recordUsage, type UsageDraft, type UsageRecord, type UsageSummary } from "../lib/storage";

const initialUsageSummary: UsageSummary = {
  totalUsage: 0,
  todayUsage: 0,
  clipboardActions: 0,
  averageResponseMs: 0,
  toolCountTrendPercent: 0,
  todayUsageTrendPercent: 0,
  clipboardTrendPercent: 0,
  okCount: 0,
  warnCount: 0,
  errorCount: 0,
  recentToolCounts: [],
  toolCounts: [],
  backend: "fallback"
};

export function useUsage() {
  const [usage, setUsage] = useState<UsageRecord[]>([]);
  const [summary, setSummary] = useState<UsageSummary>(initialUsageSummary);

  const refresh = useCallback(async () => {
    const [nextUsage, nextSummary] = await Promise.all([listUsage(12), getUsageSummary()]);
    setUsage(nextUsage);
    setSummary(nextSummary);
  }, []);

  const record = useCallback(
    async (entry: UsageDraft) => {
      await recordUsage(entry);
      await refresh();
    },
    [refresh]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { usage, summary, record, refresh };
}
