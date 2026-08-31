import { getTrackingLink, isLinkValid } from "../services/trackingStore.js";

export function validateToken(req, res) {
  const { token } = req.params;
  const link = getTrackingLink(token);

  if (!link) {
    return res.status(404).json({ valid: false, error: "Tracking link not found." });
  }

  if (!isLinkValid(link)) {
    return res.status(410).json({ valid: false, error: "This tracking link has expired or been deactivated." });
  }

  res.json({
    valid: true,
    trackingId: link.trackingId,
    name: link.name,
    expiresAt: link.expiresAt,
  });
}
