import mongoose, { Schema, Document } from "mongoose";

/* ================================
   WEEKLY REPORT INTERFACES
================================== */

export interface IContribution {
    stockName: string;
    stockIcon?: string;
    amount: number;
    isGain: boolean;
    description: string;
}

export interface ISectorPerformance {
    sector: string;
    percentage: number;
}

export interface ISectorAllocation {
    sector: string;
    percentage: number;
}

export interface IInsight {
    title: string;
    description: string;
}

export interface IMarketOverviewItem {
    title: string;
    description: string;
}

export interface IMarketOverview {
    snapshot: IMarketOverviewItem;
    keyDrivers: IMarketOverviewItem;
    risks: IMarketOverviewItem;
    globalCues: IMarketOverviewItem;
}

export interface IStockUpdate {
    stockName: string;
    stockIcon?: string;
    trend: "up" | "down" | "neutral";
    description: string;
}

export interface IDelivery {
    channel: "whatsapp";
    sentAt?: Date;
    status: "pending" | "sent" | "failed";
    error?: string;
}

export interface IWeeklyReportSummary {
    weeklyReturns: number;
    weeklyReturnsPercentage: number;
    currentValue: number;
    totalReturns: number;
    totalReturnsPercentage: number;
    investedAmount: number;
    weekSummary: string;
}

export interface IWeeklyReport extends Document {
    userId: mongoose.Types.ObjectId;
    userName: string;
    phone: string;

    period: {
        start: Date;
        end: Date;
    };

    summary: IWeeklyReportSummary;
    contribution: IContribution[];
    sectorPerformance: ISectorPerformance[];
    allocation: ISectorAllocation[];
    insights: IInsight[];
    marketOverview: IMarketOverview;
    stockUpdates: IStockUpdate[];

    delivery: IDelivery;

    createdAt: Date;
    updatedAt: Date;
}

/* ================================
   MONGOOSE SCHEMA
================================== */

const ContributionSchema = new Schema<IContribution>({
    stockName: { type: String, required: true },
    stockIcon: String,
    amount: { type: Number, required: true },
    isGain: { type: Boolean, required: true },
    description: { type: String, required: true },
});

const SectorPerformanceSchema = new Schema<ISectorPerformance>({
    sector: { type: String, required: true },
    percentage: { type: Number, required: true },
});

const SectorAllocationSchema = new Schema<ISectorAllocation>({
    sector: { type: String, required: true },
    percentage: { type: Number, required: true },
});

const InsightSchema = new Schema<IInsight>({
    title: { type: String, required: true },
    description: { type: String, required: true },
});

const MarketOverviewItemSchema = new Schema<IMarketOverviewItem>({
    title: { type: String, required: true },
    description: { type: String, required: true },
});

const StockUpdateSchema = new Schema<IStockUpdate>({
    stockName: { type: String, required: true },
    stockIcon: String,
    trend: { type: String, enum: ["up", "down", "neutral"], required: true },
    description: { type: String, required: true },
});

const WeeklyReportSchema = new Schema<IWeeklyReport>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        userName: { type: String, required: true },
        phone: { type: String, required: true },

        period: {
            start: { type: Date, required: true },
            end: { type: Date, required: true },
        },

        summary: {
            weeklyReturns: { type: Number, required: true },
            weeklyReturnsPercentage: { type: Number, required: true },
            currentValue: { type: Number, required: true },
            totalReturns: { type: Number, required: true },
            totalReturnsPercentage: { type: Number, required: true },
            investedAmount: { type: Number, required: true },
            weekSummary: { type: String, required: true },
        },

        contribution: [ContributionSchema],
        sectorPerformance: [SectorPerformanceSchema],
        allocation: [SectorAllocationSchema],
        insights: [InsightSchema],

        marketOverview: {
            snapshot: MarketOverviewItemSchema,
            keyDrivers: MarketOverviewItemSchema,
            risks: MarketOverviewItemSchema,
            globalCues: MarketOverviewItemSchema,
        },

        stockUpdates: [StockUpdateSchema],

        delivery: {
            channel: { type: String, enum: ["whatsapp"], default: "whatsapp" },
            sentAt: Date,
            status: {
                type: String,
                enum: ["pending", "sent", "failed"],
                default: "pending",
            },
            error: String,
        },
    },
    { timestamps: true }
);

// Compound index for idempotency: one report per user per week
WeeklyReportSchema.index({ userId: 1, "period.start": 1 }, { unique: true });

export const WeeklyReport = mongoose.model<IWeeklyReport>(
    "WeeklyReport",
    WeeklyReportSchema
);
