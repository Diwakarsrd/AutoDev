# 🤖 AutoDev Agent — Autonomous AI Coder for VS Code

> **Intent → Plan → Execute → Done.** No manual coding for boilerplate, debugging, or scaffolding.

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](./LICENSE)
[![Open Source](https://img.shields.io/badge/Open%20Source-100%25-brightgreen)]()

---

## ✨ What It Does

AutoDev Agent is a **multi-agent AI system** built inside VS Code. It replaces 2+ hours of developer work with a single command — no monthly subscription, no cloud lock-in, fully open source.

| Feature | What happens |
|---|---|
| **Fix Entire Project** | Scans all files, detects every bug, fixes everything, shows diff before applying |
| **Generate from Intent** | Type `"Build login system with JWT"` → files created, code written, ready to run |
| **Fix & Explain Selection** | Select broken code → get explanation + working fix side by side |
| **Refactor File** | Choose goals (performance, readability, security) → production-ready code |
| **Generate Tests** | Full test suite written automatically for any file |

---

## 🚀 Quick Start

### 1. Install the extension

**From VS Code Marketplace** (once published):
```
Ctrl+P → ext install autodev.autonomous-dev-agent
```

**From source:**
```bash
git clone https://github.com/yourusername/autonomous-dev-agent
cd autonomous-dev-agent
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

### 2. Configure your LLM provider

Open the Command Palette (`Ctrl+Shift+P`) and run:
```
AutoDev: Configure LLM Provider
```

Pick one of three **free** options:

---

## 🆓 Free LLM Options

### Option A: Ollama (Recommended — 100% local, 100% free)

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh   # Linux/Mac
# Windows: https://ollama.com/download

# 2. Pull a coding model (choose one)
ollama pull codellama:7b          # Best for general coding
ollama pull deepseek-coder:6.7b   # Best for code generation
ollama pull mistral:7b            # Best for explaining/refactoring
ollama pull qwen2.5-coder:7b      # Excellent all-rounder (recommended)

# 3. Start Ollama
ollama serve
```

Then in VS Code settings set:
```json
"autodev.provider": "ollama",
"autodev.ollamaModel": "qwen2.5-coder:7b"
```

### Option B: Google Gemini (Free tier — 1500 requests/day)

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click **Get API Key** → Create key (free)
3. Run `AutoDev: Configure LLM Provider` → Select Gemini → Paste key

```json
"autodev.provider": "gemini",
"autodev.geminiApiKey": "AIza...",
"autodev.geminiModel": "gemini-1.5-flash"
```

### Option C: LM Studio / LocalAI (OpenAI-compatible)

```bash
# Download LM Studio: https://lmstudio.ai
# Load any GGUF model, start local server on port 1234
```

```json
"autodev.provider": "openai-compatible",
"autodev.openaiCompatibleUrl": "http://localhost:1234/v1",
"autodev.openaiCompatibleModel": "local-model"
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+F` / `Cmd+Shift+F` | 🔥 Fix Entire Project |
| `Ctrl+Shift+G` / `Cmd+Shift+G` | ⚡ Generate from Intent |
| `Ctrl+Shift+A` / `Cmd+Shift+A` | 🤖 Open Agent Panel |

---

## 🎮 Usage Examples

### Generate from Intent
Open Command Palette → `AutoDev: Generate from Intent`

```
"Build a REST API with Express, JWT auth, and PostgreSQL"
"Create a React dashboard with charts and dark mode"
"Make a Python CLI tool that converts CSV to JSON"
"Build a Discord bot that answers questions with AI"
```

The Planner Agent shows you exactly what it will create before executing.

### Fix Entire Project

```
Ctrl+Shift+F  →  Confirm  →  Watch it scan every file  →  Review diff  →  Apply All
```

### Fix & Explain Selection

1. Select any code (or nothing for the whole file)
2. Right-click → **AutoDev: Fix & Explain Selection**
3. See: explanation, original, fixed code — in tabs
4. Click **Apply Fix**

### Refactor Current File

1. Open a file
2. Command Palette → **AutoDev: Refactor Current File**
3. Pick goals: Performance, Readability, Security, Clean code, Modern syntax
4. Review changes → Apply

---

## 🏗️ Architecture

```
User Input
    │
    ▼
┌─────────────────────────────────────────────────┐
│  VS Code Extension Layer                        │
│  Commands + Sidebar Panel + Status Bar          │
└─────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────┐
│  Multi-Agent System                             │
│                                                 │
│  🧠 Planner Agent                               │
│     Intent → Structured plan with steps        │
│                                                 │
│  ⚡ Executor Agent                              │
│     Creates files, runs commands, installs pkgs │
│                                                 │
│  🐛 Debugger Agent                              │
│     Finds bugs, fixes code, writes tests        │
│                                                 │
│  ✅ Validator Agent                             │
│     Checks quality (0-100 score) before apply  │
└─────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────┐
│  LLM Provider Layer                             │
│                                                 │
│  Ollama ──── local, free, private               │
│  Gemini ──── free tier (1500 req/day)           │
│  OpenAI-compatible ─── LM Studio, Groq, etc.   │
└─────────────────────────────────────────────────┘
```

---

## ⚙️ Full Configuration Reference

```json
{
  // Provider: "ollama" | "gemini" | "openai-compatible"
  "autodev.provider": "ollama",

  // Ollama settings
  "autodev.ollamaUrl": "http://localhost:11434",
  "autodev.ollamaModel": "qwen2.5-coder:7b",

  // Gemini settings
  "autodev.geminiApiKey": "",
  "autodev.geminiModel": "gemini-1.5-flash",

  // OpenAI-compatible settings
  "autodev.openaiCompatibleUrl": "http://localhost:1234/v1",
  "autodev.openaiCompatibleKey": "local",
  "autodev.openaiCompatibleModel": "local-model",

  // Behaviour
  "autodev.maxFilesPerScan": 50,
  "autodev.showDiffBeforeApply": true,
  "autodev.autoRunTests": false,
  "autodev.excludePatterns": [
    "node_modules", ".git", "dist", "build", "out", ".next", "coverage"
  ]
}
```

---

## 🛠️ Development

```bash
# Clone
git clone https://github.com/yourusername/autonomous-dev-agent
cd autonomous-dev-agent

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-recompile on save)
npm run watch

# Open in VS Code and press F5 to launch Extension Development Host
code .
```

### Build a .vsix package

```bash
npm install -g @vscode/vsce
vsce package
# → autonomous-dev-agent-1.0.0.vsix
```

### Install the .vsix locally

```
VS Code → Extensions → ⋯ → Install from VSIX
```

---

## 📦 Recommended Ollama Models

| Model | Size | Best for |
|---|---|---|
| `qwen2.5-coder:7b` | 4.7GB | All-round code generation ⭐ |
| `deepseek-coder:6.7b` | 3.8GB | Fast code completion |
| `codellama:7b` | 3.8GB | Python / general coding |
| `mistral:7b` | 4.1GB | Explanation & refactoring |
| `phi3:mini` | 2.2GB | Low RAM machines |
| `llama3.2:3b` | 2.0GB | Very fast, basic tasks |

---

## 🔒 Privacy

- **Ollama mode**: All code stays on your machine. Zero data leaves your system.
- **Gemini mode**: Code is sent to Google's API. Review [Google's privacy policy](https://policies.google.com/privacy).
- The extension never stores your code or API keys in any external service.

---

## 🤝 Contributing

PRs welcome! Key areas to improve:

- **More agent types** — Architect Agent, Documentation Agent, Migration Agent
- **Self-healing loop** — wire terminal error output back into Debugger Agent
- **Better diff UI** — inline diff with VS Code's native diff viewer
- **Model benchmarks** — test which models perform best per task type
- **Language-specific prompts** — tuned system prompts per language

See [CONTRIBUTING.md](./CONTRIBUTING.md) to get started.

---

## 📄 License

MIT — free to use, modify, distribute, and sell.

---

## ⭐ Star History

If AutoDev saves you time, a GitHub star helps others find it!

---

*Built with ❤️ for developers who want to feel like they're coding in 2035.*
