export function mapCorporateActionsData(isin: string, raw: any) {
  return {
    isin,

    board_meetings: {
      title: raw.board_meetings?.title || "Board Meeting",
      data:
        raw.board_meetings?.data?.map((row: any) => ({
          meetingDate: row.meetingDate,
          agenda: row.agenda,
        })) || [],
    },

    dividends: {
      title: raw.dividends?.title || "Dividend",
      data:
        raw.dividends?.data?.map((row: any) => ({
          recordDate: row.recordDate,
          exDate: row.exDate,
          dividendPercent: row.dividendPercent,
          details: row.details || "",
        })) || [],
    },

    splits: {
      title: raw.splits?.title || "Split",
      data:
        raw.splits?.data?.map((row: any) => ({
          recordDate: row.recordDate,
          exDate: row.exDate,
          ratio: row.ratio,
        })) || [],
    },

    bonus: {
      title: raw.bonus?.title || "Bonus",
      msg: raw.bonus?.msg || "",
    },

    rights: {
      title: raw.rights?.title || "Rights",
      data:
        raw.rights?.data?.map((row: any) => ({
          recordDate: row.recordDate,
          exDate: row.exDate,
          ratio: row.ratio,
          premium: row.premium || "",
        })) || [],
    },
  };
}
