import type { Message } from "../types";

export type LocalState = "sending" | "failed";
export type ChatMessage = Message & { local?: LocalState };

/** Ordem consistente: pelo seq do banco; mensagens ainda não confirmadas ficam no fim. */
export function sortMessages(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort((a, b) => {
    const as = a.local ? Number.MAX_SAFE_INTEGER : a.seq;
    const bs = b.local ? Number.MAX_SAFE_INTEGER : b.seq;
    if (as !== bs) return as - bs;
    return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  });
}

/**
 * Junta mensagens novas sem duplicar:
 * - mesmo id => atualiza (ex.: IA escrevendo);
 * - mesmo client_id de uma mensagem local => a versão confirmada substitui a local.
 */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  const byClient = new Map(current.filter((m) => m.client_id).map((m) => [m.client_id as string, m]));

  for (const m of incoming) {
    if (m.client_id) {
      const local = byClient.get(m.client_id);
      if (local && local.id !== m.id) byId.delete(local.id);
      byClient.set(m.client_id, m);
    }
    const prev = byId.get(m.id);
    // Nunca deixa uma versão mais antiga sobrescrever uma mais nova da mesma mensagem.
    if (prev && !prev.local && prev.status === "done" && m.status === "streaming") continue;
    byId.set(m.id, { ...m, local: undefined });
  }
  return sortMessages([...byId.values()]);
}

export function removeMessage(current: ChatMessage[], id: string): ChatMessage[] {
  return current.filter((m) => m.id !== id);
}

export function maxSeq(list: ChatMessage[]): number {
  let max = 0;
  for (const m of list) if (!m.local && m.seq > max) max = m.seq;
  return max;
}
