// lib/session.ts
import { redis } from "./redis";

export type Session = {
  id: string;
  userId: string;
  createdAt: number;
};

const SESSION_PREFIX = "minquant:session:";

// Genera un ID de sesión (suficiente para este uso)
function generateSessionId(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2) +
    "-" +
    Math.random().toString(36).slice(2)
  );
}

// --- Helper para leer sesiones sin reventar ---
function deserializeSession(raw: unknown): Session {
  // Caso 1: viene como string JSON
  if (typeof raw === "string") {
    return JSON.parse(raw) as Session;
  }

  // Caso 2: viene como objeto ya parseado
  if (typeof raw === "object" && raw !== null) {
    return raw as Session;
  }

  throw new Error("Formato de sesión desconocido en Redis");
}

// Crea una sesión en Redis y devuelve el objeto
export async function createSession(userId: string): Promise<Session> {
  const id = generateSessionId();
  const session: Session = {
    id,
    userId,
    createdAt: Date.now(),
  };

  // Guardamos SIEMPRE como string JSON, con expiración de 7 días
  await redis.set(`${SESSION_PREFIX}${id}`, JSON.stringify(session), {
    ex: 60 * 60 * 24 * 7,
  });

  return session;
}

// Obtiene una sesión a partir de su ID
export async function getSessionById(id: string): Promise<Session | null> {
  const raw = await redis.get(`${SESSION_PREFIX}${id}`);
  if (!raw) return null;
  return deserializeSession(raw);
}

// Elimina una sesión (para logout)
export async function deleteSession(id: string): Promise<void> {
  await redis.del(`${SESSION_PREFIX}${id}`);
}
