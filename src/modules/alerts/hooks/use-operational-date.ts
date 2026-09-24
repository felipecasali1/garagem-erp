import { useEffect, useState } from "react";
import { currentOperationalDate } from "@/modules/alerts/lib/current-operational-date";

export function useOperationalDate() {
  const [today, setToday] = useState(() => currentOperationalDate());

  useEffect(() => {
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    nextDay.setHours(0, 0, 0, 25);

    const timeout = window.setTimeout(
      () => setToday(currentOperationalDate()),
      Math.max(1000, nextDay.getTime() - now.getTime()),
    );

    return () => window.clearTimeout(timeout);
  }, [today]);

  return today;
}
