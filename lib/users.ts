// lib/users.ts
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { redis, USERS_HASH_KEY } from "./redis";

export type AppUser = {
  id: string;            // U000, U001, U002, ...
  name: string;          // Administrador general, Usuario 1, Usuario 2, ...
  token: string;         // API key
  passwordHash: string;  // hash de la contraseña
  active: boolean;       // habilitado o no
  createdAt: number;     // timestamp (Date.now())
};

export type AppUserSafe = Omit<AppUser, "passwordHash">;

function mapToSafe(user: AppUser): AppUserSafe {
  const { passwordHash, ...safe } = user;
  return safe;
}

// ======================================================
// Config de usuario ADMIN especial (solo para ti)
// ======================================================

const ADMIN_ID = "U000";
const ADMIN_NAME = "Administrador general";
const ADMIN_PASSWORD_PLAIN = "ADMIN-WSCA-2025";

// ======================================================
// Trial (solo para usuarios normales)
// ======================================================

const TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// ======================================================
// Helpers robustos para leer/escribir desde Redis
// ======================================================

function deserializeUser(raw: unknown): AppUser {
  if (typeof raw === "string") return JSON.parse(raw) as AppUser;
  if (typeof raw === "object" && raw !== null) return raw as AppUser;
  throw new Error("Formato de usuario desconocido en Redis");
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const raw = await redis.hget(USERS_HASH_KEY, id);
  if (!raw) return null;
  return deserializeUser(raw);
}

async function saveUser(user: AppUser) {
  await redis.hset(USERS_HASH_KEY, {
    [user.id]: JSON.stringify(user),
  });
}

// ======================================================
// Crea el usuario U000 (admin) si no existe
// ======================================================

export async function ensureAdminUser() {
  const existing = await redis.hget(USERS_HASH_KEY, ADMIN_ID);
  if (existing) return; // ya existe

  const token = `adm-${crypto.randomBytes(12).toString("hex")}`;
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD_PLAIN, 10);

  const adminUser: AppUser = {
    id: ADMIN_ID,
    name: ADMIN_NAME,
    token,
    passwordHash,
    active: true,
    createdAt: Date.now(),
  };

  await saveUser(adminUser);
}

// ======================================================
// Seed inicial: crear 40 usuarios (U001–U040)
// Arreglado: permite seed aunque ya exista U000
// ======================================================

export async function seedUsers(count = 40) {
  // Asegura que U000 exista
  await ensureAdminUser();

  // Leemos todo el hash
  const rawAll = await redis.hgetall(USERS_HASH_KEY);

  // Si ya hay usuarios distintos al admin, no hacemos seed para no pisar
  if (rawAll) {
    const ids = Object.keys(rawAll);
    const nonAdmin = ids.filter((id) => id !== ADMIN_ID);
    if (nonAdmin.length > 0) {
      throw new Error(
        `Ya existen usuarios en Redis (${nonAdmin.slice(0, 5).join(", ")}...). No se realizará el seed.`
      );
    }
  }

  const entriesObj: Record<string, string> = {};
  const exposed: (AppUserSafe & { passwordPlain: string })[] = [];

  for (let i = 1; i <= count; i++) {
    const id = `U${String(i).padStart(3, "0")}`; // U001, U002, ...
    const name = `Usuario ${i}`;
    const token = crypto.randomBytes(18).toString("hex");

    // Contraseña inicial: MQ-0001, MQ-0002, ...
    const passwordPlain = `MQ-${String(i).padStart(4, "0")}`;
    const passwordHash = await bcrypt.hash(passwordPlain, 10);

    const user: AppUser = {
      id,
      name,
      token,
      passwordHash,
      active: true,
      createdAt: Date.now(), // <- aquí nace el trial
    };

    entriesObj[id] = JSON.stringify(user);
    exposed.push({ ...mapToSafe(user), passwordPlain });
  }

  await redis.hset(USERS_HASH_KEY, entriesObj);

  return exposed;
}

// ======================================================
// Listar todos los usuarios (para el panel admin)
// ======================================================

export async function getAllUsers(): Promise<AppUserSafe[]> {
  await ensureAdminUser();
  const raw = await redis.hgetall(USERS_HASH_KEY);
  if (!raw) return [];
  return Object.values(raw).map((v) => mapToSafe(deserializeUser(v)));
}

// ======================================================
// Operaciones admin: activar, reset token, reset pass
// ======================================================

export async function toggleUserActive(id: string): Promise<AppUserSafe | null> {
  if (id === ADMIN_ID) return null; // no desactivar admin
  const user = await getUserById(id);
  if (!user) return null;
  user.active = !user.active;
  await saveUser(user);
  return mapToSafe(user);
}

export async function resetUserToken(id: string): Promise<AppUserSafe | null> {
  const user = await getUserById(id);
  if (!user) return null;
  user.token = crypto.randomBytes(18).toString("hex");
  await saveUser(user);
  return mapToSafe(user);
}

export async function resetUserPassword(
  id: string
): Promise<{ user: AppUserSafe; newPassword: string } | null> {
  const user = await getUserById(id);
  if (!user) return null;

  // Admin: no tocamos aquí
  if (user.id === ADMIN_ID) return null;

  const newPassword = `MQ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await saveUser(user);

  return { user: mapToSafe(user), newPassword };
}

// ======================================================
// Trial helpers
// ======================================================

function isTrialExpired(user: AppUser): boolean {
  if (user.id === ADMIN_ID) return false; // admin nunca vence
  const expiresAt = user.createdAt + TRIAL_DAYS * DAY_MS;
  return Date.now() > expiresAt;
}

// ======================================================
// Validación de credenciales (login)
// ======================================================

export async function validateCredentials(params: {
  id: string;
  password: string;
  token?: string;
}): Promise<AppUserSafe | "TRIAL_EXPIRED" | null> {
  const { id, password, token } = params;

  const user = await getUserById(id);
  if (!user || !user.active) return null;

  // Si venció el trial -> lo reportamos
  if (isTrialExpired(user)) {
    return "TRIAL_EXPIRED";
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  if (token && token !== user.token) return null;

  return mapToSafe(user);
}
