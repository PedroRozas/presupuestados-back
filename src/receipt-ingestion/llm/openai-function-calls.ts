import type { LlmToolCall } from './llm.interfaces.js';

const FUNCTION_CALL_TYPE = 'function_call';

interface OpenAiFunctionCallItem {
  type: typeof FUNCTION_CALL_TYPE;
  call_id: string;
  name: string;
  arguments: string;
}

const isFunctionCallItem = (item: unknown): item is OpenAiFunctionCallItem => {
  if (typeof item !== 'object' || item === null) return false;
  const candidate = item as Record<string, unknown>;
  return (
    candidate['type'] === FUNCTION_CALL_TYPE &&
    typeof candidate['call_id'] === 'string' &&
    typeof candidate['name'] === 'string' &&
    typeof candidate['arguments'] === 'string'
  );
};

export const extractFunctionCalls = (
  output: unknown[] | undefined,
): LlmToolCall[] =>
  (output ?? []).filter(isFunctionCallItem).map((item) => ({
    callId: item.call_id,
    name: item.name,
    argumentsJson: item.arguments,
  }));
