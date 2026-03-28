// Test script to verify Fireworks API connection
import { config } from "dotenv";
config({ path: ".env" });

import { fireworks } from "../src/agents/client";
import { generateText } from "ai";

async function testFireworks() {
  const apiKey = process.env.FIREWORKS_API_KEY;

  console.log("Testing Fireworks API connection...");
  console.log("API Key present:", apiKey ? "Yes" : "NO - MISSING!");
  console.log("API Key length:", apiKey?.length || 0);

  if (!apiKey) {
    console.error("\nERROR: FIREWORKS_API_KEY is not set!");
    process.exit(1);
  }

  try {
    const result = await generateText({
      model: fireworks("accounts/fireworks/routers/kimi-k2p5-turbo"),
      messages: [{ role: "user", content: "Say 'Fireworks connection working!'" }],
      maxOutputTokens: 50,
    });

    console.log("\n✓ SUCCESS! Response:", result.text);
  } catch (error: any) {
    console.error("\n✗ FAILED!");
    console.error("Error:", error.message);
    console.error("Status:", error.statusCode || "unknown");
    console.error("Full error:", error);
    
    // Log response body if available
    if (error.responseBody) {
      console.error("Response body:", error.responseBody);
    }
    if (error.response) {
      console.error("Response:", error.response);
    }
    if (error.cause) {
      console.error("Cause:", error.cause);
    }

    if (error.message.includes("not a valid model ID")) {
      console.error("\nThis error means your Fire Pass doesn't cover this model ID.");
      console.error("Check: https://app.fireworks.ai/account/billing");
    }
    process.exit(1);
  }
}

testFireworks();
