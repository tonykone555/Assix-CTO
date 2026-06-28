import { AIOrchestrator } from "./src";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const orchestrator = new AIOrchestrator({
    apiKey: process.env.GROQ_API_KEY || "mock-key",
  });

  console.log("Testing AI Orchestrator...");
  
  const actions = await orchestrator.translateIntent("Find a 2 bedroom apartment in Paris on Airbnb under 200 euros");
  console.log(JSON.stringify(actions, null, 2));

  console.log("Translation logic is ready.");
}

main().catch(console.error);
