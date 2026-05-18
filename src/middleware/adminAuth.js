import { getTokenFromRequest, verifyToken } from "../services/authService.js";

export function verifyAdmin(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: "unauthorized" });

  try {
    req.admin = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.admin?.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}