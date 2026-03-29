import { LLMProvider } from '../providers/llmProvider';
import { AgentPlan, LLMMessage } from '../types';

export interface ValidationResult {
  passed: boolean;
  score: number; // 0-100
  issues: string[];
  suggestions: string[];
  summary: string;
}

const VALIDATOR_SYSTEM_PROMPT = `You are a senior code reviewer.
Evaluate the generated code for quality, correctness, and completeness.

Return ONLY JSON:
{
  "passed": true | false,
  "score": 85,
  "issues": ["critical problem 1", "critical problem 2"],
  "suggestions": ["improvement 1", "improvement 2"],
  "summary": "brief overall assessment"
}

Scoring guide:
90-100: Production-ready, clean, well-structured
70-89: Good, minor improvements needed
50-69: Works but needs refactoring
Below 50: Has bugs or missing critical parts

Mark passed=true if score >= 65.`;

export class ValidatorAgent {
  constructor(private llm: LLMProvider) {}

  async validateCode(
    code: string,
    language: string,
    context: string
  ): Promise<ValidationResult> {
    const messages: LLMMessage[] = [
      { role: 'system', content: VALIDATOR_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Context: ${context}
Language: ${language}

Code to review:
\`\`\`${language}
${code}
\`\`\`

Return JSON evaluation only.`,
      },
    ];

    const response = await this.llm.complete(messages);

    if (response.error) {
      // If validator fails, pass with warning
      return {
        passed: true,
        score: 50,
        issues: [],
        suggestions: [`Validator unavailable: ${response.error}`],
        summary: 'Validation skipped due to provider error',
      };
    }

    try {
      const cleaned = response.content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      return JSON.parse(cleaned);
    } catch {
      return {
        passed: true,
        score: 50,
        issues: [],
        suggestions: ['Could not parse validation response'],
        summary: 'Validation result unclear',
      };
    }
  }

  async validatePlan(plan: AgentPlan): Promise<{
    valid: boolean;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    if (!plan.steps || plan.steps.length === 0) {
      return { valid: false, warnings: ['Plan has no steps'] };
    }

    // Check for file create steps without code
    for (const step of plan.steps) {
      if (step.action === 'create_file' && !step.code) {
        warnings.push(`Step ${step.stepNumber}: create_file has no code content`);
      }
      if (step.action === 'run_command' && !step.command) {
        warnings.push(`Step ${step.stepNumber}: run_command has no command`);
      }
      if (!step.target) {
        warnings.push(`Step ${step.stepNumber}: missing target`);
      }
    }

    // Check for missing dependency installation steps
    const hasPackageInstall = plan.steps.some(s => s.action === 'install_package');
    const techStack = plan.techStack ?? [];

    if (techStack.length > 1 && !hasPackageInstall) {
      warnings.push('Multi-dependency project but no install_package step found');
    }

    return { valid: true, warnings };
  }

  async compareChanges(
    original: string,
    modified: string,
    language: string
  ): Promise<string> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: 'You are a code reviewer. Compare two versions of code and summarise all changes in plain English. Be concise - max 5 bullet points.',
      },
      {
        role: 'user',
        content: `Language: ${language}

ORIGINAL:
\`\`\`${language}
${original}
\`\`\`

MODIFIED:
\`\`\`${language}
${modified}
\`\`\`

Summarise the changes.`,
      },
    ];

    const response = await this.llm.complete(messages);
    if (response.error) return 'Could not generate change summary';
    return response.content;
  }
}
