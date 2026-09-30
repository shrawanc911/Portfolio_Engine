

export function getProgressMessage(progress: number): string {
  if (progress < 20) return "Reading your portfolio...";
  if (progress < 80) return "Fetching stock data...";
  if (progress < 90) return "Calculating metrics...";
  return "Almost done...";
}