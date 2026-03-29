# Contributing to AutoDev Agent

Thank you for helping make AutoDev better! Here's how to get started.

## Setup

```bash
git clone https://github.com/yourusername/autonomous-dev-agent
cd autonomous-dev-agent
npm install
npm run compile
```

Press **F5** in VS Code to open the Extension Development Host.

## Project Structure

```
src/
├── extension.ts          # Entry point — registers all commands
├── types/index.ts        # Shared TypeScript types
├── providers/
│   └── llmProvider.ts    # Ollama / Gemini / OpenAI-compatible abstraction
├── agents/
│   ├── plannerAgent.ts   # Intent → structured execution plan
│   ├── executorAgent.ts  # Runs plan steps (file create, run command, etc.)
│   ├── debuggerAgent.ts  # Fix bugs, refactor, generate tests
│   └── validatorAgent.ts # Quality check before applying changes
├── commands/
│   ├── fixProject.ts     # "Fix Entire Project" command
│   ├── generateFromIntent.ts  # "Generate from Intent" command
│   └── codeCommands.ts   # Fix selection, refactor, tests
├── panels/
│   └── agentPanel.ts     # Sidebar webview + full panel
└── utils/
    ├── fileUtils.ts      # Workspace scanning, language detection
    ├── terminalUtils.ts  # Terminal command execution
    └── eventBus.ts       # Agent → UI event communication
```

## Adding a New Agent

1. Create `src/agents/myAgent.ts`
2. Accept `LLMProvider` in constructor
3. Write a clear `SYSTEM_PROMPT` constant at top of file
4. Return structured data (JSON-parsed) or plain text
5. Register a command in `extension.ts`
6. Add button in `agentPanel.ts` sidebar HTML

## Adding a New LLM Provider

Edit `src/providers/llmProvider.ts`:
1. Add new value to `LLMProvider` type in `types/index.ts`
2. Add config fields to `AgentConfig`
3. Add a `callMyProvider()` method following the same pattern as `callOllama()`
4. Add a `case` in the `complete()` switch
5. Add settings in `package.json` `contributes.configuration`

## Pull Request Checklist

- [ ] TypeScript compiles with no errors (`npm run compile`)
- [ ] ESLint passes (`npm run lint`)
- [ ] Tested in Extension Development Host (F5)
- [ ] New feature added to README
- [ ] CHANGELOG updated

## Commit Style

```
feat: add Architecture Agent for system design
fix: handle Ollama timeout on large files
docs: add LM Studio setup instructions
refactor: simplify LLMProvider streaming logic
```
