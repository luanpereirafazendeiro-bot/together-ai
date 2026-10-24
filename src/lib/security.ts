import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT } from "jose";
import { z } from "zod";
import { config, requireEnv } from "./config";

// ---------- segredos e tokens ----------
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function newInviteCode(): string {
  return randomBytes(16).toString("base64url"); // 128 bits, impossível de adivinhar
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Token do participante: "<participantId>.<segredo>" */
export function parseParticipantToken(
  raw: string | null | undefined,
): { participantId: string; secret: string } | null {
  if (!raw) return null;
  const i = raw.indexOf(".");
  if (i < 1) return null;
  const participantId = raw.slice(0, i);
  const secret = raw.slice(i + 1);
  if (!z.string().uuid().safeParse(participantId).success) return null;
  if (secret.length < 20 || secret.length > 100) return null;
  return { participantId, secret };
}

/** JWT curto para o Realtime: só enxerga a própria sala (via RLS). */
export async function signRealtimeToken(roomId: string, participantId: string) {
  const secret = new TextEncoder().encode(requireEnv("SUPABASE_JWT_SECRET"));
  const expiresInSec = 60 * 60;
  const token = await new SignJWT({
    role: "authenticated",
    room_id: roomId,
    participant_id: participantId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setAudience("authenticated")
    .setSubject(participantId)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSec}s`)
    .sign(secret);
  return { token, expiresInSec };
}

// ---------- validação ----------
export const uuid = z.string().uuid();

export const nicknameSchema = z
  .string()
  .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Escolha um apelido").max(30, "Apelido muito longo (máx. 30)"));

export const roomNameSchema = z
  .string()
  .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1).max(80));

export function messageContentSchema() {
  return z
    .string()
    .transform((s) => s.replace(/\u0000/g, "").trim())
    .pipe(
      z
        .string()
        .min(1, "Mensagem vazia")
        .max(config.messageMaxChars, `Mensagem muito longa (máx. ${config.messageMaxChars})`),
    );
}

// ---------- respostas de erro ----------
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message, code: e.code }, { status: e.status });
  }
  if (e instanceof z.ZodError) {
    return Response.json(
      { error: e.issues[0]?.message ?? "Dados inválidos", code: "invalid" },
      { status: 400 },
    );
  }
  // Nunca devolve detalhes internos (podem conter segredos).
  console.error("[erro]", e instanceof Error ? e.message : e);
  return Response.json({ error: "Erro interno. Tente novamente.", code: "internal" }, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > 20_000) throw new HttpError(413, "Requisição grande demais");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
}
