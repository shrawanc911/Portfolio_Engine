import { GeneralData } from "../models/stock/GeneralData.model";
import { TechnicalData } from "../models/stock/TechnicalData.model";
import { FinancialData } from "../models/stock/FinancialData.model";
import { DocumentData } from "../models/stock/DocumentData.model";
import { CorporateActionData } from "../models/stock/CorporateActionData.model";

import { mapGeneralData } from "../mappers/general.mapper";
import { mapTechnicalData } from "../mappers/technical.mapper";
import { mapFinancialData } from "../mappers/financial.mapper";
import { mapCorporateActionsData } from "../mappers/corporateActions.mapper";
import { mapDocumentData } from "../mappers/document.mapper";

type UpsertResult = {
  general?: boolean;
  technical?: boolean;
  financials?: boolean;
  documents?: boolean;
  corporateActions?: boolean;
  errors?: Record<string, string>;
};

export async function upsertFullStockData(
  isin: string,
  rawData: {
    general?: any;
    technical?: any;
    financials?: any;
    documents?: any;
    corporateActions?: any;
  }
): Promise<UpsertResult> {
  const now = new Date();
  const result: UpsertResult = { errors: {} };

  const ops: Promise<any>[] = [];

  /* -----------------------------
     General
  ----------------------------- */
  if (rawData.general) {
    ops.push(
      (async () => {
        try {
          await GeneralData.updateOne(
            { isin },
            {
              $set: {
                ...mapGeneralData(isin, rawData.general),
                lastFetchedAt: now,
              },
            },
            { upsert: true }
          );
          result.general = true;
        } catch (err: any) {
          console.error(`[GeneralData][${isin}]`, err.message);
          result.general = false;
          result.errors!.general = err.message;
        }
      })()
    );
  }

  /* -----------------------------
     Technical
  ----------------------------- */
  if (rawData.technical) {
    ops.push(
      (async () => {
        try {
          await TechnicalData.updateOne(
            { isin },
            {
              $set: {
                ...mapTechnicalData(isin, rawData.technical),
                lastFetchedAt: now,
                validTill: addDays(7),
                status: "fresh",
              },
            },
            { upsert: true }
          );
          result.technical = true;
        } catch (err: any) {
          console.error(`[TechnicalData][${isin}]`, err.message);
          result.technical = false;
          result.errors!.technical = err.message;
        }
      })()
    );
  }

  /* -----------------------------
     Financials
  ----------------------------- */
  if (rawData.financials) {
    ops.push(
      (async () => {
        try {
          await FinancialData.updateOne(
            { isin },
            {
              $set: {
                ...mapFinancialData(isin, rawData.financials),
                lastFetchedAt: now,
                validTill: addDays(90),
                status: "fresh",
              },
            },
            { upsert: true }
          );
          result.financials = true;
        } catch (err: any) {
          console.error(`[FinancialData][${isin}]`, err.message);
          result.financials = false;
          result.errors!.financials = err.message;
        }
      })()
    );
  }

  /* -----------------------------
     Documents
  ----------------------------- */
  if (rawData.documents) {
    ops.push(
      (async () => {
        try {
          await DocumentData.updateOne(
            { isin },
            {
              $set: {
                ...mapDocumentData(isin, rawData.documents),
                lastFetchedAt: now,
                validTill: addDays(30),
                status: "fresh",
              },
            },
            { upsert: true }
          );
          result.documents = true;
        } catch (err: any) {
          console.error(`[DocumentData][${isin}]`, err.message);
          result.documents = false;
          result.errors!.documents = err.message;
        }
      })()
    );
  }

  /* -----------------------------
     Corporate Actions
  ----------------------------- */
  if (rawData.corporateActions) {
    ops.push(
      (async () => {
        try {
          await CorporateActionData.updateOne(
            { isin },
            {
              $set: {
                ...mapCorporateActionsData(isin, rawData.corporateActions),
                lastFetchedAt: now,
                validTill: addDays(30),
                status: "fresh",
              },
            },
            { upsert: true }
          );
          result.corporateActions = true;
        } catch (err: any) {
          console.error(`[CorporateActionData][${isin}]`, err.message);
          result.corporateActions = false;
          result.errors!.corporateActions = err.message;
        }
      })()
    );
  }

  await Promise.all(ops);

  if (Object.keys(result.errors!).length === 0) {
    delete result.errors;
  }

  return result;
}

/* -----------------------------
   Helpers
----------------------------- */
export function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
