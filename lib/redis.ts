// lib/redis.ts
import { Redis } from "@upstash/redis";

// Validación para que el error sea claro si falta algo
const url = process.env.UPSTASH_KV_REST_API_URL;
const token = process.env.UPSTASH_KV_REST_API_TOKEN;

if (!url || !token) {
  throw new Error(
    "Faltan UPSTASH_KV_REST_API_URL o UPSTASH_KV_REST_API_TOKEN en el entorno (.env.local / Vercel)."
  );
}

// Inicializamos Redis usando las variables KV
export const redis = new Redis({
  url,
  token,
});

// Clave base para usuarios
export const USERS_HASH_KEY = "minquant:users";
