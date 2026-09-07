import type { ExtractionOutput } from './extraction-output.schema.js';

export interface GroundTruthReceipt {
  id: string;
  images: string[];
  receipt_date: string | null;
  total: number | null;
  item_amounts: number[];
}

export interface ReceiptScore {
  totalMatch: boolean;
  dateMatch: boolean;
  itemAmountRecall: number;
}

export interface ScoredRun extends ReceiptScore {
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  failed: boolean;
}

export interface ModelSummary {
  receipts: number;
  totalAccuracy: number;
  dateAccuracy: number;
  itemAmountRecall: number;
  avgTokensIn: number;
  avgTokensOut: number;
  avgLatencyMs: number;
  failures: number;
}

const PERCENT = 100;
const PERCENT_DECIMALS = 1;

const countMatches = (expected: number[], actual: number[]): number => {
  const pool = new Map<number, number>();
  for (const amount of actual) pool.set(amount, (pool.get(amount) ?? 0) + 1);
  let matched = 0;
  for (const amount of expected) {
    const remaining = pool.get(amount) ?? 0;
    if (remaining > 0) {
      pool.set(amount, remaining - 1);
      matched += 1;
    }
  }
  return matched;
};

const recall = (expected: number[], actual: number[]): number =>
  expected.length === 0 ? 1 : countMatches(expected, actual) / expected.length;

export const scoreExtraction = (
  expected: GroundTruthReceipt,
  actual: ExtractionOutput,
): ReceiptScore => ({
  totalMatch: expected.total === actual.total,
  dateMatch: expected.receipt_date === actual.receipt_date,
  itemAmountRecall: recall(
    expected.item_amounts,
    actual.items.map((item) => item.amount),
  ),
});

const average = (values: number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

export const aggregateScores = (runs: ScoredRun[]): ModelSummary => ({
  receipts: runs.length,
  totalAccuracy: average(runs.map((run) => (run.totalMatch ? 1 : 0))),
  dateAccuracy: average(runs.map((run) => (run.dateMatch ? 1 : 0))),
  itemAmountRecall: average(runs.map((run) => run.itemAmountRecall)),
  avgTokensIn: average(runs.map((run) => run.tokensIn)),
  avgTokensOut: average(runs.map((run) => run.tokensOut)),
  avgLatencyMs: average(runs.map((run) => run.latencyMs)),
  failures: runs.filter((run) => run.failed).length,
});

const percent = (ratio: number): string =>
  `${(ratio * PERCENT).toFixed(PERCENT_DECIMALS)}%`;

export const renderMarkdownTable = (
  results: Record<string, ModelSummary>,
): string => {
  const header =
    '| Modelo | Boletas | Total exacto | Fecha exacta | Recall montos | Tokens in/out | Latencia ms | Fallos |\n| --- | --- | --- | --- | --- | --- | --- | --- |';
  const rows = Object.entries(results).map(
    ([model, s]) =>
      `| ${model} | ${s.receipts} | ${percent(s.totalAccuracy)} | ${percent(s.dateAccuracy)} | ${percent(s.itemAmountRecall)} | ${Math.round(s.avgTokensIn)}/${Math.round(s.avgTokensOut)} | ${Math.round(s.avgLatencyMs)} | ${s.failures} |`,
  );
  return [header, ...rows].join('\n');
};
