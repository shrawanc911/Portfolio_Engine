import { isMarketClosedToday } from "./checkHoliday";

// src/utils/transformData.ts
export interface DhanRawData {
  close: number[];
  timestamp: number[];
}

export interface ChartData {
  day: string;
  price: number;
}

function formatToDDMMYYYY(ts: number) {
  const date = new Date(ts * 1000);
  // const day = date.getDate().toString().padStart(2, "0");
  // const month = (date.getMonth() + 1).toString().padStart(2, "0");
  // const year = date.getFullYear();
  // return `${day}/${month}/${year}`;

  // Shift to IST (UTC+5:30)
  const istOffset = 330 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffset);

  // Use UTC methods on the shifted date to get the "face value" of IST time
  const day = istDate.getUTCDate().toString().padStart(2, "0");
  const month = (istDate.getUTCMonth() + 1).toString().padStart(2, "0");
  const year = istDate.getUTCFullYear();

  const formatted = `${day}/${month}/${year}`;

  // Debug log to confirm timestamp processing in production
  // console.log(`[DEBUG] Date: ${formatted} | Raw TS: ${ts} | UTC: ${date.toISOString()}`);

  return formatted;
}

function getISTDateKey() {
  const now = new Date();
  const istOffset = 330 * 60 * 1000; // +5:30
  const ist = new Date(now.getTime() + istOffset);

  const d = ist.getDate().toString().padStart(2, "0");
  const m = (ist.getMonth() + 1).toString().padStart(2, "0");
  const y = ist.getFullYear();

  return `${d}/${m}/${y}`;
}

export const mergeTodayCandle = (
  historical: ChartData[],
  todayPrice?: number
): ChartData[] => {
  if (!todayPrice || isMarketClosedToday()) {
    return historical;
  }

  const today = getISTDateKey();
  const last = historical[historical.length - 1];

  // Already has today → just update price
  if (last?.day == today) {
    last.price = todayPrice;
    return historical;
  }
  // Append today
  return [...historical, { day: today, price: todayPrice }];
};


export const transformToChartDataForDB = (raw: DhanRawData) => {
  const dbChartData: ChartData[] = [];

  if (raw?.timestamp && Array.isArray(raw.timestamp)) {
    for (let i = 0; i < raw.timestamp.length; i++) {
      const ts = raw.timestamp[i] ?? 0; // safe fallback
      const price = raw.close?.[i] ?? 0; // safe fallback

      dbChartData.push({
        day: formatToDDMMYYYY(ts),
        price: price,
      });
    }
  }

  return dbChartData;
};

export const transformToChartDataForFrontend = (data: ChartData[]) => {
  const chartData: any[] = [];
  const oneMonthIndex = data.length < 22 ? 0 : data.length - 22;
  const sixMonthIndex = data.length < 132 ? 0 : data.length - 132;
  const oneYearIndex = data.length < 252 ? 0 : data.length - 252;
  const threeYearIndex = data.length < 756 ? 0 : data.length - 756;
  const fiveYearIndex = data.length < 1260 ? 0 : data.length - 1260;
  const allTimeIndex = 0;
  if (data.length) {
    for (let i = 0; i < data.length; i++) {
      chartData.push({
        day: data[i]?.day,
        price: data[i]?.price,
        oneMonthChange:
          i >= oneMonthIndex
            ? calculateChange(
              data[oneMonthIndex]?.price || 0,
              data[i]?.price || 0
            )
            : 0,
        sixMonthChange:
          i >= sixMonthIndex
            ? calculateChange(
              data[sixMonthIndex]?.price || 0,
              data[i]?.price || 0
            )
            : 0,
        oneYearChange:
          i >= oneYearIndex
            ? calculateChange(
              data[oneYearIndex]?.price || 0,
              data[i]?.price || 0
            )
            : 0,
        threeYearChange:
          i >= threeYearIndex
            ? calculateChange(
              data[threeYearIndex]?.price || 0,
              data[i]?.price || 0
            )
            : 0,
        fiveYearChange:
          i >= fiveYearIndex
            ? calculateChange(
              data[fiveYearIndex]?.price || 0,
              data[i]?.price || 0
            )
            : 0,
        allTimeChange:
          i >= allTimeIndex
            ? calculateChange(
              data[allTimeIndex]?.price || 0,
              data[i]?.price || 0
            )
            : 0,
      });
    }
  }
  return chartData;
};

const calculateChange = (initial: number, current: number) => {
  if (initial == 0) {
    return 0;
  }
  return ((current - initial) / initial) * 100;
};
