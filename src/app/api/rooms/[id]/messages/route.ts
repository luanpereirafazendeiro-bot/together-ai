import { after } from "next/server";
import { admin } from "@/lib/supabase-admin";
import { authenticate } from "@/lib/auth";
import { HttpError, errorResponse, messageContentSchema, readJson, uuid } from "@/lib/security";
import { enforceMessageRateLimit } from "@/lib/ratelimit";
import { runAi } from "@/lib/ai-runner";
import { MESSAGE_COLUMNS, type Message } from "@/lib/types";
import { z } from "zod";

export const maxDuration = 60; // tempo máximo para a IA responder (Vercel)

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET ?after=<seq>   -> mensagens novas (recuperação após reconectar)
 * GET ?before=<seq>  -> página mais antiga (carregar histórico)
 * GET                -> as últimas mensagens
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await authenticate(req, id);
    const url = new URL(req.url);
    const afterSeq = url.searchParams.get("after");
    const before = url.searchParams.get("before");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);

    let q = admin().from("messages").select(MESSAGE_COLUMNS).eq("room_id", id);
    if (afterSeq !== null && Number.isFinite(Number(afterSeq))) {
      q = q.gt("seq", Number(afterSeq)).order("seq", { ascending: true }).limit(200);
      const { data, error } = await q;
      if (error) throw error;
      return Response.json({ messages: data ?? [], hasMore: false });
    }
    if (before !== null && Number.isFinite(Number(before))) q = q.lt("seq", Number(before));
    const { data, error } = await q.order("seq", { ascending: false }).limit(limit + 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Message[];
    const hasMore = rows.length > limit;
    return Response.json({ messages: rows.slice(0, limit).reverse(), hasMore });
  } catch (e) {
    return errorResponse(e);
  }
}

const body = z.object({
  content: messageContentSchema(),
  clientId: uuid,
  replyTo: uuid.optional(),
});

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const me = await authenticate(req, id);
    const input = body.parse(await readJson(req));
    await enforceMessageRateLimit(me.id);

    const db = admin();

    if (input.replyTo) {
      const { data: ref } = await db
        .from("messages")
        .select("id")
        .eq("id", input.replyTo)
        .eq("room_id", id)
        .maybeSingle();
      if (!ref) throw new HttpError(400, "A mensagem respondida não existe nesta sala.");
    }

    // Reenvio com o mesmo clientId nunca duplica (índice único no banco).
    const { data: inserted, error } = await db
      .from("messages")
      .insert({
        room_id: id,
        participant_id: me.id,
        author_name: me.nickname,
        author_type: "human",
        content: input.content,
        reply_to: input.replyTo ?? null,
        client_id: input.clientId,
      })
      .select(MESSAGE_COLUMNS)
      .single();

    let message = inserted as unknown as Message | null;
    if (error) {
      if (error.code !== "23505") throw error;
      const { data: existing, error: exErr } = await db
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("room_id", id)
        .eq("client_id", input.clientId)
        .single();
      if (exErr) throw exErr;
      message = existing as unknown as Message;
    }

    // A IA responde depois de devolver a resposta ao usuário (não trava a tela).
    after(async () => {
      try {
        await runAi(id);
      } catch (e) {
        console.error("[ia] runAi falhou:", e instanceof Error ? e.message : e);
      }
    });

    return Response.json({ message });
  } catch (e) {
    return errorResponse(e);
  }
}
