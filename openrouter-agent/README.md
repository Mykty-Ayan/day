# OpenRouter Agent

Minimal modular TypeScript agent built from OpenRouter's `create-agent` guide.

## Setup

```bash
npm install
cp .env.example .env
```

Set `OPENROUTER_API_KEY` in `.env`.

## Run

Headless interactive loop:

```bash
npm run start:headless
```

Ink TUI:

```bash
npm start
```

## Scripts

- `npm start` runs the Ink TUI
- `npm run start:headless` runs the CLI loop without Ink
- `npm run dev` watches and reruns the Ink TUI
- `npm run typecheck` runs TypeScript checks
