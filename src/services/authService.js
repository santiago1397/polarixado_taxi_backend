import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = "admin_token";
const COOKIE_MAX_AGE = 3 * 60 * 60 * 1000; // 3 hours in ms

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(payload) {
  const t = jwt.sign(payload, JWT_SECRET, { expiresIn: "3h" });
  console.log(`[auth] signToken id=${payload.id} role=${payload.role} iat=${jwt.decode(t).iat} exp=${jwt.decode(t).exp}`);
  return t;
}

export function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log(`[auth] verifyToken OK id=${decoded.id} role=${decoded.role} exp=${decoded.exp}`);
    return decoded;
  } catch (e) {
    const preview = token ? token.slice(0, 16) + "..." : "(empty)";
    console.log(`[auth] verifyToken FAILED err=${e.name}:${e.message} token=${preview}`);
    throw e;
  }
}

const isProd = process.env.NODE_ENV === "production";

export function setTokenCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    maxAge: COOKIE_MAX_AGE,
  });
}

export function clearTokenCookie(res) {
  res.cookie(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    maxAge: 0,
  });
}

export function getTokenFromRequest(req) {
  const fromCookie = req.cookies?.[COOKIE_NAME];
  const fromAuth = req.header("Authorization")?.replace("Bearer ", "");
  const token = fromCookie || fromAuth;
  const cookieNames = req.cookies ? Object.keys(req.cookies).join(",") : "(none)";
  console.log(`[auth] getTokenFromRequest path=${req.originalUrl} cookies=[${cookieNames}] authHeader=${req.header("Authorization") ? "yes" : "no"} -> ${token ? "token found" : "NO TOKEN"}`);
  return token;
}

export { COOKIE_NAME };