"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { getNickname, saveRoom, setNickname } from "@/lib/client/storage";

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [roomName, setRoomName] = useState<string | null>(null);
  const [invalid, setInvalid] = useState("");
  const [nick, setNick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setNick(getNickname());
    api<{ roomName: string }>(`/api/join?code=${encodeURIComponent(code)}`)
      .then((r) => setRoomName(r.roomName))
      .catch((e) => setInvalid(e instanceof ApiError ? e.message : "Não foi possível abrir o convite."));
  }, [code]);

  async function join() {
    setError("");
    if (!nick.trim()) return setError("Escolha um apelido.");
    setBusy(true);
    try {
      const r = await api<{ roomId: string; roomName: string; token: string }>("/api/join", {
        body: { code, nickname: nick },
      });
      setNickname(nick.trim());
      saveRoom({ roomId: r.roomId, name: r.roomName, token: r.token, nickname: nick.trim() });
      router.replace(`/chat/${r.roomId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível entrar.");
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <main className="center">
        <div className="card">
          <h2>Convite indisponível</h2>
          <p className="hint">{invalid}</p>
          <a className="btn" href="/" style={{ display: "inline-grid", placeItems: "center", textDecoration: "none", color: "inherit" }}>
            Ir para o início
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="center">
      <div className="card stack">
        <div className="brand" style={{ justifyContent: "center" }}>
          <div className="logo">T</div>
        </div>
        <h2 style={{ margin: 0 }}>{roomName ? `Entrar em “${roomName}”` : "Carregando convite…"}</h2>
        <p className="hint">Escolha um apelido para os outros saberem quem é você.</p>
        <input
          className="field"
          placeholder="Seu apelido"
          maxLength={30}
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && join()}
          autoFocus
        />
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary" onClick={join} disabled={busy || !roomName}>
          {busy ? "Entrando…" : "Entrar na conversa"}
        </button>
      </div>
    </main>
  );
}
