import { getTokenFromRequest, verifyToken } from "../services/authService.js";

export function verifyAdmin(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    console.log(`[verifyAdmin] FAILED method=${req.method} path=${req.originalUrl} reason=no_token`);
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    req.admin = verifyToken(token);
    console.log(`[verifyAdmin] OK method=${req.method} path=${req.originalUrl} id=${req.admin.id} role=${req.admin.role}`);
    next();
  } catch (e) {
    console.log(`[verifyAdmin] FAILED method=${req.method} path=${req.originalUrl} reason=invalid_token err=${e.message}`);
    return res.status(401).json({ error: "unauthorized" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.admin?.role)) {
      console.log(`[requireRole] FAILED method=${req.method} path=${req.originalUrl} role=${req.admin?.role} required=${roles.join("|")}`);
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}