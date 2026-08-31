import crypto from "crypto";

export const trackingLinks = new Map();
export const activeSessions = new Map();
export const latestLocations = new Map();
export const adminRooms = new Map();

export function generateToken() {
  return crypto.randomBytes(12).toString("base64url");
}

export function createTrackingLink({ name, expiryMinutes }) {
  const token = generateToken();
  const trackingId = `TRK-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const now = Date.now();
  const link = {
    token,
    trackingId,
    name: name || "Unnamed Tracking",
    status: "active",
    createdAt: now,
    expiresAt: now + expiryMinutes * 60 * 1000,
    useCount: 0,
  };
  trackingLinks.set(token, link);
  return link;
}

export function getTrackingLink(token) {
  return trackingLinks.get(token) || null;
}

export function deactivateLink(token) {
  const link = trackingLinks.get(token);
  if (!link) return null;
  link.status = "deactivated";
  return link;
}

export function isLinkValid(link) {
  if (!link) return false;
  if (link.status !== "active") return false;
  if (Date.now() > link.expiresAt) return false;
  return true;
}

export function validateCoords({ latitude, longitude, accuracy }) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  if (accuracy !== undefined && (typeof accuracy !== "number" || accuracy < 0)) return false;
  return true;
}
