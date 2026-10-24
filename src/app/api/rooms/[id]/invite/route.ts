import { admin } from "@/lib/supabase-admin";
import { authenticate, requireOwner } from "@/lib/auth";
import { errorResponse, newInviteCode } from "@/lib/security";
import { systemMessage } from "@/lib/system-message";

type Ctx = { params: Promise<{ id: string }> };

// Qualquer participante vê o convite ativo (para copiar o link).
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await authenticate(req, id);
    const { data } = await admin()
      .from("invites")
      .select("code")
      .eq("room_id", id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return Response.json({ code: data?.code ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}

// Dono: revoga os convites antigos e cria um novo link.
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const me = await authenticate(req, id);
    requireOwner(me);
    const db = admin();
    await db.from("invites").update({ revoked_at: new Date().toISOString() }).eq("room_id", id).is("revoked_at", null);
    const code = newInviteCode();
    const { error } = await db.from("invites").insert({ room_id: id, code });
    if (error) throw error;
    await systemMessage(id, `${me.nickname} gerou um novo link de convite. O anterior deixou de funcionar.`);
    return Response.json({ code });
  } catch (e) {
    return errorResponse(e);
  }
}

// Dono: revoga todos os convites (ninguém novo consegue entrar).
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const me = await authenticate(req, id);
    requireOwner(me);
    await admin().from("invites").update({ revoked_at: new Date().toISOString() }).eq("room_id", id).is("revoked_at", null);
    await systemMessage(id, `${me.nickname} desativou o link de convite.`);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
