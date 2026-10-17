import {
  AI_USAGE_EXAMPLES,
  buildCustomerAiUsageActions,
  getUsageBillingDefinition,
} from "../src/config/pricing.ts";

function actionNames(actions: string[]) {
  return actions.join(" | ");
}

function totalCost(actions: ReturnType<typeof buildCustomerAiUsageActions>) {
  return Number(actions.reduce((sum, action) => sum + getUsageBillingDefinition(action).priceUsd, 0).toFixed(6));
}

const scenarios = [
  {
    label: "text input, text output",
    input: { sendsTextReply: true },
    expected: ["customer_ai_text_reply"],
  },
  {
    label: "image input, text output",
    input: { hasIncomingImage: true, sendsTextReply: true },
    expected: ["customer_ai_image_understanding", "customer_ai_text_reply"],
  },
  {
    label: "voice input, text output",
    input: { hasIncomingAudio: true, sendsTextReply: true },
    expected: ["customer_ai_audio_understanding", "customer_ai_text_reply"],
  },
  {
    label: "text input, voice output",
    input: { sendsVoiceReply: true },
    expected: ["customer_ai_text_reply", "customer_ai_voice_reply"],
  },
  {
    label: "voice input, voice output",
    input: { hasIncomingAudio: true, sendsVoiceReply: true },
    expected: ["customer_ai_audio_understanding", "customer_ai_text_reply", "customer_ai_voice_reply"],
  },
  {
    label: "image input, voice output",
    input: { hasIncomingImage: true, sendsVoiceReply: true },
    expected: ["customer_ai_image_understanding", "customer_ai_text_reply", "customer_ai_voice_reply"],
  },
  {
    label: "failed AI reply",
    input: {},
    expected: [],
  },
];

const expectedExampleTotals: Record<string, string> = {
  "Text to text": "$0.003",
  "Image to text": "$0.010",
  "Voice to text": "$0.013",
  "Text to voice": "from $0.023",
  "Voice to voice": "from $0.033",
  "Image to voice": "from $0.030",
};

for (const scenario of scenarios) {
  const actual = buildCustomerAiUsageActions(scenario.input);
  const expected = scenario.expected.join("|");
  const received = actual.join("|");
  if (expected !== received) {
    throw new Error(`Scenario failed: ${scenario.label}\nExpected: ${actionNames(scenario.expected)}\nReceived: ${actionNames(actual)}`);
  }
  console.log(`${scenario.label}: ${actionNames(actual) || "no charge"} ($${totalCost(actual).toFixed(3)})`);
}

if (AI_USAGE_EXAMPLES.some((example) => example.label === "Dashboard helper chat")) {
  throw new Error("Helper chat example should not be visible in pricing examples.");
}

for (const example of AI_USAGE_EXAMPLES) {
  const expectedTotal = expectedExampleTotals[example.label];
  if (!expectedTotal) {
    throw new Error(`Unexpected visible pricing example: ${example.label}`);
  }
  if (example.total !== expectedTotal) {
    throw new Error(`Incorrect total for ${example.label}. Expected ${expectedTotal}, received ${example.total}`);
  }
}

console.log("usage billing scenario verification passed");
