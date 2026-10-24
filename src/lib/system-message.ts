import "server-only";
import { admin } from "./supabase-admin";

export async function systemMessage(roomId: string, content: string) {
  await admin().from("messages").insert({
    room_id: roomId,
    author_name: "Sistema",
    author_type: "system",
    content,
    status: "done",
  });
}
