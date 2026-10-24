import { describe, expect, it } from "vitest";
import { buildContext, buildSystemPrompt, mentionsAi } from "../src/lib/ai-context";
import type { Message } from "../src/lib/types";

let n = 0;
function msg(p: Partial<Message>): Message {
  n++;
  return {
    seq: n,
    id: `id-${n}`,
    room_id: "r",
    participant_id: null,
    author_name: "Luiz",
    author_type: "human",
    content: "oi",
    status: "done",
    reply_to: null,
    client_id: null,
    created_at: new Date(2026, 0, 1, 0, 0, n).toISOString(),
    ...p,
  };
}

describe("buildContext", () => {
  it("junta mensagens humanas seguidas e identifica o autor", () => {
    const t = buildContext(
      [msg({ author_name: "Luiz", content: "Oi, IA!" }), msg({ author_name: "Ana", content: "Qual filme?" })],
      40,
    );
    expect(t).toHaveLength(1);
    expect(t[0].role).toBe("user");
    expect(t[0].content).toContain("Luiz: Oi, IA!");
    expect(t[0].content).toContain("Ana: Qual filme?");
  });

  it("alterna usuário e assistente e começa com usuário", () => {
    const t = buildContext(
      [
        msg({ author_type: "ai", author_name: "IA", content: "resposta antiga" }),
        msg({ content: "pergunta" }),
        msg({ author_type: "ai", author_name: "IA", content: "resposta" }),
        msg({ content: "outra" }),
      ],
      40,
    );
    expect(t[0].role).toBe("user");
    expect(t.map((x) => x.role)).toEqual(["user", "assistant", "user"]);
  });

  it("ignora avisos do sistema, mensagens vazias e respostas ainda em andamento", () => {
    const t = buildContext(
      [
        msg({ author_type: "system", author_name: "Sistema", content: "Ana entrou" }),
        msg({ content: "olá" }),
        msg({ author_type: "ai", author_name: "IA", content: "parcial", status: "streaming" }),
        msg({ author_type: "ai", author_name: "IA", content: "", status: "done" }),
      ],
      40,
    );
    expect(t).toHaveLength(1);
    expect(t[0].content).not.toContain("entrou");
    expect(t[0].content).not.toContain("parcial");
  });

  it("respeita o limite de mensagens", () => {
    const list = Array.from({ length: 10 }, (_, i) => msg({ content: `m${i}` }));
    const t = buildContext(list, 3);
    expect(t[0].content).toContain("m7");
    expect(t[0].content).not.toContain("m6");
  });

  it("inclui a mensagem respondida", () => {
    const a = msg({ author_name: "Ana", content: "Vamos ao cinema?" });
    const b = msg({ author_name: "Luiz", content: "Eu topo", reply_to: a.id });
    const t = buildContext([a, b], 40);
    expect(t[0].content).toContain("respondendo a Ana");
  });
});

describe("outros", () => {
  it("detecta menção à IA", () => {
    expect(mentionsAi("Oi IA, tudo bem?")).toBe(true);
    expect(mentionsAi("@claude me ajuda")).toBe(true);
    expect(mentionsAi("vamos ao mercado")).toBe(false);
  });
  it("prompt de sistema lista participantes e persona", () => {
    const s = buildSystemPrompt("Sala X", "seja breve", ["Luiz", "Ana"]);
    expect(s).toContain("Luiz, Ana");
    expect(s).toContain("seja breve");
  });
});
