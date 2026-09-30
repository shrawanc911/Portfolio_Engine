export function mapDocumentData(isin: string, raw: any) {
  return {
    isin,
    recent_announcements: raw.recent_announcements,
    annual_reports: raw.annual_reports,
    credit_ratings: raw.credit_ratings,
    concalls: raw.concalls,
  };
}
