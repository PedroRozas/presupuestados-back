import { extractFunctionCalls } from './openai-function-calls.js';

describe('extractFunctionCalls', () => {
  it('devuelve solo los items function_call bien formados', () => {
    const output = [
      { type: 'reasoning', summary: [] },
      {
        type: 'function_call',
        call_id: 'c1',
        name: 'get_month_summary',
        arguments: '{"year":2026}',
      },
      { type: 'function_call', call_id: 'c2', name: 'broken' },
      { type: 'message', content: [] },
    ];
    expect(extractFunctionCalls(output)).toEqual([
      {
        callId: 'c1',
        name: 'get_month_summary',
        argumentsJson: '{"year":2026}',
      },
    ]);
  });

  it('devuelve vacío sin output', () => {
    expect(extractFunctionCalls(undefined)).toEqual([]);
  });
});
