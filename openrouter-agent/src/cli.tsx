import 'dotenv/config';
import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import type { StreamableOutputItem } from '@openrouter/sdk';
import { createAgent, type Message } from './agent.js';
import { defaultTools } from './tools.js';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const agent = createAgent({
  apiKey: getRequiredEnv('OPENROUTER_API_KEY'),
  model: 'openrouter/auto',
  instructions: 'You are a helpful assistant. Be concise.',
  tools: defaultTools,
});

function ChatMessage({ message }: { message: Message }): React.JSX.Element {
  const isUser = message.role === 'user';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={isUser ? 'cyan' : 'green'}>
        {isUser ? 'You' : 'Assistant'}
      </Text>
      <Text wrap="wrap">{message.content}</Text>
    </Box>
  );
}

function ItemRenderer({ item }: { item: StreamableOutputItem }): React.JSX.Element | null {
  if (item.type === 'message') {
    const textContent = item.content.find((c) => c.type === 'output_text');
    const text = textContent ? textContent.text : '';

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="green">
          Assistant
        </Text>
        <Text wrap="wrap">{text}</Text>
        {item.status !== 'completed' ? <Text color="gray">...</Text> : null}
      </Box>
    );
  }

  if (item.type === 'function_call') {
    const label = item.status === 'completed' ? '[done]' : '[tool]';
    const suffix = item.status === 'in_progress' ? '...' : '';
    return <Text color="yellow">{`${label} ${item.name}${suffix}`}</Text>;
  }

  if (item.type === 'reasoning') {
    const reasoningText = item.content?.find((c) => c.type === 'reasoning_text');
    const text = reasoningText ? reasoningText.text : '';

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="magenta">
          Reasoning
        </Text>
        <Text wrap="wrap" color="gray">
          {text}
        </Text>
      </Box>
    );
  }

  return null;
}

function InputField({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}): React.JSX.Element {
  useInput((input, key) => {
    if (disabled) {
      return;
    }

    if (key.return) {
      onSubmit();
      return;
    }

    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      onChange(value + input);
    }
  });

  return (
    <Box>
      <Text color="yellow">{'> '}</Text>
      <Text>{value}</Text>
      <Text color="gray">{disabled ? ' ...' : ' _'}</Text>
    </Box>
  );
}

function App(): React.JSX.Element {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<Map<string, StreamableOutputItem>>(new Map());

  useInput((_, key) => {
    if (key.escape) {
      exit();
    }
  });

  useEffect(() => {
    const onThinkingStart = (): void => {
      setIsLoading(true);
      setItems(new Map());
    };

    const onItemUpdate = (item: StreamableOutputItem): void => {
      const key =
        item.id ??
        (item.type === 'function_call' ? item.callId : null) ??
        (item.type === 'function_call_output' ? item.callId : null) ??
        `${item.type}-static`;
      setItems((prev) => new Map(prev).set(key, item));
    };

    const onMessageAssistant = (): void => {
      setMessages(agent.getMessages());
      setItems(new Map());
      setIsLoading(false);
    };

    const onError = (): void => {
      setIsLoading(false);
    };

    agent.on('thinking:start', onThinkingStart);
    agent.on('item:update', onItemUpdate);
    agent.on('message:assistant', onMessageAssistant);
    agent.on('error', onError);

    return () => {
      agent.off('thinking:start', onThinkingStart);
      agent.off('item:update', onItemUpdate);
      agent.off('message:assistant', onMessageAssistant);
      agent.off('error', onError);
    };
  }, []);

  const sendMessage = useCallback(async (): Promise<void> => {
    if (!input.trim() || isLoading) {
      return;
    }

    const text = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    await agent.send(text);
  }, [input, isLoading]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="magenta">
          OpenRouter Agent
        </Text>
        <Text color="gray"> (Esc to exit)</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {messages.map((message, index) => (
          <ChatMessage key={index} message={message} />
        ))}

        {Array.from(items.entries()).map(([id, item]) => (
          <ItemRenderer key={id} item={item} />
        ))}
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <InputField value={input} onChange={setInput} onSubmit={sendMessage} disabled={isLoading} />
      </Box>
    </Box>
  );
}

render(<App />);
