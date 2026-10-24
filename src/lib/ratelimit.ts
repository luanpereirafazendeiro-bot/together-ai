import "server-only";
import { admin } from "./supabase-admin";
import { config } from "./config";
import { HttpError } from "./security";

/** Limite por participante, contado no banco (funciona em várias instâncias serverless). */
export async function enforceMessageRateLimit(participantId: string) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await admin()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("participant_id", participantId)
    .eq("author_type", "human")
    .gte("created_at", since);
  if (error) throw error;
  if ((count ?? 0) >= config.rateLimitPerMinute) {
    throw new HttpError(429, "Calma! Você está enviando mensagens rápido demais.", "rate_limited");
  }
}

// Limite simples em memória para rotas públicas (criar sala / entrar).
const hits = new Map<string, number[]>();
export function enforceIpLimit(req: Request, bucket: string, max: number, windowMs = 60_000) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpError(429, "Muitas tentativas. Aguarde um instante.", "rate_limited");
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
}
