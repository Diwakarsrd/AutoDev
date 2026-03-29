import { LLMProvider } from '../providers/llmProvider';
import { AgentPlan, PlanStep, LLMMessage } from '../types';
import { ConversationMemory } from '../utils/conversationMemory';

const PLANNER_SYSTEM_PROMPT = `You are an expert software architect and planner.
Your job is to take a user's development intent and break it into precise, executable steps.

Always respond with ONLY valid JSON. No markdown, no explanation outside the JSON.

Response format:
{
  "intent": "concise restatement of what will be built",
  "techStack": ["list", "of", "technologies"],
  "estimatedTime": "e.g. 2-5 minutes",
  "steps": [
    {
      "stepNumber": 1,
      "action": "create_file | modify_file | delete_file | run_command | install_package",
      "target": "relative file path OR package name OR command",
      "description": "what this step does and why",
      "code": "full file content if creating/modifying (omit for run_command/install_package)",
      "command": "the command to run (only for run_command/install_package)"}
  ]
}

Rules:
- Code in steps must be complete, production-ready, not placeholder
- Include error handling in generated code
- Always add a package install step before using new dependencies
- For TypeScript projects add proper types
- Include basic comments explaining complex logic
- If creating a web app include a proper project structure`;

export class PlannerAgent {
  constructor(private llm: LLMProvider) {}

  async createPlan(
    intent: string,
    workspaceContext: string,
    onProgress?: (msg: string) => void,
    memory?: ConversationMemory
  ): Promise<AgentPlan> {
    onProgress?.('Planner Agent: Analysing intent...');

    const userContent = `User intent: "${intent}"\n\nWorkspace context:\n${workspaceContext}\n\nCreate a detailed execution plan.`;

    const messages: LLMMessage[] = memory?.isEnabled()
      ? memory.buildMessageHistory(userContent, PLANNER_SYSTEM_PROMPT)
      : [
          { role: 'system', content: PLANNER_SYSTEM_PROMPT },
          { role: 'user',   content: userContent },
        ];

    const response = await this.llm.complete(messages, _token => {
      // stream thinking indicator but don't show raw tokens
    });

    if (response.error) {
      throw new Error(`Planner Agent failed: ${response.error}`);
    }

    onProgress?.('Plan created. Parsing steps...');

    try {
      // Strip any markdown code fences if the model added them
      const cleaned = response.content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

      const plan: AgentPlan = JSON.parse(cleaned);

      // Validate structure
      if (!plan.steps || !Array.isArray(plan.steps)) {
        throw new Error('Invalid plan: missing steps array');
      }

      onProgress?.(`Plan ready: ${plan.steps.length} steps, stack: ${plan.techStack?.join(', ')}`);
      return plan;
    } catch (parseErr) {
      // Fallback: create a minimal plan from the raw response
      onProgress?.('[WARN] Plan JSON parse failed. Using fallback plan.');
      return this.buildFallbackPlan(intent, response.content);
    }
  }

  private buildFallbackPlan(intent: string, rawResponse: string): AgentPlan {
    return {
      intent,
      techStack: ['JavaScript'],
      estimatedTime: 'Unknown',
      steps: [
        {
          stepNumber: 1,
          action: 'create_file',
          target: 'output.js',
          description: 'Generated output from intent',
          code: rawResponse,
        } as PlanStep,
      ],
    };
  }

  async explainCode(
    code: string,
    language: string,
    onStream?: (token: string) => void
  ): Promise<string> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a senior developer. Explain code clearly and concisely.
Identify: what it does, how it works, any bugs or issues, improvement suggestions.
Be direct and practical.`,
      },
      {
        role: 'user',
        content: `Explain this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``,
      },
    ];

    const response = await this.llm.complete(messages, onStream);
    if (response.error) throw new Error(response.error);
    return response.content;
  }
}
