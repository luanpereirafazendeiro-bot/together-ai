import { authenticate } from "@/lib/auth";
import { errorResponse, signRealtimeToken } from "@/lib/security";

type Ctx = { params: Promise<{ id: string }> };

// Emite um token curto (1h) que permite ao navegador "ouvir" SOMENTE esta sala.
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const me = await authenticate(req, id);
    const { token, expiresInSec } = await signRealtimeToken(id, me.id);
    return Response.json({ token, expiresInSec });
  } catch (e) {
    return errorResponse(e);
  }
}
