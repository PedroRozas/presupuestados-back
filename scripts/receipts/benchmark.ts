import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { ReceiptConfigService } from '../../src/receipt-ingestion/receipt.config.js';
import { OpenAiLlmProvider } from '../../src/receipt-ingestion/llm/openai-llm.provider.js';
import { EXTRACTION_PROMPT_V1 } from '../../src/receipt-ingestion/extraction/prompts/extraction-prompt.v1.js';
import { parseExtractionOutput } from '../../src/receipt-ingestion/extraction/extraction-output.schema.js';
import {
  aggregateScores,
  renderMarkdownTable,
  scoreExtraction,
  type GroundTruthReceipt,
  type ModelSummary,
  type ScoredRun,
} from '../../src/receipt-ingestion/extraction/benchmark-metrics.js';
import type { LlmImageInput } from '../../src/receipt-ingestion/llm/llm.interfaces.js';

const BENCHMARK_DIR = 'docs/receipts/benchmark';
const IMAGES_DIR = join(BENCHMARK_DIR, 'images');
const GROUND_TRUTH_FILE = join(BENCHMARK_DIR, 'ground-truth.json');
const RESULTS_FILE = 'docs/receipts/benchmark.md';
const DEFAULT_MIME_TYPE = 'image/jpeg';
const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const USAGE = 'Uso: npm run receipts:benchmark -- <modelo1,modelo2,...>';
const DATE_LENGTH = 10;

const definedEnv = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );

const readModels = (): string[] => {
  const arg = process.argv[2];
  if (!arg) throw new Error(USAGE);
  return arg
    .split(',')
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
};

const configFor = (model?: string): ReceiptConfigService =>
  new ReceiptConfigService(
    new ConfigService(
      model
        ? { ...definedEnv(), RECEIPT_EXTRACTION_MODEL: model }
        : definedEnv(),
    ),
  );

const loadImages = (files: string[]): Promise<LlmImageInput[]> =>
  Promise.all(
    files.map(async (file) => ({
      buffer: await readFile(join(IMAGES_DIR, file)),
      contentType:
        MIME_BY_EXTENSION[extname(file).toLowerCase()] ?? DEFAULT_MIME_TYPE,
    })),
  );

const runReceipt = async (
  provider: OpenAiLlmProvider,
  config: ReceiptConfigService,
  receipt: GroundTruthReceipt,
): Promise<ScoredRun> => {
  const result = await provider.extract({
    images: await loadImages(receipt.images),
    systemPrompt: EXTRACTION_PROMPT_V1.system,
    userPrompt: EXTRACTION_PROMPT_V1.user,
    outputJsonSchema: EXTRACTION_PROMPT_V1.outputJsonSchema,
    schemaName: EXTRACTION_PROMPT_V1.schemaName,
    maxOutputTokens: config.extractionMaxOutputTokens,
    timeoutMs: config.extractionTimeoutMs,
  });
  const score = scoreExtraction(receipt, parseExtractionOutput(result.rawText));
  return {
    ...score,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    latencyMs: result.latencyMs,
  };
};

const runModel = async (
  model: string,
  receipts: GroundTruthReceipt[],
): Promise<ModelSummary> => {
  const config = configFor(model);
  const provider = new OpenAiLlmProvider(config);
  const runs: ScoredRun[] = [];
  for (const receipt of receipts) {
    const run = await runReceipt(provider, config, receipt);
    runs.push(run);
    process.stdout.write(
      `${model} ${receipt.id} total=${run.totalMatch} date=${run.dateMatch} recall=${run.itemAmountRecall.toFixed(2)}\n`,
    );
  }
  return aggregateScores(runs);
};

const main = async (): Promise<void> => {
  const models = readModels();
  const receipts = JSON.parse(
    await readFile(GROUND_TRUTH_FILE, 'utf8'),
  ) as GroundTruthReceipt[];
  const available = new Set(await readdir(IMAGES_DIR));
  const missing = receipts.flatMap((receipt) =>
    receipt.images.filter((image) => !available.has(image)),
  );
  if (missing.length > 0)
    throw new Error(`Faltan imágenes: ${missing.join(', ')}`);

  const results: Record<string, ModelSummary> = {};
  for (const model of models) {
    results[model] = await runModel(model, receipts);
  }
  const table = renderMarkdownTable(results);
  const date = new Date().toISOString().slice(0, DATE_LENGTH);
  await writeFile(
    RESULTS_FILE,
    `# Benchmark de extracción\n\nFecha: ${date}. Prompt ${EXTRACTION_PROMPT_V1.version}. ${receipts.length} boletas.\n\n${table}\n`,
  );
  process.stdout.write(`\n${table}\n\nGuardado en ${RESULTS_FILE}\n`);
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
