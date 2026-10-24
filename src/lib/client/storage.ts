// Guarda no navegador: quem eu sou em cada sala (token) e a lista de salas recentes.
// O histórico em si NUNCA fica aqui — vem sempre do banco.
export interface SavedRoom {
  roomId: string;
  name: string;
  token: string;
  nickname: string;
  lastOpened: number;
}

const KEY = "together-ai:rooms:v1";
const NICK_KEY = "together-ai:nickname";

function read(): SavedRoom[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedRoom[]) : [];
  } catch {
    return [];
  }
}

function write(rooms: SavedRoom[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rooms.slice(0, 30)));
  } catch {
    /* modo privado ou sem espaço: ignora */
  }
}

export function listRooms(): SavedRoom[] {
  return read().sort((a, b) => b.lastOpened - a.lastOpened);
}

export function getRoom(roomId: string): SavedRoom | undefined {
  return read().find((r) => r.roomId === roomId);
}

export function saveRoom(r: Omit<SavedRoom, "lastOpened">) {
  const others = read().filter((x) => x.roomId !== r.roomId);
  write([{ ...r, lastOpened: Date.now() }, ...others]);
}

export function touchRoom(roomId: string, patch: Partial<SavedRoom> = {}) {
  write(read().map((r) => (r.roomId === roomId ? { ...r, ...patch, lastOpened: Date.now() } : r)));
}

export function forgetRoom(roomId: string) {
  write(read().filter((r) => r.roomId !== roomId));
}

export function getNickname(): string {
  try {
    return localStorage.getItem(NICK_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setNickname(n: string) {
  try {
    localStorage.setItem(NICK_KEY, n);
  } catch {
    /* ignora */
  }
}
