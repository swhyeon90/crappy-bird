import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CrappyBirdInput,
  CrappyBirdResponse,
  getSystemPromptByIntimacy,
} from "../../lib/crappyBird";

const loadLocalEnv = () => {
  if (typeof process === "undefined") return;
  if (process.env.GEMINI_API_KEY || process.env.__CRAPPY_BIRD_ENV_LOADED__) {
    return;
  }

  const envFiles = [".env.local", ".env"];
  for (const fileName of envFiles) {
    const envPath = resolve(process.cwd(), fileName);
    if (!existsSync(envPath)) continue;

    try {
      const contents = readFileSync(envPath, "utf8");
      contents.split(/\r?\n/).forEach((line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith("#")) return;
        const [key, ...valueParts] = trimmedLine.split("=");
        if (!key) return;
        const value = valueParts.join("=").trim();
        if (!value || process.env[key] !== undefined) return;
        process.env[key] = value.replace(/^['"]|['"]$/g, "");
      });
    } catch {
      // ignore file read errors
    }
  }

  process.env.__CRAPPY_BIRD_ENV_LOADED__ = "true";
};

loadLocalEnv();

const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not configured");
}

const genAI = new GoogleGenerativeAI(apiKey);
const MODEL_NAME = "gemini-2.5-flash-lite";
const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)```/i;

function extractJsonPayload(rawText: string): string {
  const trimmed = rawText.trim();
  const blockMatch = trimmed.match(jsonBlockRegex);
  if (blockMatch?.[1]) {
    return blockMatch[1].trim();
  }
  return trimmed;
}

async function generateCrappyBirdResponse(
  payload: CrappyBirdInput
): Promise<CrappyBirdResponse> {
  const { intimacy = 0, last_reflection = "", ...interactionFields } = payload;
  const interaction = { ...interactionFields, last_reflection };
  const systemInstruction = getSystemPromptByIntimacy(intimacy);

  const model = genAI.getGenerativeModel(
    {
      model: MODEL_NAME,
      systemInstruction,
    }
  );

  const chat = model.startChat();
  const result = await chat.sendMessage(JSON.stringify(interaction));
  const rawText =
    typeof result.response?.text === "function" ? result.response.text() : "";
  const jsonText = extractJsonPayload(rawText);

  try {
    return JSON.parse(jsonText) as CrappyBirdResponse;
  } catch {
    throw new SyntaxError(`Gemini returned non-JSON response: ${rawText}`);
  }
}

// TODO: change the route path
export const Route = createFileRoute("/api/gemini")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = (await request.json()) as CrappyBirdInput;
          const data = await generateCrappyBirdResponse(payload);

          return new Response(JSON.stringify(data), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Gemini API handler failed", error);

          const status = error instanceof SyntaxError ? 502 : 500;
          return new Response(
            JSON.stringify({
              error: "Failed to generate response from Crappy Bird.",
            }),
            {
              status,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      },
    },
  },
});
