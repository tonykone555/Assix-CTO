import { Groq } from "groq-sdk";
import { SYSTEM_PROMPT, SUMMARY_PROMPT } from "./prompts";
import { WorkflowSchema } from "./schema";

export interface OrchestratorConfig {
  apiKey: string;
  model?: string;
}

export class AIOrchestrator {
  private client: Groq;
  private model: string;

  constructor(config: OrchestratorConfig) {
    this.client = new Groq({
      apiKey: config.apiKey,
    });
    this.model = config.model || "llama-3.3-70b-versatile";
  }

  async translateIntent(intent: string) {
    const response = await this.client.chat.completions.create({
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: intent,
        },
      ],
      model: this.model,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from Groq");
    }

    try {
      const parsed = JSON.parse(content);
      // If the LLM wraps the array in an object (common with json_object mode), extract it
      const actions = Array.isArray(parsed) ? parsed : parsed.actions || Object.values(parsed)[0];
      
      const validated = WorkflowSchema.parse(actions);
      return validated;
    } catch (error) {
      console.error("Failed to parse or validate LLM response:", content);
      throw error;
    }
  }

  async generateSummary(intent: string, results: any[]) {
    const response = await this.client.chat.completions.create({
      messages: [
        {
          role: "system",
          content: SUMMARY_PROMPT,
        },
        {
          role: "user",
          content: `User Intent: ${intent}\n\nExecution Results:\n${JSON.stringify(results, null, 2)}`,
        },
      ],
      model: this.model,
    });

    return response.choices[0]?.message?.content || "No summary generated.";
  }
}
