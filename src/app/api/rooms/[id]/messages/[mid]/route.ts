import { admin } from "@/lib/supabase-admin";
import { authenticate } from "@/lib/auth";
import { HttpError, errorResponse, uuid } from "@/lib/security";

type Ctx = { params: Promise<{ id: string; mid: string }> };

// Apagar uma mensagem: quem escreveu ou o dono da sala.
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id, mid } = await params;
    const me = await authenticate(req, id);
    if (!uuid.safeParse(mid).success) throw new HttpError(404, "Mensagem não encontrada");

    const db = admin();
    const { data: msg } = await db
      .from("messages")
      .select("id,participant_id,author_type")
      .eq("id", mid)
      .eq("room_id", id)
      .maybeSingle();
    if (!msg) throw new HttpError(404, "Mensagem não encontrada");
    if (msg.author_type === "system") throw new HttpError(403, "Avisos do sistema não podem ser apagados");

    const isAuthor = msg.participant_id === me.id;
    if (!isAuthor && me.role !== "owner") throw new HttpError(403, "Sem permissão para apagar esta mensagem");

    const { error } = await db.from("messages").delete().eq("id", mid).eq("room_id", id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
