import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { admin } from "./supabase-admin";
import { config } from "./config";
import { MESSAGE_COLUMNS, type Message } from "./types";
import { buildContext, buildSystemPrompt, mentionsAi } from "./ai-context";

const LOCK_MS = 90_000;
const FLUSH_MS = 500;

/** Tenta pegar a trava da sala (só uma resposta de IA por vez). */
async function acquireLock(roomId: string): Promise<boolean> {
  const now = new Date();
  const { data, error } = await admin()
    .from("rooms")
    .update({ ai_lock_until: new Date(now.getTime() + LOCK_MS).toISOString() })
    .eq("id", roomId)
    .lt("ai_lock_until", now.toISOString())
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function releaseLock(roomId: string) {
  await admin().from("rooms").update({ ai_lock_until: new Date(0).toISOString() }).eq("id", roomId);
}

/** Última mensagem humana ainda sem resposta da IA (e que a IA deve responder). */
async function findPending(roomId: string, mode: string): Promise<Message | null> {
  const { data: lastAi } = await admin()
    .from("messages")
    .select("reply_to,seq")
    .eq("room_id", roomId)
    .eq("author_type", "ai")
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  let q = admin()
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("room_id", roomId)
    .eq("author_type", "human")
    .order("seq", { ascending: false })
    .limit(10);
  if (lastAi?.seq) q = q.gt("seq", lastAi.seq);
  const { data } = await q;
  const candidates = (data ?? []) as unknown as Message[];
  if (mode === "mention") return candidates.find((m) => mentionsAi(m.content)) ?? null;
  return candidates[0] ?? null;
}

function friendlyError(e: unknown): string {
  const status = (e as { status?: number })?.status;
  if (!process.env.ANTHROPIC_API_KEY) return "A IA não está configurada (falta a chave da API no servidor).";
  if (status === 401) return "A chave da API da IA é inválida.";
  if (status === 402 || status === 403) return "A conta da IA está sem créditos ou sem permissão.";
  if (status === 429) return "A IA atingiu o limite de uso. Tente de novo em instantes.";
  if (status && status >= 500) return "O serviço de IA está indisponível agora. Tente de novo em instantes.";
  return "A IA não conseguiu responder agora.";
}

async function respondTo(roomId: string, trigger: Message): Promise<void> {
  const db = admin();

  // Reserva a resposta. O índice único em reply_to impede respostas duplicadas.
  const { data: placeholder, error: insErr } = await db
    .from("messages")
    .insert({
      room_id: roomId,
      author_name: "IA",
      author_type: "ai",
      content: "",
      status: "streaming",
      reply_to: trigger.id,
    })
    .select("id")
    .single();
  if (insErr) {
    if (insErr.code === "23505") return; // já existe resposta para esta mensagem
    throw insErr;
  }
  const aiId = placeholder.id as string;

  const finish = (content: string, status: "done" | "error") =>
    db.from("messages").update({ content, status }).eq("id", aiId);

  try {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("sem chave");

    const [{ data: room }, { data: people }, { data: hist }] = await Promise.all([
      db.from("rooms").select("name,ai_persona").eq("id", roomId).single(),
      db.from("participants").select("nickname").eq("room_id", roomId).is("removed_at", null),
      db
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("room_id", roomId)
        .lte("seq", trigger.seq)
        .order("seq", { ascending: false })
        .limit(config.aiContextMessages),
    ]);
    const history = ((hist ?? []) as unknown as Message[]).reverse();
    const turns = buildContext(history, config.aiContextMessages);
    if (turns.length === 0) throw new Error("sem contexto");

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = client.messages.stream({
      model: config.aiModel,
      max_tokens: config.aiMaxOutputTokens,
      system: buildSystemPrompt(
        room?.name ?? "Conversa",
        room?.ai_persona ?? "",
        (people ?? []).map((p) => p.nickname as string),
      ),
      messages: turns,
    });

    let text = "";
    let lastFlush = 0;
    let pending: Promise<unknown> = Promise.resolve();
    stream.on("text", (delta: string) => {
      text += delta;
      const now = Date.now();
      if (now - lastFlush >= FLUSH_MS) {
        lastFlush = now;
        const snapshot = text;
        pending = pending.then(() => db.from("messages").update({ content: snapshot }).eq("id", aiId));
      }
    });
    await stream.finalMessage();
    await pending;
    await finish(text.trim() || "(sem resposta)", "done");
  } catch (e) {
    console.error("[ia] falha:", e instanceof Error ? e.message : e);
    await finish(friendlyError(e), "error");
  }
}

/**
 * Processa mensagens pendentes da sala. Seguro para ser chamado várias vezes
 * ao mesmo tempo: a trava + o índice único garantem uma resposta por mensagem.
 */
export async function runAi(roomId: string): Promise<void> {
  const { data: room } = await admin().from("rooms").select("ai_mode").eq("id", roomId).single();
  if (!room || room.ai_mode === "off") return;

  // Respostas que ficaram "digitando" por mais de 2 min (função interrompida) viram erro.
  await admin()
    .from("messages")
    .update({ status: "error", content: "A resposta foi interrompida. Envie a mensagem de novo." })
    .eq("room_id", roomId)
    .eq("author_type", "ai")
    .eq("status", "streaming")
    .lt("created_at", new Date(Date.now() - 120_000).toISOString());

  for (let round = 0; round < 3; round++) {
    if (!(await acquireLock(roomId))) return; // outra execução já cuida disso
    try {
      for (let i = 0; i < 3; i++) {
        const pending = await findPending(roomId, room.ai_mode);
        if (!pending) break;
        await respondTo(roomId, pending);
      }
    } finally {
      await releaseLock(roomId);
    }
    // Chegou algo entre o último check e a liberação da trava?
    if (!(await findPending(roomId, room.ai_mode))) return;
  }
}
