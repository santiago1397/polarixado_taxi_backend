import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = "admin_token";
const COOKIE_MAX_AGE = 3 * 60 * 60; // 3 hours in seconds

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "3h" });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
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
  return req.cookies?.[COOKIE_NAME] || req.header("Authorization")?.replace("Bearer ", "");
}

export { COOKIE_NAME };