import { describe, expect, it } from "vitest";
import { maxSeq, mergeMessages, removeMessage, sortMessages, type ChatMessage } from "../src/lib/client/messages";

function m(p: Partial<ChatMessage> & { id: string; seq: number }): ChatMessage {
  return {
    room_id: "r",
    participant_id: "p",
    author_name: "Luiz",
    author_type: "human",
    content: "x",
    status: "done",
    reply_to: null,
    client_id: null,
    created_at: new Date(2026, 0, 1, 0, 0, p.seq).toISOString(),
    ...p,
  };
}

describe("mergeMessages", () => {
  it("não duplica a mesma mensagem (evento repetido)", () => {
    const a = m({ id: "a", seq: 1 });
    expect(mergeMessages([a], [a, a])).toHaveLength(1);
  });

  it("ordena pelo seq mesmo se chegarem fora de ordem", () => {
    const out = mergeMessages([], [m({ id: "c", seq: 3 }), m({ id: "a", seq: 1 }), m({ id: "b", seq: 2 })]);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("duas mensagens simultâneas são preservadas", () => {
    const out = mergeMessages([m({ id: "a", seq: 5, author_name: "Luiz" })], [m({ id: "b", seq: 6, author_name: "Ana" })]);
    expect(out).toHaveLength(2);
  });

  it("a versão confirmada substitui a otimista (mesmo client_id)", () => {
    const local: ChatMessage = { ...m({ id: "local-1", seq: 0, client_id: "c1" }), local: "sending" };
    const server = m({ id: "real", seq: 9, client_id: "c1" });
    const out = mergeMessages([local], [server]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("real");
    expect(out[0].local).toBeUndefined();
  });

  it("mensagens locais ficam no fim", () => {
    const local: ChatMessage = { ...m({ id: "local-1", seq: 0, client_id: "c1" }), local: "sending" };
    const out = sortMessages([local, m({ id: "a", seq: 100 })]);
    expect(out[1].id).toBe("local-1");
  });

  it("atualiza a resposta da IA enquanto ela escreve", () => {
    const part = m({ id: "ai", seq: 2, author_type: "ai", status: "streaming", content: "Ol" });
    const more = { ...part, content: "Olá!", status: "done" as const };
    const out = mergeMessages([part], [more]);
    expect(out[0].content).toBe("Olá!");
  });

  it("evento antigo 'streaming' não desfaz uma resposta já concluída", () => {
    const done = m({ id: "ai", seq: 2, author_type: "ai", status: "done", content: "Olá!" });
    const stale = { ...done, status: "streaming" as const, content: "Ol" };
    expect(mergeMessages([done], [stale])[0].content).toBe("Olá!");
  });
});

describe("utilitários", () => {
  it("remove mensagem apagada", () => {
    expect(removeMessage([m({ id: "a", seq: 1 }), m({ id: "b", seq: 2 })], "a").map((x) => x.id)).toEqual(["b"]);
  });
  it("maxSeq ignora mensagens locais", () => {
    const local: ChatMessage = { ...m({ id: "l", seq: 0 }), local: "failed" };
    expect(maxSeq([m({ id: "a", seq: 7 }), local])).toBe(7);
  });
});
