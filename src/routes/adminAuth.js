import { Router } from "express";
import { findByEmail } from "../services/adminRepo.js";
import { verifyPassword, signToken, setTokenCookie, clearTokenCookie, getTokenFromRequest, verifyToken, COOKIE_NAME } from "../services/authService.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  console.log(`[adminAuth] /login attempt email=${email || "(missing)"}`);
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }
  const admin = await findByEmail(email);
  if (!admin) {
    console.log(`[adminAuth] /login FAILED email=${email} reason=admin_not_found`);
    return res.status(401).json({ error: "invalid credentials" });
  }
  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) {
    console.log(`[adminAuth] /login FAILED email=${email} reason=bad_password`);
    return res.status(401).json({ error: "invalid credentials" });
  }
  const token = signToken({ id: admin.id, email: admin.email, role: admin.role });
  setTokenCookie(res, token);
  console.log(`[adminAuth] /login OK id=${admin.id} role=${admin.role}`);
  const { passwordHash: _, ...adminInfo } = admin;
  res.json({ ...adminInfo, token });
});

router.post("/logout", (req, res) => {
  console.log(`[adminAuth] /logout`);
  clearTokenCookie(res);
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    console.log(`[adminAuth] /me FAILED reason=no_token`);
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const admin = verifyToken(token);
    console.log(`[adminAuth] /me OK id=${admin.id}`);
    res.json(admin);
  } catch (e) {
    console.log(`[adminAuth] /me FAILED reason=invalid_token err=${e.message}`);
    res.status(401).json({ error: "unauthorized" });
  }
});

export default router;