import { admin } from "@/lib/supabase-admin";
import { authenticate, requireOwner } from "@/lib/auth";
import { errorResponse, readJson, roomNameSchema } from "@/lib/security";
import { systemMessage } from "@/lib/system-message";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const me = await authenticate(req, id);
    const db = admin();
    const [{ data: room }, { data: participants }] = await Promise.all([
      db.from("rooms").select("id,name,created_at,ai_mode,ai_persona").eq("id", id).single(),
      db
        .from("participants")
        .select("id,room_id,nickname,role,joined_at,removed_at")
        .eq("room_id", id)
        .is("removed_at", null)
        .order("joined_at"),
    ]);
    return Response.json({ room, participants: participants ?? [], me });
  } catch (e) {
    return errorResponse(e);
  }
}

const patch = z.object({
  name: roomNameSchema.optional(),
  ai_mode: z.enum(["always", "mention", "off"]).optional(),
  ai_persona: z.string().max(500).optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const me = await authenticate(req, id);
    const input = patch.parse(await readJson(req));
    if (input.ai_mode !== undefined || input.ai_persona !== undefined) requireOwner(me);

    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.ai_mode !== undefined) update.ai_mode = input.ai_mode;
    if (input.ai_persona !== undefined) update.ai_persona = input.ai_persona.trim();
    if (Object.keys(update).length === 0) return Response.json({ ok: true });

    const { error } = await admin().from("rooms").update(update).eq("id", id);
    if (error) throw error;
    if (input.name !== undefined) await systemMessage(id, `${me.nickname} renomeou a sala para "${input.name}".`);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

// Apaga a sala inteira e todos os dados dela (só o dono).
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const me = await authenticate(req, id);
    requireOwner(me);
    const { error } = await admin().from("rooms").delete().eq("id", id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
