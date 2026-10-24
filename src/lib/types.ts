export type AuthorType = "human" | "ai" | "system";
export type MessageStatus = "streaming" | "done" | "error";

export interface Message {
  seq: number;
  id: string;
  room_id: string;
  participant_id: string | null;
  author_name: string;
  author_type: AuthorType;
  content: string;
  status: MessageStatus;
  reply_to: string | null;
  client_id: string | null;
  created_at: string;
}

export interface Participant {
  id: string;
  room_id: string;
  nickname: string;
  role: "owner" | "member";
  joined_at: string;
  removed_at: string | null;
}

export interface Room {
  id: string;
  name: string;
  created_at: string;
  ai_mode: "always" | "mention" | "off";
  ai_persona: string;
}

export const MESSAGE_COLUMNS =
  "seq,id,room_id,participant_id,author_name,author_type,content,status,reply_to,client_id,created_at";
