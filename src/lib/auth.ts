import "server-only";
import { admin } from "./supabase-admin";
import { HttpError, hashSecret, parseParticipantToken, safeEqualHex, uuid } from "./security";
import type { Participant } from "./types";

export interface AuthedParticipant extends Participant {
  room_id: string;
}

/**
 * Identifica quem está chamando a API pelo cabeçalho x-participant-token e
 * confirma que essa pessoa pertence à sala pedida e não foi removida.
 * O apelido enviado pelo navegador NUNCA é usado para identidade.
 */
export async function authenticate(req: Request, roomId: string): Promise<AuthedParticipant> {
  if (!uuid.safeParse(roomId).success) throw new HttpError(404, "Sala não encontrada");
  const parsed = parseParticipantToken(req.headers.get("x-participant-token"));
  if (!parsed) throw new HttpError(401, "Você precisa entrar na sala pelo link de convite", "no_token");

  const { data, error } = await admin()
    .from("participants")
    .select("id,room_id,nickname,role,joined_at,removed_at,secret_hash")
    .eq("id", parsed.participantId)
    .eq("room_id", roomId)
    .maybeSingle();

  if (error) throw error;
  // Mesma resposta para "não existe" e "segredo errado": não revela nada.
  if (!data || !safeEqualHex(data.secret_hash, hashSecret(parsed.secret))) {
    throw new HttpError(403, "Sem permissão para esta sala", "forbidden");
  }
  if (data.removed_at) throw new HttpError(403, "Você foi removido desta sala", "removed");

  const { secret_hash: _omit, ...participant } = data;
  void _omit;
  return participant as AuthedParticipant;
}

export function requireOwner(p: AuthedParticipant) {
  if (p.role !== "owner") throw new HttpError(403, "Só quem criou a sala pode fazer isso", "owner_only");
}
