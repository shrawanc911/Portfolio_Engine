// timeIST.ts

const istFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export type ISTDateTime = {
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm"
};

/**
 * Formats a JavaScript Date object into IST date & time.
 *
 * @param date - JavaScript Date object (any timezone)
 * @returns {ISTDateTime} Object containing:
 *  - date: "YYYY-MM-DD" (IST)
 *  - time: "HH:mm" (IST)
 */
export function formatIST(date: Date): ISTDateTime {
  const parts = istFormatter.formatToParts(date);

  const yyyy = parts.find((p) => p.type === "year")?.value;
  const mm = parts.find((p) => p.type === "month")?.value;
  const dd = parts.find((p) => p.type === "day")?.value;
  const hh = parts.find((p) => p.type === "hour")?.value;
  const mi = parts.find((p) => p.type === "minute")?.value;

  if (!yyyy || !mm || !dd || !hh || !mi) {
    throw new Error("Failed to format IST date");
  }

  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${mi}`,
  };
}

/**
 * Converts a UNIX timestamp (in seconds) to IST date & time.
 *
 * @param unixSeconds - UNIX timestamp in seconds (e.g. 1708414500)
 * @returns {ISTDateTime} Object containing:
 *  - date: "YYYY-MM-DD" (IST)
 *  - time: "HH:mm" (IST)
 */
export function getTimeISTFromUnix(unixSeconds: number): ISTDateTime {
  const d = new Date(unixSeconds * 1000);
  return formatIST(d);
}

/**
 * Returns today's date in IST.
 *
 * @returns {string} Date string in format "YYYY-MM-DD" (IST)
 */
export function getTodayDateIST(): string {
  const { date } = formatIST(new Date());
  return date;
}

/**
 * Returns the date in IST for N days in the past.
 *
 * @param days - Number of days to go back (e.g. 7 = 7 days ago)
 * @returns {string} Date string in format "YYYY-MM-DD" (IST)
 */
export function getPastDateIST(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const { date } = formatIST(d);
  return date;
}
