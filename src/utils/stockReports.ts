


export function pickLastNYears(
  data: Record<string, number>,
  n: number = 5,
): Record<string, number> {
  const entries = Object.entries(data)
    .filter(([key]) => key !== "ttm") // remove ttm
    .sort((a, b) => {
      // sort by year number inside "mar 2018", "mar 2019", etc.
      const yearA = parseInt(a[0].match(/\d{4}/)?.[0] || "0", 10);
      const yearB = parseInt(b[0].match(/\d{4}/)?.[0] || "0", 10);
      return yearA - yearB;
    });

  const lastN = entries.slice(-n); // take last N years

  return Object.fromEntries(lastN);
}

export function withGrowthRate(
  data: Record<string, number>,
  lastN: number = 5,
): Record<string, number> {
  const entries = Object.entries(data)
    .filter(([key]) => key !== "ttm")
    .sort((a, b) => {
      const yearA = parseInt(a[0].match(/\d{4}/)?.[0] || "0", 10);
      const yearB = parseInt(b[0].match(/\d{4}/)?.[0] || "0", 10);
      return yearA - yearB;
    })
    .slice(-lastN); // keep only last N years

  const result: Record<string, number> = {};

  let lastValue: number | undefined = undefined;

  for (const [key, value] of entries) {
    if (lastValue === undefined || lastValue === 0) {
      result[key] = 0; // or null if you prefer
    } else {
      const growth = ((value - lastValue) / lastValue) * 100;
      result[key] = growth;
    }
    lastValue = value;
  }

  return result;
}