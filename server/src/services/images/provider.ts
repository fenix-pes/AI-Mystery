import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env.js";

export interface GeneratedImage { data: Buffer; mimeType: string }
export interface ImageProvider { generate(prompt: string): Promise<GeneratedImage> }

class GeminiImageProvider implements ImageProvider {
  private readonly client: GoogleGenAI;
  constructor(apiKey: string) { this.client = new GoogleGenAI({ apiKey, httpOptions: { timeout: env.GENERATION_TIMEOUT_MS } }); }

  async generate(prompt: string): Promise<GeneratedImage> {
    const response = await this.client.models.generateContent({
      model: env.IMAGE_MODEL,
      contents: prompt,
      config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3", imageSize: "1K", personGeneration: "ALLOW_ADULT" } }
    });
    const part = response.candidates?.flatMap(candidate => candidate.content?.parts ?? []).find(candidatePart => candidatePart.inlineData?.data && candidatePart.inlineData.mimeType);
    if (!part?.inlineData?.data || !part.inlineData.mimeType) throw new Error("IMAGE_GENERATION_FAILED");
    return { data: Buffer.from(part.inlineData.data, "base64"), mimeType: part.inlineData.mimeType };
  }
}

export function getImageProvider(): ImageProvider | undefined {
  if (env.IMAGE_PROVIDER === "none") return undefined;
  const key = env.IMAGE_PROVIDER_API_KEY || env.GEMINI_API_KEY;
  return key ? new GeminiImageProvider(key) : undefined;
}
