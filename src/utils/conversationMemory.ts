import { LLMMessage } from '../types';

export interface MemoryEntry {
  timestamp: number;
  role: 'user' | 'assistant';
  content: string;
  context?: string; // which file/feature this relates to
}

export interface SessionContext {
  id: string;
  createdAt: number;
  lastActive: number;
  entries: MemoryEntry[];
  filesModified: string[];
  lastIntent?: string;
  lastPlanSummary?: string;
}

export class ConversationMemory {
  private session: SessionContext;
  private maxTurns: number;
  private enabled: boolean;

  constructor(enabled: boolean, maxTurns = 10) {
    this.enabled = enabled;
    this.maxTurns = maxTurns;
    this.session = this.createSession();
  }

  private createSession(): SessionContext {
    return {
      id: Date.now().toString(),
      createdAt: Date.now(),
      lastActive: Date.now(),
      entries: [],
      filesModified: [],
    };
  }

  // Add a user message to memory
  addUserMessage(content: string, context?: string): void {
    if (!this.enabled) return;
    this.session.entries.push({
      timestamp: Date.now(),
      role: 'user',
      content,
      context,
    });
    this.session.lastActive = Date.now();
    this.trim();
  }

  // Add an assistant response to memory
  addAssistantMessage(content: string, context?: string): void {
    if (!this.enabled) return;
    this.session.entries.push({
      timestamp: Date.now(),
      role: 'assistant',
      content,
      context,
    });
    this.session.lastActive = Date.now();
    this.trim();
  }

  // Record that a file was modified in this session
  recordFileModified(filePath: string): void {
    if (!this.enabled) return;
    if (!this.session.filesModified.includes(filePath)) {
      this.session.filesModified.push(filePath);
    }
  }

  // Store summary of last completed intent
  setLastIntent(intent: string, planSummary?: string): void {
    if (!this.enabled) return;
    this.session.lastIntent    = intent;
    this.session.lastPlanSummary = planSummary;
  }

  // Build message history for LLM - includes system memory context
  buildMessageHistory(newUserMessage: string, systemPrompt: string): LLMMessage[] {
    if (!this.enabled || this.session.entries.length === 0) {
      return [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: newUserMessage },
      ];
    }

    const messages: LLMMessage[] = [
      { role: 'system', content: this.buildSystemWithMemory(systemPrompt) },
    ];

    // Add conversation history
    for (const entry of this.session.entries) {
      messages.push({ role: entry.role, content: entry.content });
    }

    // Add the new message
    messages.push({ role: 'user', content: newUserMessage });

    return messages;
  }

  private buildSystemWithMemory(basePrompt: string): string {
    const parts = [basePrompt];

    if (this.session.lastIntent) {
      parts.push(`\nSession context:\nLast completed task: "${this.session.lastIntent}"`);
      if (this.session.lastPlanSummary) {
        parts.push(`Plan summary: ${this.session.lastPlanSummary}`);
      }
    }

    if (this.session.filesModified.length > 0) {
      parts.push(`Files modified this session: ${this.session.filesModified.join(', ')}`);
    }

    parts.push('\nUse this context to understand follow-up requests like "make it faster", "add tests", or "refactor that".');

    return parts.join('\n');
  }

  // Keep only the last N turns
  private trim(): void {
    const maxEntries = this.maxTurns * 2; // each turn = user + assistant
    if (this.session.entries.length > maxEntries) {
      this.session.entries = this.session.entries.slice(-maxEntries);
    }
  }

  // Get a summary of current session for display
  getSummary(): string {
    if (!this.enabled) return 'Memory disabled';
    const turns  = Math.floor(this.session.entries.length / 2);
    const files  = this.session.filesModified.length;
    return `${turns} turn${turns !== 1 ? 's' : ''}, ${files} file${files !== 1 ? 's' : ''} modified`;
  }

  // Clear session (start fresh)
  clearSession(): void {
    this.session = this.createSession();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getFilesModified(): string[] {
    return [...this.session.filesModified];
  }

  getLastIntent(): string | undefined {
    return this.session.lastIntent;
  }
}

// Global singleton - shared across all agents in a session
let _globalMemory: ConversationMemory | null = null;

export function getGlobalMemory(enabled = true, maxTurns = 10): ConversationMemory {
  if (!_globalMemory) {
    _globalMemory = new ConversationMemory(enabled, maxTurns);
  }
  return _globalMemory;
}

export function resetGlobalMemory(enabled = true, maxTurns = 10): ConversationMemory {
  _globalMemory = new ConversationMemory(enabled, maxTurns);
  return _globalMemory;
}
