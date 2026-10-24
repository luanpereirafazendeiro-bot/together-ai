"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, extractInviteCode, ApiError } from "@/lib/client/api";
import { getNickname, listRooms, saveRoom, setNickname, type SavedRoom } from "@/lib/client/storage";

export default function Home() {
  const router = useRouter();
  const [nick, setNick] = useState("");
  const [roomName, setRoomName] = useState("");
  const [link, setLink] = useState("");
  const [recent, setRecent] = useState<SavedRoom[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setNick(getNickname());
    setRecent(listRooms());
  }, []);

  async function create() {
    setError("");
    if (!nick.trim()) return setError("Escolha um apelido primeiro.");
    setBusy(true);
    try {
      const r = await api<{ roomId: string; roomName: string; token: string }>("/api/rooms", {
        body: { nickname: nick, name: roomName.trim() || undefined },
      });
      setNickname(nick.trim());
      saveRoom({ roomId: r.roomId, name: r.roomName, token: r.token, nickname: nick.trim() });
      router.push(`/chat/${r.roomId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível criar a sala.");
      setBusy(false);
    }
  }

  function join() {
    setError("");
    const code = extractInviteCode(link);
    if (!code) return setError("Cole o link de convite completo (ou o código).");
    router.push(`/j/${code}`);
  }

  return (
    <main className="home">
      <div className="brand">
        <div className="logo">T</div>
        <h1>Together AI</h1>
      </div>
      <p className="lead">Uma conversa só, com seus amigos e uma IA, em tempo real.</p>

      <section className="card stack">
        <h2>Nova conversa</h2>
        <input
          className="field"
          placeholder="Seu apelido"
          maxLength={30}
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          autoComplete="nickname"
        />
        <input
          className="field"
          placeholder="Nome da sala (opcional)"
          maxLength={80}
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
        />
        <button className="btn primary" onClick={create} disabled={busy}>
          {busy ? "Criando…" : "Criar conversa"}
        </button>
      </section>

      <section className="card stack">
        <h2>Entrar com um link</h2>
        <div className="row">
          <input
            className="field"
            placeholder="Cole o link de convite"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button className="btn" onClick={join}>Entrar</button>
        </div>
      </section>

      {error && <p className="error-text">{error}</p>}

      {recent.length > 0 && (
        <section className="card">
          <h2>Conversas recentes</h2>
          <div className="recent">
            {recent.map((r) => (
              <a className="item" key={r.roomId} href={`/chat/${r.roomId}`}>
                <span>{r.name}</span>
                <small>como {r.nickname}</small>
              </a>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Estas conversas ficam salvas só neste aparelho/navegador.
          </p>
        </section>
      )}

      <section className="card">
        <h2>Como convidar amigos</h2>
        <ol className="steps">
          <li>Crie a conversa e toque em <b>Convidar</b>.</li>
          <li>Envie o link pelo WhatsApp, Instagram ou onde preferir.</li>
          <li>Seu amigo abre o link, escolhe um apelido e já está na sala.</li>
        </ol>
        <p className="hint" style={{ marginTop: 10 }}>
          Quem tiver o link consegue entrar. Compartilhe só com quem você confia.
        </p>
      </section>
    </main>
  );
}
