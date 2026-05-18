import { Router } from "express";
import { findByEmail } from "../services/adminRepo.js";
import { verifyPassword, signToken, setTokenCookie, clearTokenCookie, getTokenFromRequest, verifyToken, COOKIE_NAME } from "../services/authService.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }
  const admin = await findByEmail(email);
  if (!admin) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  const token = signToken({ id: admin.id, email: admin.email, role: admin.role });
  setTokenCookie(res, token);
  const { passwordHash: _, ...adminInfo } = admin;
  res.json(adminInfo);
});

router.post("/logout", (req, res) => {
  clearTokenCookie(res);
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    const admin = verifyToken(token);
    res.json(admin);
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
});

export default router;