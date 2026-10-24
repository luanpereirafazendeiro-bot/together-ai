import { describe, expect, it } from "vitest";
import {
  hashSecret,
  messageContentSchema,
  newInviteCode,
  newSecret,
  nicknameSchema,
  parseParticipantToken,
  safeEqualHex,
} from "../src/lib/security";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("tokens e segredos", () => {
  it("hash é determinístico e diferente para segredos diferentes", () => {
    expect(hashSecret("abc")).toBe(hashSecret("abc"));
    expect(hashSecret("abc")).not.toBe(hashSecret("abd"));
  });

  it("compara hashes com segurança", () => {
    const h = hashSecret("x");
    expect(safeEqualHex(h, h)).toBe(true);
    expect(safeEqualHex(h, hashSecret("y"))).toBe(false);
    expect(safeEqualHex(h, "abcd")).toBe(false);
  });

  it("gera segredos e convites longos e únicos", () => {
    expect(newSecret().length).toBeGreaterThanOrEqual(40);
    expect(newInviteCode()).not.toBe(newInviteCode());
    expect(newInviteCode()).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });

  it("aceita token válido e rejeita inválidos", () => {
    const secret = newSecret();
    expect(parseParticipantToken(`${UUID}.${secret}`)).toEqual({ participantId: UUID, secret });
    expect(parseParticipantToken(null)).toBeNull();
    expect(parseParticipantToken("semponto")).toBeNull();
    expect(parseParticipantToken(`nao-uuid.${secret}`)).toBeNull();
    expect(parseParticipantToken(`${UUID}.curto`)).toBeNull();
  });
});

describe("validação", () => {
  it("normaliza apelido", () => {
    expect(nicknameSchema.parse("  Luiz   Silva \n")).toBe("Luiz Silva");
  });
  it("rejeita apelido vazio ou longo demais", () => {
    expect(nicknameSchema.safeParse("   ").success).toBe(false);
    expect(nicknameSchema.safeParse("a".repeat(31)).success).toBe(false);
  });
  it("valida tamanho da mensagem", () => {
    const s = messageContentSchema();
    expect(s.safeParse("oi").success).toBe(true);
    expect(s.safeParse("   ").success).toBe(false);
    expect(s.safeParse("a".repeat(5000)).success).toBe(false);
  });
});
