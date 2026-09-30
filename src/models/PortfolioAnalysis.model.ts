import mongoose, { Schema, Document } from "mongoose";

/* ================================
   1. INTERFACES (TypeScript Types)
================================== */

export interface IRecommendation {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string;
  rationale: string;
  actions: string[];
}

export interface IHolding {
  ticker: string;
  isin: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  market_value: number;
  invested_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  sector: string;
  weight_pct: number;
}

export interface IRiskContributor {
  ticker: string;
  contribution_pct: number;
  weight_pct: number;
  individual_volatility_annual: number;
  market_value: number;
}

export interface IDiversificationMetrics {
  hhi: number;
  gini: number;
  effective_holdings: number;
  num_holdings: number;
  top_3_concentration_pct: number;
  top_5_concentration_pct: number;
  top_10_concentration_pct: number;
  largest_holding: {
    ticker: string;
    weight_pct: number;
    market_value: number;
  };
}

export interface ISectorAnalysis {
  sectors: Record<string, any>; // dynamic sector object
  sector_hhi: number;
  effective_sectors: number;
  num_sectors: number;
}

export interface ICorrelationAnalysis {
  avg_correlation: number;
  max_correlation: number;
  min_correlation: number;
  median_correlation: number;
  max_pair: string[];
  min_pair: string[];
}

export interface IScores {
  portfolio_score: number;
  risk_score: number;
  concentration_score: number;
  volatility_score: number;
  beta_score: number;
  diversification_score: number;
  grade: string;
  risk_category: string;
}

export interface IRiskMetrics {
  annualized_return: number;
  annualized_volatility: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  beta: number;
  alpha: number;
  var_95: number;
  cvar_95: number;
  max_drawdown: number;
  total_return: number;
}

export interface IDataQuality {
  coverage_pct: number;
  missing_tickers: string[];
  confidence?: string;
  skipped_no_isin?: string[];
  benchmark_name?: string;
}

export interface IGPTInsights {
  status: string;
  timestamp: Date;
  overall_summary: {
    overall_grade: string;
    summary: string;
    key_strength: string;
    key_weakness: string;
    priority_action: string;
  };
  performance: {
    score: number;
    description: string;
    insights: string[];
    actionable_suggestions: string[];
  };
  diversification: {
    score: number;
    description: string;
    insights: string[];
    actionable_suggestions: string[];
  };
  risk: {
    score: number;
    description: string;
    insights: string[];
    actionable_suggestions: string[];
  };
  metadata: {
    portfolio_score: number;
    grade: string;
    risk_category: string;
    model_used: string;
  };
}

export interface IRequestMetadata {
  source: string;
  user_id: string;
  num_holdings: number;
  isin_coverage_pct: number;
  lookback_days: number;
  gpt_analysis_enabled: boolean;
  processing_time_ms: number;
  api_version: string;
}

export interface IPortfolioAnalysis extends Document {
  status: string;
  timestamp: Date;
  portfolio_id: string;

  portfolio_summary: {
    total_market_value: number;
    total_invested_value: number;
    total_unrealized_pnl: number;
    num_holdings: number;
    num_holdings_with_data: number;
    coverage_pct: number;
  };

  scores: IScores;
  risk_metrics: IRiskMetrics;
  diversification_metrics: IDiversificationMetrics;
  sector_analysis: ISectorAnalysis;
  correlation_analysis: ICorrelationAnalysis;
  risk_contributors: IRiskContributor[];
  holdings: IHolding[];
  recommendations: IRecommendation[];

  data_quality: IDataQuality;
  dhan_data_quality: IDataQuality;

  gpt_insights: IGPTInsights;

  request_metadata: IRequestMetadata;
}

/* ================================
   2. MONGOOSE SCHEMAS
================================== */

const RecommendationSchema = new Schema<IRecommendation>({
  id: String,
  category: String,
  severity: String,
  title: String,
  description: String,
  recommendation: String,
  rationale: String,
  actions: [String],
});

