import { admin } from "@/lib/supabase-admin";
import { authenticate, requireOwner } from "@/lib/auth";
import { errorResponse } from "@/lib/security";
import { systemMessage } from "@/lib/system-message";

type Ctx = { params: Promise<{ id: string }> };

// Dono: apaga todo o histórico da sala (a sala e os participantes continuam).
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const me = await authenticate(req, id);
    requireOwner(me);
    const { error } = await admin().from("messages").delete().eq("room_id", id);
    if (error) throw error;
    await systemMessage(id, `${me.nickname} limpou a conversa.`);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
