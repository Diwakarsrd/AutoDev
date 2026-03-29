export type LLMProvider = 'ollama' | 'gemini' | 'openai-compatible' | 'anthropic' | 'groq' | 'openai';

export interface AgentConfig {
  provider: LLMProvider;
  // Ollama
  ollamaUrl: string;
  ollamaModel: string;
  // Gemini
  geminiApiKey: string;
  geminiModel: string;
  // OpenAI-compatible (LM Studio, LocalAI, etc.)
  openaiCompatibleUrl: string;
  openaiCompatibleKey: string;
  openaiCompatibleModel: string;
  // Anthropic Claude
  anthropicApiKey: string;
  anthropicModel: string;
  // Groq
  groqApiKey: string;
  groqModel: string;
  // OpenAI
  openaiApiKey: string;
  openaiModel: string;
  // Behaviour
  maxFilesPerScan: number;
  autoRunTests: boolean;
  showDiffBeforeApply: boolean;
  excludePatterns: string[];
  selfHealingEnabled: boolean;
  selfHealingMaxRetries: number;
  conversationMemoryEnabled: boolean;
  conversationMemoryMaxTurns: number;
}

export interface AgentTask {
  id: string;
  type: 'fix' | 'generate' | 'refactor' | 'test' | 'explain';
  description: string;
  filePath?: string;
  code?: string;
  context?: string;
}

export interface AgentResult {
  taskId: string;
  success: boolean;
  output?: string;
  fixedCode?: string;
  explanation?: string;
  filesChanged?: FileChange[];
  error?: string;
  tokensUsed?: number;
}

export interface FileChange {
  filePath: string;
  originalContent: string;
  newContent: string;
  changeType: 'modified' | 'created' | 'deleted';
  summary: string;
}

export interface ProjectScanResult {
  totalFiles: number;
  issuesFound: FileIssue[];
  summary: string;
}

export interface FileIssue {
  filePath: string;
  issues: string[];
  severity: 'error' | 'warning' | 'suggestion';
  fixable: boolean;
}

export interface PlanStep {
  stepNumber: number;
  action: 'create_file' | 'modify_file' | 'delete_file' | 'run_command' | 'install_package';
  target: string;
  description: string;
  code?: string;
  command?: string;
}

export interface AgentPlan {
  intent: string;
  steps: PlanStep[];
  estimatedTime: string;
  techStack: string[];
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed?: number;
  model?: string;
  error?: string;
}

export interface StreamCallback {
  (token: string): void;
}

export interface AgentEvent {
  type: 'thinking' | 'progress' | 'file_change' | 'error' | 'complete' | 'log';
  message: string;
  data?: unknown;
  timestamp: number;
}
