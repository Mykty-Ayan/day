import 'dotenv/config';
import readline from 'node:readline';
import { createAgent } from './agent.js';
import { defaultTools } from './tools.js';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const agent = createAgent({
    apiKey: getRequiredEnv('OPENROUTER_API_KEY'),
    model: 'openrouter/auto',
    instructions: 'You are a helpful assistant with access to tools.',
    tools: defaultTools,
  });

  agent.on('thinking:start', () => console.log('\nThinking...'));
  agent.on('tool:call', (name, args) => console.log(`[tool] ${name}:`, args));
  agent.on('stream:delta', (delta) => process.stdout.write(delta));
  agent.on('stream:end', () => console.log('\n'));
  agent.on('error', (err) => console.error(`[error] ${err.message}`));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('Agent ready. Type a message (Ctrl+C to exit).\n');

  const prompt = (): void => {
    rl.question('You: ', async (input) => {
      if (!input.trim()) {
        prompt();
        return;
      }

      try {
        await agent.send(input);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[fatal] ${message}`);
      }

      prompt();
    });
  };

  prompt();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[fatal] ${message}`);
  process.exitCode = 1;
});
