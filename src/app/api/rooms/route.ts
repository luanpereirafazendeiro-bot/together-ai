import { admin } from "@/lib/supabase-admin";
import {
  errorResponse,
  hashSecret,
  newInviteCode,
  newSecret,
  nicknameSchema,
  readJson,
  roomNameSchema,
} from "@/lib/security";
import { enforceIpLimit } from "@/lib/ratelimit";
import { systemMessage } from "@/lib/system-message";
import { z } from "zod";

const body = z.object({
  nickname: nicknameSchema,
  name: roomNameSchema.optional(),
});

// Cria uma sala nova. Quem cria vira "owner" (dono).
export async function POST(req: Request) {
  try {
    enforceIpLimit(req, "create-room", 10);
    const input = body.parse(await readJson(req));
    const db = admin();

    const { data: room, error: roomErr } = await db
      .from("rooms")
      .insert({ name: input.name ?? "Nova conversa" })
      .select("id,name")
      .single();
    if (roomErr) throw roomErr;

    const secret = newSecret();
    const { data: me, error: meErr } = await db
      .from("participants")
      .insert({
        room_id: room.id,
        nickname: input.nickname,
        secret_hash: hashSecret(secret),
        role: "owner",
      })
      .select("id")
      .single();
    if (meErr) throw meErr;

    const inviteCode = newInviteCode();
    const { error: invErr } = await db.from("invites").insert({ room_id: room.id, code: inviteCode });
    if (invErr) throw invErr;

    await systemMessage(room.id, `${input.nickname} criou a sala.`);

    return Response.json({
      roomId: room.id,
      roomName: room.name,
      inviteCode,
      token: `${me.id}.${secret}`,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
