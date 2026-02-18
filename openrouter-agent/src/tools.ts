import { tool } from '@openrouter/sdk';
import { z } from 'zod';

export const timeTool = tool({
  name: 'get_current_time',
  description: 'Get the current date and time',
  inputSchema: z.object({
    timezone: z.string().optional().describe('Timezone (for example: UTC, America/New_York)'),
  }),
  execute: async ({ timezone }) => {
    const resolvedTz = timezone || 'UTC';

    return {
      time: new Date().toLocaleString('en-US', { timeZone: resolvedTz }),
      timezone: resolvedTz,
    };
  },
});

export const calculatorTool = tool({
  name: 'calculate',
  description: 'Perform mathematical calculations',
  inputSchema: z.object({
    expression: z.string().describe('Math expression (for example: 2 + 2, (10 / 2) + 5)'),
  }),
  execute: async ({ expression }) => {
    const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');

    if (!sanitized.trim()) {
      throw new Error('Expression has no valid math tokens.');
    }

    const result = Function(`"use strict"; return (${sanitized});`)();
    return { expression, result };
  },
});

export const defaultTools = [timeTool, calculatorTool];
