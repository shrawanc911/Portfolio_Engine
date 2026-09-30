import { Worker, Job } from "bullmq";
import { STOCK_QUEUE_NAME } from "../queues/stock.queue";
import { redisConnection } from "../config/redis";
import { updateStocksDetail } from "../utils/updateStock";

// Helper to check if date is more than X days ago
const isOlderThan = (date: Date, days: number) => {
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > days;
};

let a = 1;

// const processStockJob = async (job: Job) => {
//   const { isin } = job.data;
//   if (!isin) {
//     throw new Error("ISIN is missing in job data");
//   }

//   console.log(`[Worker] Processing stock: ${isin} (Job ID: ${job.id})`);

//   try {
//     // 1. Check existing data in DB
//     const [
//       /*generalDB*/
//       technicalDB,
//       financialDB,
//       documentsDB,
//       corpActionsDB,
//     ] = await Promise.all([
//       // GeneralData.findOne({ isin }).select("lastFetchedAt"),
//       TechnicalData.findOne({ isin }).select("lastFetchedAt"),
//       FinancialData.findOne({ isin }).select("lastFetchedAt"),
//       DocumentData.findOne({ isin }).select("lastFetchedAt"),
//       CorporateActionData.findOne({ isin }).select("lastFetchedAt"),
//     ]);
//     console.log("Fetching data for ISIN from DB: ", isin);

//     const dataToUpsert: any = {};
//     let shouldUpsert = false;

//     // 2. Validity Rules & Sequential Fetching

//     // General: Fetch only if missing
//     // if (!generalDB) {
//     //   console.log("Fetching General Data for ISIN: ", isin);
//     //   try {
//     //     const res = await fetchGeneralDataByISIN(isin);
//     //     dataToUpsert.general = res;
//     //     shouldUpsert = true;
//     //   } catch (error) {
//     //     console.error(`Error fetching General Data for ${isin}:`, error);
//     //   }
//     // }

//     // Technical: Fetch if missing OR older than 7 days
//     if (
//       !technicalDB ||
//       (technicalDB.lastFetchedAt && isOlderThan(technicalDB.lastFetchedAt, 7))
//     ) {
//       console.log("Fetching Technical Data for ISIN: ", isin);
//       try {
//         const res = await fetchTechnicalDataByISIN(isin);
//         dataToUpsert.technical = res;
//         shouldUpsert = true;
//       } catch (error) {
//         console.error(`Error fetching Technical Data for ${isin}:`, error);
//       }
//     }

//     // Financials: Fetch only if missing
//     if (!financialDB) {
//       console.log("Fetching Financial Data for ISIN: ", isin);
//       try {
//         const res = await fetchFinancialDataByISIN(isin);
//         dataToUpsert.financials = res;
//         shouldUpsert = true;
//       } catch (error) {
//         console.error(`Error fetching Financial Data for ${isin}:`, error);
//       }
//     }

//     // Documents: Fetch only if missing
//     if (!documentsDB) {
//       console.log("Fetching Document Data for ISIN: ", isin);
//       try {
//         const res = await fetchDocumentDataByISIN(isin);
//         dataToUpsert.documents = res;
//         shouldUpsert = true;
//       } catch (error) {
//         console.error(`Error fetching Document Data for ${isin}:`, error);
//       }
//     }

//     // Corporate Actions: Fetch only if missing
//     if (!corpActionsDB) {
//       console.log("Fetching Corporate Actions Data for ISIN: ", isin);
//       try {
//         const res = await fetchCorporateActionsDataByISIN(isin);
//         dataToUpsert.corporateActions = res;
//         shouldUpsert = true;
//       } catch (error) {
//         console.error(
//           `Error fetching Corporate Actions Data for ${isin}:`,
//           error,
//         );
//       }
//     }

//     if (!shouldUpsert) {
//       console.log(`[Worker] Data for ${isin} is up-to-date. Skipping fetch.`);
//     } else {
//       // 3. Upsert
//       const result = await upsertFullStockData(isin, dataToUpsert);
//       if (Object.keys(result.errors || {}).length > 0) {
//         console.warn(`[Worker] Partial success for ${isin}:`, result.errors);
//       } else {
//         console.log(`[Worker] Successfully updated ${isin}`);
//       }

//       // 4. Invalidate cache so next fetch gets fresh data
//       await stockCache.invalidate(isin);
//       console.log(`[Worker] Invalidated cache for ${isin} ${a}`);
//       a += 1;
//     }
//   } catch (err: any) {
//     console.error(`[Worker] Error processing ${isin}:`, err);
//     throw err;
//   } finally {
//     // 4. Cleanup Redis key
//     const processingKey = `stock_processing:${isin}`;
//     await redis.del(processingKey);
//   }
// };

// Create a worker instance

const processStockJob = async (job: Job) => {
  await updateStocksDetail(job.data.isin);
};

const worker = new Worker(STOCK_QUEUE_NAME, processStockJob, {
  connection: redisConnection,
  limiter: {
    max: 10, // Max 10 jobs
    duration: 1000, // per 1 second
  },
  concurrency: 1, // Process 5 jobs at the same time
});

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed!`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});

console.log("🚀 Stock Worker initialized");
export default worker;
