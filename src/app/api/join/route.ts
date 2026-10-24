import { admin } from "@/lib/supabase-admin";
import { config } from "@/lib/config";
import {
  HttpError,
  errorResponse,
  hashSecret,
  newSecret,
  nicknameSchema,
  readJson,
} from "@/lib/security";
import { enforceIpLimit } from "@/lib/ratelimit";
import { systemMessage } from "@/lib/system-message";
import { z } from "zod";

const codeSchema = z.string().min(10).max(64).regex(/^[A-Za-z0-9_-]+$/);

async function roomForInvite(code: string) {
  const { data: invite } = await admin()
    .from("invites")
    .select("room_id,revoked_at")
    .eq("code", code)
    .maybeSingle();
  if (!invite || invite.revoked_at) {
    throw new HttpError(404, "Este convite não é válido ou foi revogado.", "invalid_invite");
  }
  const { data: room } = await admin().from("rooms").select("id,name").eq("id", invite.room_id).single();
  if (!room) throw new HttpError(404, "Sala não encontrada.", "invalid_invite");
  return room;
}

// Mostra só o nome da sala (nada de histórico ou participantes) para a tela de entrada.
export async function GET(req: Request) {
  try {
    enforceIpLimit(req, "peek-invite", 60);
    const code = codeSchema.parse(new URL(req.url).searchParams.get("code"));
    const room = await roomForInvite(code);
    return Response.json({ roomName: room.name });
  } catch (e) {
    return errorResponse(e);
  }
}

const body = z.object({ code: codeSchema, nickname: nicknameSchema });

export async function POST(req: Request) {
  try {
    enforceIpLimit(req, "join", 20);
    const input = body.parse(await readJson(req));
    const room = await roomForInvite(input.code);
    const db = admin();

    const { data: people, error } = await db
      .from("participants")
      .select("nickname")
      .eq("room_id", room.id)
      .is("removed_at", null);
    if (error) throw error;
    if ((people?.length ?? 0) >= config.maxParticipants) {
      throw new HttpError(403, "Esta sala está cheia.", "room_full");
    }
    if (people?.some((p) => (p.nickname as string).toLowerCase() === input.nickname.toLowerCase())) {
      throw new HttpError(409, "Já existe alguém com esse apelido na sala. Escolha outro.", "nickname_taken");
    }

    const secret = newSecret();
    const { data: me, error: insErr } = await db
      .from("participants")
      .insert({ room_id: room.id, nickname: input.nickname, secret_hash: hashSecret(secret) })
      .select("id")
      .single();
    if (insErr) throw insErr;

    await systemMessage(room.id, `${input.nickname} entrou na sala.`);

    return Response.json({ roomId: room.id, roomName: room.name, token: `${me.id}.${secret}` });
  } catch (e) {
    return errorResponse(e);
  }
}
