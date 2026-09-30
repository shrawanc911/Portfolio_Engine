import mongoose, { Document, Schema } from "mongoose";

interface Updates extends Document {
  user_id: string;
  portfolio_id: mongoose.Types.ObjectId;
  stocks: any;
}

const portfolioUpdatesSchema = new Schema<Updates>(
  {
    user_id: {
      type: String,
      required: true,
    },
    portfolio_id: {
      type: Schema.Types.ObjectId,
      ref: "Portfolio",
      required: true,
    },
    stocks: {
      type: [
        {
          isin: {
            type: String,
            required: true,
          },
          security_id: {
            type: String,
            required: true,
          },
          display_name: {
            type: String,
            required: true,
          },
          instrument_type: {
            type: String,
            enum: ["EQUITY", "ETF", "MF"],
            required: true,
          },
          quantity: {
            type: Number,
            required: true,
            min: 0,
          },
          average_buy_price: {
            type: Number,
            required: true,
            min: 0,
          },
          buy_value: {
            type: Number,
            required: true,
            min: 0,
          },
        },
      ],
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<Updates>(
  "PortfolioUpdate",
  portfolioUpdatesSchema
);
