import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';

/** One non-streaming Messages API call. Injected so tests can script the model's replies. */
export type LlmCall = (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage>;
export const ASSISTANT_LLM = Symbol('ASSISTANT_LLM');

/** Real Claude client, or null when no API key is configured (the assistant then answers 503). */
export function createLlm(): LlmCall | null {
  if (!env().ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 });
  return (params) => client.beta.messages.create(params);
}
