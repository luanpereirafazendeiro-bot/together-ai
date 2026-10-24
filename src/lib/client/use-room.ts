"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { api, ApiError } from "./api";
import { mergeMessages, maxSeq, removeMessage, type ChatMessage } from "./messages";
import type { Participant, Room } from "../types";

export type Connection = "connecting" | "online" | "offline";
export type Fatal = null | { kind: "forbidden" | "removed" | "notfound"; message: string };

interface RoomInfo {
  room: Room;
  participants: Participant[];
  me: Participant;
}

let browserClient: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return browserClient;
}

export function useRoom(roomId: string, token: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [connection, setConnection] = useState<Connection>("connecting");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<Fatal>(null);

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const connectedRef = useRef(false);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof ApiError) {
      if (e.code === "removed") setFatal({ kind: "removed", message: e.message });
      else if (e.status === 401 || e.status === 403) setFatal({ kind: "forbidden", message: e.message });
      else if (e.status === 404) setFatal({ kind: "notfound", message: e.message });
    }
  }, []);

  const loadInfo = useCallback(async () => {
    try {
      const data = await api<RoomInfo>(`/api/rooms/${roomId}`, { token });
      setInfo(data);
    } catch (e) {
      handleError(e);
    }
  }, [roomId, token, handleError]);

  // Recarrega as últimas mensagens (pega o que perdemos e também exclusões).
  const resync = useCallback(async () => {
    try {
      const data = await api<{ messages: ChatMessage[]; hasMore: boolean }>(
        `/api/rooms/${roomId}/messages?limit=50`,
        { token },
      );
      setMessages((cur) => {
        const firstSeq = data.messages[0]?.seq ?? Infinity;
        const keep = cur.filter((m) => m.local || m.seq < firstSeq);
        return mergeMessages(keep, data.messages);
      });
      setHasMore((h) => h || data.hasMore);
    } catch (e) {
      handleError(e);
    }
  }, [roomId, token, handleError]);

  // Só o que veio depois do último seq conhecido (rápido, usado após reconectar).
  const catchUp = useCallback(async () => {
    try {
      const data = await api<{ messages: ChatMessage[] }>(
        `/api/rooms/${roomId}/messages?after=${maxSeq(messagesRef.current)}`,
        { token },
      );
      if (data.messages.length) setMessages((cur) => mergeMessages(cur, data.messages));
    } catch (e) {
      handleError(e);
    }
  }, [roomId, token, handleError]);

  // Carga inicial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all([loadInfo(), resync()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadInfo, resync]);

  // Tempo real (Supabase Realtime) com token curto e reconexão automática
  useEffect(() => {
    if (fatal) return;
    let channel: RealtimeChannel | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const sb = supabase();

    async function connect() {
      try {
        const { token: jwt, expiresInSec } = await api<{ token: string; expiresInSec: number }>(
          `/api/rooms/${roomId}/session`,
          { method: "POST", body: {}, token },
        );
        if (closed) return;
        sb.realtime.setAuth(jwt);
        // renova o token antes de expirar
        refreshTimer = setTimeout(async () => {
          try {
            const next = await api<{ token: string; expiresInSec: number }>(
              `/api/rooms/${roomId}/session`,
              { method: "POST", body: {}, token },
            );
            sb.realtime.setAuth(next.token);
          } catch (e) {
            handleError(e);
          }
        }, Math.max(60, expiresInSec - 300) * 1000);

        channel = sb
          .channel(`room:${roomId}`, { config: { presence: { key: roomId + ":" + token.split(".")[0] } } })
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
            (payload) => {
              if (payload.eventType === "DELETE") {
                const id = (payload.old as { id?: string }).id;
                if (id) setMessages((cur) => removeMessage(cur, id));
              } else {
                setMessages((cur) => mergeMessages(cur, [payload.new as ChatMessage]));
              }
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "participants", filter: `room_id=eq.${roomId}` },
            () => void loadInfo(),
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
            () => void loadInfo(),
          )
          .on("presence", { event: "sync" }, () => {
            const state = channel?.presenceState() ?? {};
            const ids = new Set<string>();
            for (const metas of Object.values(state)) {
              for (const m of metas as unknown as { pid?: string }[]) if (m.pid) ids.add(m.pid);
            }
            setOnline(ids);
          })
          .subscribe(async (status) => {
            if (closed) return;
            if (status === "SUBSCRIBED") {
              connectedRef.current = true;
              setConnection("online");
              await channel?.track({ pid: token.split(".")[0] });
              void catchUp();
              void resync();
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              connectedRef.current = false;
              setConnection("offline");
            }
          });
      } catch (e) {
        handleError(e);
        connectedRef.current = false;
        setConnection("offline");
        // tenta de novo em alguns segundos
        if (!closed) refreshTimer = setTimeout(connect, 5000);
      }
    }

    void connect();
    return () => {
      closed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel) void sb.removeChannel(channel);
    };
  }, [roomId, token, fatal, catchUp, resync, loadInfo, handleError]);

  // Rede de segurança: busca periódica (rápida se o tempo real caiu) e ao voltar para a aba.
  useEffect(() => {
    if (fatal) return;
    const tick = () => {
      if (document.visibilityState === "visible") void (connectedRef.current ? resync() : catchUp());
    };
    const every = connection === "online" ? 20_000 : 4_000;
    const id = setInterval(tick, every);
    const onVisible = () => {
      if (document.visibilityState === "visible") void resync();
    };
    const onOnline = () => void resync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [connection, fatal, resync, catchUp]);

  const loadOlder = useCallback(async () => {
    const first = messagesRef.current.find((m) => !m.local);
    if (!first) return;
    try {
      const data = await api<{ messages: ChatMessage[]; hasMore: boolean }>(
        `/api/rooms/${roomId}/messages?before=${first.seq}&limit=50`,
        { token },
      );
      setMessages((cur) => mergeMessages(cur, data.messages));
      setHasMore(data.hasMore);
    } catch (e) {
      handleError(e);
    }
  }, [roomId, token, handleError]);

  const send = useCallback(
    async (content: string, replyTo?: string, retryClientId?: string) => {
      const me = info?.me;
      if (!me) return;
      const clientId = retryClientId ?? crypto.randomUUID();
      const optimistic: ChatMessage = {
        seq: 0,
        id: "local-" + clientId,
        room_id: roomId,
        participant_id: me.id,
        author_name: me.nickname,
        author_type: "human",
        content,
        status: "done",
        reply_to: replyTo ?? null,
        client_id: clientId,
        created_at: new Date().toISOString(),
        local: "sending",
      };
      setMessages((cur) => mergeMessages(cur.filter((m) => m.client_id !== clientId), [optimistic]).map((m) =>
        m.client_id === clientId ? { ...m, local: "sending" as const } : m,
      ));
      try {
        const { message } = await api<{ message: ChatMessage }>(`/api/rooms/${roomId}/messages`, {
          token,
          body: { content, clientId, replyTo },
        });
        setMessages((cur) => mergeMessages(cur, [message]));
      } catch (e) {
        handleError(e);
        setMessages((cur) =>
          cur.map((m) =>
            m.client_id === clientId
              ? { ...m, local: "failed" as const, content, status: "done", seq: 0 }
              : m,
          ),
        );
        if (e instanceof ApiError && e.code === "rate_limited") throw e;
      }
    },
    [info, roomId, token, handleError],
  );

  const retry = useCallback(
    (m: ChatMessage) => {
      if (m.client_id) void send(m.content, m.reply_to ?? undefined, m.client_id);
    },
    [send],
  );

  const discard = useCallback((m: ChatMessage) => {
    setMessages((cur) => removeMessage(cur, m.id));
  }, []);

  const aiBusy = useMemo(() => messages.some((m) => m.author_type === "ai" && m.status === "streaming"), [messages]);

  return {
    messages,
    info,
    online,
    connection,
    hasMore,
    loading,
    fatal,
    aiBusy,
    send,
    retry,
    discard,
    loadOlder,
    reloadInfo: loadInfo,
    resync,
  };
}
