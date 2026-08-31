import crypto from "crypto";

const VALID_ADMIN_KEY = process.env.ADMIN_KEY || "dev-admin-key-12345";

export function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== VALID_ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized. Invalid admin key." });
  }
  next();
}
