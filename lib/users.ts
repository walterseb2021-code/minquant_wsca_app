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
// Helpers robustos para leer/escribir desde Redis
// ======================================================

function deserializeUser(raw: unknown): AppUser {
  // Si viene como string JSON -> parseamos
  if (typeof raw === "string") {
    return JSON.parse(raw) as AppUser;
  }

  // Si ya viene como objeto -> lo usamos directo
  if (typeof raw === "object" && raw !== null) {
    return raw as AppUser;
  }

  throw new Error("Formato de usuario desconocido en Redis");
}

async function getUser(id: string): Promise<AppUser | null> {
  const raw = await redis.hget(USERS_HASH_KEY, id);
  if (!raw) return null;
  return deserializeUser(raw);
}

async function saveUser(user: AppUser) {
  // Siempre guardamos como JSON string
  await redis.hset(USERS_HASH_KEY, {
    [user.id]: JSON.stringify(user),
  });
}

// Crea el usuario U000 (admin) si no existe
async function ensureAdminUser() {
  const existing = await redis.hget(USERS_HASH_KEY, ADMIN_ID);
  if (existing) return; // ya existe, no hacemos nada

  // Token único para el admin
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
// ======================================================

export async function seedUsers(count = 40) {
  const existing = await redis.hlen(USERS_HASH_KEY);
  if (existing && existing > 0) {
    throw new Error("Ya existen usuarios en Redis. No se realizará el seed.");
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
      createdAt: Date.now(),
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
  // Asegura que el admin U000 exista siempre
  await ensureAdminUser();

  const raw = await redis.hgetall(USERS_HASH_KEY);
  if (!raw) return [];

  const valores = Object.values(raw);
  const usuarios = valores.map((value) => deserializeUser(value));
  return usuarios.map((u) => mapToSafe(u));
}

// ======================================================
// Operaciones admin: activar, reset token, reset pass
// ======================================================

export async function toggleUserActive(id: string): Promise<AppUserSafe | null> {
  const user = await getUser(id);
  if (!user) return null;
  user.active = !user.active;
  await saveUser(user);
  return mapToSafe(user);
}

export async function resetUserToken(id: string): Promise<AppUserSafe | null> {
  const user = await getUser(id);
  if (!user) return null;
  user.token = crypto.randomBytes(18).toString("hex");
  await saveUser(user);
  return mapToSafe(user);
}

export async function resetUserPassword(
  id: string
): Promise<{ user: AppUserSafe; newPassword: string } | null> {
  const user = await getUser(id);
  if (!user) return null;

  const newPassword = `MQ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await saveUser(user);

  return { user: mapToSafe(user), newPassword };
}

// ======================================================
// Validación de credenciales (login)
// ======================================================

export async function validateCredentials(params: {
  id: string;
  password: string;
  token?: string;
}): Promise<AppUserSafe | null> {
  const { id, password, token } = params;

  const user = await getUser(id);
  if (!user || !user.active) return null;

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  if (token && token !== user.token) {
    return null;
  }

  return mapToSafe(user);
}
