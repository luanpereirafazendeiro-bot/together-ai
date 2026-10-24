// Configurações lidas de variáveis de ambiente (só no servidor).
function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export const config = {
  aiModel: process.env.AI_MODEL || "claude-haiku-5-5",
  aiContextMessages: int("AI_CONTEXT_MESSAGES", 40),
  aiMaxOutputTokens: int("AI_MAX_OUTPUT_TOKENS", 800),
  messageMaxChars: int("MESSAGE_MAX_CHARS", 2000),
  rateLimitPerMinute: int("RATE_LIMIT_MESSAGES_PER_MINUTE", 12),
  maxParticipants: int("MAX_PARTICIPANTS_PER_ROOM", 10),
};

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}
