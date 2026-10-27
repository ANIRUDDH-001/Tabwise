// Meta Model API prices. Source: https://dev.meta.ai/docs/pricing-rate-limits, read 2026-10-27.
// Amounts are integer nano-USD per token, so sums stay exact.
export const PRICES_SOURCE = { url: 'https://dev.meta.ai/docs/pricing-rate-limits', read: '2026-10-27' };

const NANO_PER_USD = 1e9;
const perToken = (usdPerMillion) => Math.round(usdPerMillion * 1000); // $/1M tokens → nano-USD/token

const STANDARD = { mode: 'standard', input: perToken(1.25), cached: perToken(0.15), output: perToken(4.25) };
const CONTRIBUTOR = { mode: 'contributor', input: perToken(0.10), cached: perToken(0.002), output: perToken(0.20) };

export const PRICES = {
  'muse-spark-1.3': STANDARD,
  'muse-spark-1.2': STANDARD,
  'muse-spark-1.3-contributor': CONTRIBUTOR,
  'muse-spark-1.2-contributor': CONTRIBUTOR,
};

// The pricing page lists no separate image-input price for Spark. INFERENCE: images are billed as
// input tokens; reserve this many per image and compare with the first real usage (PLAN F-01).
export const IMAGE_TOKEN_BOUND = 5000;

export function priceOf(model) {
  return Object.hasOwn(PRICES, model) ? PRICES[model] : null;
}

export function worstCaseNano({ model, inputTokens, maxOutputTokens, images = 0 }) {
  const p = priceOf(model);
  return (inputTokens + images * IMAGE_TOKEN_BOUND) * p.input + maxOutputTokens * p.output;
}

export function settledNano(model, usage) {
  const p = priceOf(model);
  const cached = usage.cached_tokens ?? 0;
  return (usage.input_tokens - cached) * p.input + cached * p.cached + usage.output_tokens * p.output;
}

export const toUsd = (nano) => nano / NANO_PER_USD;
export const toNano = (usd) => Math.round(usd * NANO_PER_USD);
export const worstCaseUsd = (req) => toUsd(worstCaseNano(req));
export const settledUsd = (model, usage) => toUsd(settledNano(model, usage));