const HoldingSchema = new Schema<IHolding>({
  ticker: String,
  isin: String,
  quantity: Number,
  avg_price: Number,
  current_price: Number,
  market_value: Number,
  invested_value: Number,
  unrealized_pnl: Number,
  unrealized_pnl_pct: Number,
  sector: String,
  weight_pct: Number,
});

const RiskContributorSchema = new Schema<IRiskContributor>({
  ticker: String,
  contribution_pct: Number,
  weight_pct: Number,
  individual_volatility_annual: Number,
  market_value: Number,
});

const PortfolioAnalysisSchema = new Schema<IPortfolioAnalysis>(
  {
    status: String,
    timestamp: Date,
    portfolio_id: String,

    portfolio_summary: {
      total_market_value: Number,
      total_invested_value: Number,
      total_unrealized_pnl: Number,
      num_holdings: Number,
      num_holdings_with_data: Number,
      coverage_pct: Number,
    },

    scores: {
      portfolio_score: Number,
      risk_score: Number,
      concentration_score: Number,
      volatility_score: Number,
      beta_score: Number,
      diversification_score: Number,
      grade: String,
      risk_category: String,
    },

    risk_metrics: {
      annualized_return: Number,
      annualized_volatility: Number,
      sharpe_ratio: Number,
      sortino_ratio: Number,
      beta: Number,
      alpha: Number,
      var_95: Number,
      cvar_95: Number,
      max_drawdown: Number,
      total_return: Number,
    },

    diversification_metrics: {
      hhi: Number,
      gini: Number,
      effective_holdings: Number,
      num_holdings: Number,
      top_3_concentration_pct: Number,
      top_5_concentration_pct: Number,
      top_10_concentration_pct: Number,
      largest_holding: {
        ticker: String,
        weight_pct: Number,
        market_value: Number,
      },
    },

    sector_analysis: {
      sectors: Schema.Types.Mixed,
      sector_hhi: Number,
      effective_sectors: Number,
      num_sectors: Number,
    },

    correlation_analysis: {
      avg_correlation: Number,
      max_correlation: Number,
      min_correlation: Number,
      median_correlation: Number,
      max_pair: [String],
      min_pair: [String],
    },

    risk_contributors: [RiskContributorSchema],
    holdings: [HoldingSchema],
    recommendations: [RecommendationSchema],

    data_quality: {
      coverage_pct: Number,
      missing_tickers: [String],
      confidence: String,
      skipped_no_isin: [String],
      benchmark_name: String,
    },

    dhan_data_quality: {
      coverage_pct: Number,
      missing_tickers: [String],
      skipped_no_isin: [String],
      benchmark_name: String,
    },

    gpt_insights: {
      status: String,
      timestamp: Date,
      overall_summary: {
        overall_grade: String,
        summary: String,
        key_strength: String,
        key_weakness: String,
        priority_action: String,
      },
      performance: {
        score: Number,
        description: String,
        insights: [String],
        actionable_suggestions: [String],
      },
      diversification: {
        score: Number,
        description: String,
        insights: [String],
        actionable_suggestions: [String],
      },
      risk: {
        score: Number,
        description: String,
        insights: [String],
        actionable_suggestions: [String],
      },
      metadata: {
        portfolio_score: Number,
        grade: String,
        risk_category: String,
        model_used: String,
      },
    },

    request_metadata: {
      source: String,
      user_id: String,
      num_holdings: Number,
      isin_coverage_pct: Number,
      lookback_days: Number,
      gpt_analysis_enabled: Boolean,
      processing_time_ms: Number,
      api_version: String,
    },
  },
  { timestamps: true }
);

/* ================================
   3. MODEL EXPORT
================================== */
PortfolioAnalysisSchema.index({ portfolio_id: 1 });

export const PortfolioAnalysis = mongoose.model<IPortfolioAnalysis>(
  "PortfolioAnalysis",
  PortfolioAnalysisSchema
);

// Optimize queries by portfolio_id
