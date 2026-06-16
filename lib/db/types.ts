export interface MarketRow {
  id: string;
  polymarket_event_id: string;
  slug: string;
  title: string;
  movie_title: string;
  resolution_rules: string;
  end_date: string | null;
  weekend_type: string;
  created_at: string;
}

export interface BracketRow {
  id: string;
  market_id: string;
  polymarket_market_id: string;
  label: string;
  lo_millions: number | null;
  hi_millions: number | null;
  clob_token_ids: string;
}

export interface PriceSnapshotRow {
  id: string;
  bracket_id: string;
  best_bid: number;
  best_ask: number;
  mid: number;
  volume24hr: number;
  liquidity: number;
  snapped_at: string;
}

export interface RunRow {
  id: string;
  market_id: string;
  features_json: Record<string, unknown>;
  started_at: string;
  cost_usd?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface AgentOutputRow {
  id: string;
  run_id: string;
  agent: string;
  model: string;
  phase: "independent" | "consensus";
  bracket_probs: Record<string, number>;
  confidence: string;
  evidence: string[];
  raw_response: string;
  created_at: string;
}

export interface RecommendationRow {
  id: string;
  run_id: string;
  bracket_id: string;
  side: "buy_yes" | "buy_no";
  exec_price: number;
  ensemble_prob: number;
  edge_pts: number;
  gate_results: Record<string, unknown>;
  gate_passed?: boolean;
  status: "open" | "won" | "lost";
  created_at: string;
}

export interface ResolutionRow {
  id: string;
  market_id: string;
  final_gross_millions: number;
  winning_bracket_id: string | null;
  resolved_at: string;
  source: string;
}

export interface ScoreRow {
  id: string;
  run_id: string;
  agent: string;
  model: string;
  brier: number;
  market_brier: number;
  created_at: string;
}
