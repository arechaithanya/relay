const { GoogleGenerativeAI } = require("@google/generative-ai");
const { geminiApiKey, geminiModel } = require("../../common/config");

let model;

function getModel() {
  if (!geminiApiKey) return null;
  if (!model) {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    model = genAI.getGenerativeModel({ model: geminiModel });
  }
  return model;
}

function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  return JSON.parse(body.slice(start, end + 1));
}

async function enrichIncidentWithGemini(event, ruleDecision) {
  const activeModel = getModel();
  if (!activeModel) {
    return {
      provider: "RULE_ENGINE",
      enabled: false,
      confidence: 1,
      recommendedActions: []
    };
  }

  const prompt = `
You are CrisisSync AI, an emergency response triage assistant for hotels.
Analyze the event and return only compact JSON with:
severity: integer 1-5,
summary: one sentence for an operations dashboard,
recommendedActions: array of 2-4 short commands,
confidence: number from 0 to 1.

Do not change the incident type. Respect explicit severity if provided.

Event:
${JSON.stringify(event)}

Baseline rule decision:
${JSON.stringify(ruleDecision)}
`;

  try {
    const result = await activeModel.generateContent(prompt);
    const ai = parseJson(result.response.text());
    return {
      provider: "GEMINI",
      model: geminiModel,
      enabled: true,
      severity: Number.isFinite(Number(ai.severity)) ? Number(ai.severity) : undefined,
      summary: typeof ai.summary === "string" ? ai.summary : undefined,
      recommendedActions: Array.isArray(ai.recommendedActions) ? ai.recommendedActions.slice(0, 4) : [],
      confidence: Number.isFinite(Number(ai.confidence)) ? Number(ai.confidence) : undefined
    };
  } catch (error) {
    console.warn("Gemini enrichment failed; falling back to rule engine", error.message);
    return {
      provider: "RULE_ENGINE_FALLBACK",
      enabled: true,
      error: error.message,
      confidence: 0,
      recommendedActions: []
    };
  }
}

module.exports = {
  enrichIncidentWithGemini
};
