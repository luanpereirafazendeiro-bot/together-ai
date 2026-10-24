"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getRoom, type SavedRoom } from "@/lib/client/storage";
import { ChatRoom } from "@/components/ChatRoom";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [saved, setSaved] = useState<SavedRoom | null | undefined>(undefined);

  useEffect(() => {
    setSaved(getRoom(id) ?? null);
  }, [id]);

  if (saved === undefined) return <main className="center"><p className="hint">Carregando…</p></main>;

  if (saved === null) {
    return (
      <main className="center">
        <div className="card">
          <h2>Você ainda não está nesta sala</h2>
          <p className="hint">
            Para entrar, abra o <b>link de convite</b> que a pessoa te enviou. Se você já participava,
            use o mesmo aparelho e navegador de antes.
          </p>
          <a className="btn" href="/" style={{ display: "inline-grid", placeItems: "center", textDecoration: "none", color: "inherit" }}>
            Ir para o início
          </a>
        </div>
      </main>
    );
  }

  return <ChatRoom roomId={id} saved={saved} />;
}
