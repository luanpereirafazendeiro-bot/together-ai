export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: {
        "content-type": "application/json",
        ...(opts.token ? { "x-participant-token": opts.token } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Sem conexão com o servidor.", "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Algo deu errado.", data.code);
  return data as T;
}

/** Extrai o código de convite de um link completo ou de um código solto. */
export function extractInviteCode(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/\/j\/([A-Za-z0-9_-]{10,64})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,64}$/.test(s) ? s : null;
}
