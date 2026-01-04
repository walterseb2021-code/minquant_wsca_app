import crypto from "crypto";
import bcrypt from "bcryptjs";
import { redis, USERS_HASH_KEY } from "./redis";

export type AppUser = {
  id: string;
  name: string;
  token: string;
  passwordHash: string;
  active: boolean;
  createdAt: number;
};

export type AppUserSafe = Omit<AppUser, "passwordHash">;

const ADMIN_ID = "U000";
const ADMIN_NAME = "Administrador general";
const ADMIN_PASSWORD_PLAIN = "ADMIN-WSCA-2025";
const TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function mapToSafe(user: AppUser): AppUserSafe {
  const { passwordHash, ...safe } = user;
  return safe;
}

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

export async function ensureAdminUser() {
  const existing = await redis.hget(USERS_HASH_KEY, ADMIN_ID);
  if (existing) return;

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

export async function seedUsers(count = 40) {
  const existing = await redis.hlen(USERS_HASH_KEY);
  if (existing && existing > 0) {
    throw new Error("Ya existen usuarios en Redis.");
  }

  const entriesObj: Record<string, string> = {};
  const exposed: (AppUserSafe & { passwordPlain: string })[] = [];

  for (let i = 1; i <= count; i++) {
    const id = `U${String(i).padStart(3, "0")}`;
    const name = `Usuario ${i}`;
    const token = crypto.randomBytes(18).toString("hex");
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

export async function getAllUsers(): Promise<AppUserSafe[]> {
  await ensureAdminUser();
  const raw = await redis.hgetall(USERS_HASH_KEY);
  if (!raw) return [];
  return Object.values(raw).map(v => mapToSafe(deserializeUser(v)));
}

function isTrialExpired(user: AppUser): boolean {
  if (user.id === ADMIN_ID) return false;
  const expiresAt = user.createdAt + TRIAL_DAYS * DAY_MS;
  return Date.now() > expiresAt;
}

export async function validateCredentials(params: {
  id: string;
  password: string;
}): Promise<AppUserSafe | "TRIAL_EXPIRED" | null> {
  const { id, password } = params;

  const user = await getUserById(id);
  if (!user || !user.active) return null;

  if (isTrialExpired(user)) {
    return "TRIAL_EXPIRED";
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  return mapToSafe(user);
}
