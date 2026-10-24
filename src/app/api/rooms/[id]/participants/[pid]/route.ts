import { admin } from "@/lib/supabase-admin";
import { authenticate } from "@/lib/auth";
import { HttpError, errorResponse, uuid } from "@/lib/security";
import { systemMessage } from "@/lib/system-message";

type Ctx = { params: Promise<{ id: string; pid: string }> };

// Sair da sala (a si mesmo) ou remover alguém (dono). O histórico permanece.
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id, pid } = await params;
    const me = await authenticate(req, id);
    if (!uuid.safeParse(pid).success) throw new HttpError(404, "Participante não encontrado");

    const self = pid === me.id;
    if (!self && me.role !== "owner") throw new HttpError(403, "Só o dono pode remover participantes");

    const db = admin();
    const { data: target } = await db
      .from("participants")
      .select("id,nickname,role,removed_at")
      .eq("id", pid)
      .eq("room_id", id)
      .maybeSingle();
    if (!target || target.removed_at) throw new HttpError(404, "Participante não encontrado");
    if (target.role === "owner" && !self) throw new HttpError(403, "O dono não pode ser removido");

    const { error } = await db
      .from("participants")
      .update({ removed_at: new Date().toISOString() })
      .eq("id", pid)
      .eq("room_id", id);
    if (error) throw error;

    await systemMessage(
      id,
      self ? `${target.nickname} saiu da sala.` : `${target.nickname} foi removido(a) por ${me.nickname}.`,
    );
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
