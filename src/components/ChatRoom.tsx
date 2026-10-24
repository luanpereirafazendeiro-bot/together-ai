"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { forgetRoom, touchRoom, type SavedRoom } from "@/lib/client/storage";
import { useRoom } from "@/lib/client/use-room";
import type { ChatMessage } from "@/lib/client/messages";
import { Markdown } from "./Markdown";

const MAX_CHARS = 2000;

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ChatRoom({ roomId, saved }: { roomId: string; saved: SavedRoom }) {
  const router = useRouter();
  const token = saved.token;
  const r = useRoom(roomId, token);
  const { messages, info, online, connection, loading, fatal, aiBusy } = r;

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<null | "invite" | "rename" | "settings" | "people">(null);
  const [notice, setNotice] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);
  const lastCount = useRef(0);

  // Altura real da tela (teclado virtual aberto no celular)
  useEffect(() => {
    const vv = window.visualViewport;
    const apply = () => document.documentElement.style.setProperty("--app-h", `${vv ? vv.height : window.innerHeight}px`);
    apply();
    vv?.addEventListener("resize", apply);
    window.addEventListener("resize", apply);
    return () => {
      vv?.removeEventListener("resize", apply);
      window.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--app-h");
    };
  }, []);

  useEffect(() => {
    if (info?.room.name) touchRoom(roomId, { name: info.room.name });
  }, [info?.room.name, roomId]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setUnseen(false);
  }, []);

  // Rola para o fim só se a pessoa já estava no fim (não atrapalha quem lê o histórico)
  useLayoutEffect(() => {
    const grew = messages.length > lastCount.current;
    const last = messages[messages.length - 1];
    lastCount.current = messages.length;
    if (atBottomRef.current || last?.local === "sending") scrollToBottom();
    else if (grew) setUnseen(true);
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!loading) scrollToBottom();
  }, [loading, scrollToBottom]);

  function onScroll() {
    const el = feedRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = near;
    setAtBottom(near);
    if (near) setUnseen(false);
  }

  async function submit() {
    const content = text.trim();
    if (!content) return;
    if (content.length > MAX_CHARS) return setNotice(`Mensagem muito longa (máx. ${MAX_CHARS}).`);
    const reply = replyTo?.id.startsWith("local-") ? undefined : replyTo?.id;
    setText("");
    setReplyTo(null);
    atBottomRef.current = true;
    taRef.current?.focus();
    try {
      await r.send(content, reply);
    } catch (e) {
      if (e instanceof ApiError) setNotice(e.message);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra linha. (No celular, o botão envia.)
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }, [text]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  async function deleteMessage(m: ChatMessage) {
    if (!confirm("Apagar esta mensagem para todos?")) return;
    try {
      await api(`/api/rooms/${roomId}/messages/${m.id}`, { method: "DELETE", token });
      await r.resync();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Não foi possível apagar.");
    }
  }

  async function leave() {
    if (!info) return;
    if (!confirm("Sair desta conversa? Você precisará de um novo convite para voltar.")) return;
    try {
      await api(`/api/rooms/${roomId}/participants/${info.me.id}`, { method: "DELETE", token });
    } catch {
      /* mesmo se falhar, esquece localmente */
    }
    forgetRoom(roomId);
    router.push("/");
  }

  if (fatal) {
    return (
      <main className="center">
        <div className="card">
          <h2>{fatal.kind === "removed" ? "Você foi removido" : "Sem acesso a esta sala"}</h2>
          <p className="hint">{fatal.message}</p>
          <button
            className="btn"
            onClick={() => {
              forgetRoom(roomId);
              router.push("/");
            }}
          >
            Ir para o início
          </button>
        </div>
      </main>
    );
  }

  const me = info?.me;
  const isOwner = me?.role === "owner";
  const byId = new Map(messages.map((m) => [m.id, m]));
  const peopleList = info?.participants ?? [];

  return (
    <div className="chat">
      <header className="chat-head">
        <button className="btn ghost icon" aria-label="Início" onClick={() => router.push("/")}>←</button>
        <div className="chat-title">
          <h1>{info?.room.name ?? saved.name}</h1>
          <div className="people" onClick={() => setDialog("people")} role="button" tabIndex={0}>
            {peopleList.slice(0, 4).map((p) => (
              <span key={p.id} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <span className={"dot" + (online.has(p.id) ? " on" : "")} />
                {p.nickname}
              </span>
            ))}
            {peopleList.length > 4 && <span>+{peopleList.length - 4}</span>}
          </div>
        </div>
        <button className="btn" onClick={() => setDialog("invite")}>Convidar</button>
        <button className="btn ghost icon" aria-label="Menu" onClick={() => setMenu((v) => !v)}>⋯</button>
        {menu && (
          <div className="menu" onMouseLeave={() => setMenu(false)}>
            <button onClick={() => { setMenu(false); setDialog("rename"); }}>Renomear sala</button>
            <button onClick={() => { setMenu(false); setDialog("people"); }}>Participantes</button>
            <button onClick={() => { setMenu(false); setDialog("settings"); }}>Configurações da sala</button>
            <hr />
            <button className="danger" onClick={() => { setMenu(false); void leave(); }}>Sair da conversa</button>
          </div>
        )}
      </header>

      {connection !== "online" && !loading && (
        <div className="banner">Reconectando… suas mensagens continuam salvas.</div>
      )}
      {notice && <div className="banner err">{notice}</div>}

      <div className="feed" ref={feedRef} onScroll={onScroll}>
        {loading && <p className="hint" style={{ textAlign: "center" }}>Carregando mensagens…</p>}
        {r.hasMore && (
          <button className="btn ghost older" onClick={() => void r.loadOlder()}>Carregar mensagens anteriores</button>
        )}
        {messages.map((m) => {
          const mine = m.participant_id === me?.id && m.author_type === "human";
          const cls =
            "msg " +
            (m.author_type === "system" ? "system" : m.author_type === "ai" ? "ai" : mine ? "mine" : "") +
            (m.status === "error" ? " err" : "");
          const ref = m.reply_to ? byId.get(m.reply_to) : undefined;
          const canDelete =
            m.author_type !== "system" && !m.local && (isOwner || (mine && m.author_type === "human"));
          if (m.author_type === "system") {
            return (
              <div key={m.id} className={cls}>
                <div className="bubble">{m.content}</div>
              </div>
            );
          }
          return (
            <div key={m.id} className={cls}>
              <div className="meta">
                <b>{m.author_type === "ai" ? "IA" : m.author_name}</b>
                <span>{timeLabel(m.created_at)}</span>
                {m.local === "sending" && <span className="status">enviando…</span>}
                {m.local === "failed" && <span className="status failed">não enviada</span>}
              </div>
              <div className="bubble">
                {ref && m.author_type === "human" && (
                  <div className="quote">↪ {ref.author_name}: {ref.content}</div>
                )}
                {m.author_type === "ai" && m.status === "streaming" && !m.content ? (
                  <span className="typing" aria-label="A IA está pensando"><i /><i /><i /></span>
                ) : (
                  <Markdown text={m.content} />
                )}
                {m.author_type === "ai" && m.status === "streaming" && m.content && (
                  <span className="typing"><i /><i /><i /></span>
                )}
              </div>
              <div className="msg-actions">
                {m.local === "failed" ? (
                  <>
                    <button className="link-btn" onClick={() => r.retry(m)}>Tentar de novo</button>
                    <button className="link-btn" onClick={() => r.discard(m)}>Descartar</button>
                  </>
                ) : (
                  !m.local && (
                    <>
                      <button className="link-btn" onClick={() => { setReplyTo(m); taRef.current?.focus(); }}>Responder</button>
                      <button className="link-btn" onClick={() => void navigator.clipboard?.writeText(m.content)}>Copiar</button>
                      {canDelete && <button className="link-btn" onClick={() => void deleteMessage(m)}>Apagar</button>}
                    </>
                  )
                )}
              </div>
            </div>
          );
        })}
        {!loading && messages.length === 0 && (
          <p className="hint" style={{ textAlign: "center" }}>Nenhuma mensagem ainda. Diga oi para a IA!</p>
        )}
        {(unseen || !atBottom) && (
          <button className="jump" onClick={() => scrollToBottom(true)}>
            {unseen ? "Novas mensagens ↓" : "Ir para o fim ↓"}
          </button>
        )}
      </div>

      <div className="composer">
        {replyTo && (
          <div className="reply-bar">
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Respondendo a {replyTo.author_name}: {replyTo.content}
            </span>
            <button className="link-btn" onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}
        <div className="composer-row">
          <textarea
            ref={taRef}
            rows={1}
            value={text}
            placeholder={aiBusy ? "A IA está respondendo… você já pode escrever" : "Escreva uma mensagem"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_CHARS + 200}
            enterKeyHint="send"
            aria-label="Mensagem"
          />
          <button className="send" onClick={() => void submit()} disabled={!text.trim() || !me} aria-label="Enviar">↑</button>
        </div>
        {text.length > MAX_CHARS - 200 && (
          <div className="counter" style={text.length > MAX_CHARS ? { color: "var(--danger)" } : undefined}>
            {text.length}/{MAX_CHARS}
          </div>
        )}
      </div>

      {dialog === "invite" && <InviteDialog roomId={roomId} token={token} roomName={info?.room.name ?? ""} isOwner={!!isOwner} onClose={() => setDialog(null)} />}
      {dialog === "rename" && (
        <RenameDialog
          current={info?.room.name ?? ""}
          onClose={() => setDialog(null)}
          onSave={async (name) => {
            await api(`/api/rooms/${roomId}`, { method: "PATCH", token, body: { name } });
            await r.reloadInfo();
            setDialog(null);
          }}
        />
      )}
      {dialog === "people" && (
        <PeopleDialog
          participants={peopleList}
          online={online}
          meId={me?.id}
          isOwner={!!isOwner}
          onClose={() => setDialog(null)}
          onKick={async (pid) => {
            if (!confirm("Remover esta pessoa da sala?")) return;
            try {
              await api(`/api/rooms/${roomId}/participants/${pid}`, { method: "DELETE", token });
              await r.reloadInfo();
            } catch (e) {
              setNotice(e instanceof ApiError ? e.message : "Não foi possível remover.");
            }
          }}
        />
      )}
      {dialog === "settings" && info && (
        <SettingsDialog
          roomId={roomId}
          token={token}
          isOwner={!!isOwner}
          aiMode={info.room.ai_mode}
          persona={info.room.ai_persona}
          onChanged={() => void r.reloadInfo()}
          onCleared={() => void r.resync()}
          onDeleted={() => {
            forgetRoom(roomId);
            router.push("/");
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/* ---------------- Diálogos ---------------- */

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}

function InviteDialog({ roomId, token, roomName, isOwner, onClose }: { roomId: string; token: string; roomName: string; isOwner: boolean; onClose: () => void }) {
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ code: string | null }>(`/api/rooms/${roomId}/invite`, { token })
      .then((d) => setCode(d.code))
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Erro ao carregar convite."));
  }, [roomId, token]);

  const url = code ? `${window.location.origin}/j/${code}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr("Não consegui copiar. Segure o link para copiar manualmente.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Together AI", text: `Entre na conversa “${roomName}”`, url });
    } catch {
      /* cancelado */
    }
  }

  async function regenerate() {
    if (!confirm("Gerar um novo link? O link atual deixará de funcionar.")) return;
    try {
      const d = await api<{ code: string }>(`/api/rooms/${roomId}/invite`, { method: "POST", token, body: {} });
      setCode(d.code);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Erro.");
    }
  }

  async function revoke() {
    if (!confirm("Desativar o link? Ninguém novo conseguirá entrar.")) return;
    try {
      await api(`/api/rooms/${roomId}/invite`, { method: "DELETE", token });
      setCode(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Erro.");
    }
  }

  return (
    <Overlay onClose={onClose}>
      <h2>Convidar pessoas</h2>
      {code === undefined && !err && <p className="hint">Carregando…</p>}
      {code === null && <p className="hint">O convite está desativado.{isOwner ? " Gere um novo link abaixo." : ""}</p>}
      {code && (
        <div className="stack">
          <input className="field" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <div className="row">
            <button className="btn primary" style={{ flex: 1 }} onClick={copy}>{copied ? "Copiado!" : "Copiar link"}</button>
            {typeof navigator !== "undefined" && "share" in navigator && <button className="btn" onClick={share}>Compartilhar</button>}
          </div>
          <p className="hint">Quem tiver este link poderá entrar na conversa. Envie só para quem você confia.</p>
        </div>
      )}
      {err && <p className="error-text">{err}</p>}
      <div className="actions">
        {isOwner && code && <button className="btn danger" onClick={revoke}>Desativar</button>}
        {isOwner && <button className="btn" onClick={regenerate}>Gerar novo link</button>}
        <button className="btn" onClick={onClose}>Fechar</button>
      </div>
    </Overlay>
  );
}

function RenameDialog({ current, onClose, onSave }: { current: string; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave(name.trim());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Erro ao renomear.");
      setBusy(false);
    }
  }
  return (
    <Overlay onClose={onClose}>
      <h2>Renomear sala</h2>
      <input className="field" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} autoFocus />
      {err && <p className="error-text">{err}</p>}
      <div className="actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={save} disabled={busy || !name.trim()}>Salvar</button>
      </div>
    </Overlay>
  );
}

function PeopleDialog({ participants, online, meId, isOwner, onClose, onKick }: { participants: { id: string; nickname: string; role: string }[]; online: Set<string>; meId?: string; isOwner: boolean; onClose: () => void; onKick: (pid: string) => void }) {
  return (
    <Overlay onClose={onClose}>
      <h2>Participantes</h2>
      {participants.map((p) => (
        <div className="member" key={p.id}>
          <span className={"dot" + (online.has(p.id) ? " on" : "")} />
          <span className="name">{p.nickname}{p.id === meId ? " (você)" : ""}{p.role === "owner" ? " · dono" : ""}</span>
          {isOwner && p.role !== "owner" && <button className="btn danger" onClick={() => onKick(p.id)}>Remover</button>}
        </div>
      ))}
      <div className="actions"><button className="btn" onClick={onClose}>Fechar</button></div>
    </Overlay>
  );
}

function SettingsDialog({ roomId, token, isOwner, aiMode, persona, onChanged, onCleared, onDeleted, onClose }: { roomId: string; token: string; isOwner: boolean; aiMode: string; persona: string; onChanged: () => void; onCleared: () => void; onDeleted: () => void; onClose: () => void }) {
  const [mode, setMode] = useState(aiMode);
  const [style, setStyle] = useState(persona);
  const [msg, setMsg] = useState("");

  async function save() {
    try {
      await api(`/api/rooms/${roomId}`, { method: "PATCH", token, body: { ai_mode: mode, ai_persona: style } });
      onChanged();
      setMsg("Salvo!");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Erro ao salvar.");
    }
  }
  async function clear() {
    if (!confirm("Apagar TODAS as mensagens da sala? Isso não pode ser desfeito.")) return;
    try {
      await api(`/api/rooms/${roomId}/clear`, { method: "POST", token, body: {} });
      onCleared();
      setMsg("Conversa limpa.");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Erro.");
    }
  }
  async function del() {
    if (!confirm("Excluir a sala e todos os dados dela para sempre?")) return;
    try {
      await api(`/api/rooms/${roomId}`, { method: "DELETE", token });
      onDeleted();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Erro.");
    }
  }

  return (
    <Overlay onClose={onClose}>
      <h2>Configurações da sala</h2>
      {!isOwner && <p className="hint">Só o dono da sala pode alterar estas opções.</p>}
      <div className="stack">
        <label className="hint">Quando a IA responde</label>
        <select className="field" value={mode} onChange={(e) => setMode(e.target.value)} disabled={!isOwner}>
          <option value="always">A todas as mensagens</option>
          <option value="mention">Só quando chamada (“IA”, “@claude”…)</option>
          <option value="off">Desligada</option>
        </select>
        <label className="hint">Estilo da IA (opcional)</label>
        <textarea className="field" style={{ padding: 12, minHeight: 80 }} maxLength={500} value={style} onChange={(e) => setStyle(e.target.value)} disabled={!isOwner} placeholder="Ex.: responda sempre de forma curta e bem-humorada" />
        {isOwner && <button className="btn primary" onClick={save}>Salvar</button>}
      </div>
      {isOwner && (
        <div className="stack" style={{ marginTop: 18 }}>
          <button className="btn danger" onClick={clear}>Limpar conversa</button>
          <button className="btn danger" onClick={del}>Excluir sala e dados</button>
        </div>
      )}
      {msg && <p className="hint" style={{ marginTop: 10 }}>{msg}</p>}
      <div className="actions"><button className="btn" onClick={onClose}>Fechar</button></div>
    </Overlay>
  );
}
