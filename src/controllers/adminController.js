import {
  createTrackingLink,
  deactivateLink,
  trackingLinks,
  trackingHistory,
  getTrackingLink,
  isLinkValid,
  markExpiredIfDue,
} from "../services/trackingStore.js";

export async function createLink(req, res) {
  try {
    const { name, expiryMinutes } = req.body;
    if (!expiryMinutes || typeof expiryMinutes !== "number" || expiryMinutes <= 0) {
      return res.status(400).json({ error: "Invalid expiry value." });
    }
    const link = await createTrackingLink({
      name: name || "Unnamed Tracking",
      expiryMinutes,
    });
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.status(201).json({
      trackingId: link.trackingId,
      token: link.token,
      name: link.name,
      status: link.status,
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
      link: `${baseUrl}/track/${link.token}`,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create tracking link." });
  }
}

export function listLinks(req, res) {
  const links = Array.from(trackingLinks.values()).map((l) => ({
    trackingId: l.trackingId,
    token: l.token,
    name: l.name,
    status: l.status,
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    useCount: l.useCount,
  }));
  links.sort((a, b) => b.createdAt - a.createdAt);
  res.json(links);
}

export async function deactivateLinkById(req, res) {
  const { id } = req.params;
  let found = null;
  for (const [, link] of trackingLinks) {
    if (link.token === id || link.trackingId === id) {
      found = link;
      break;
    }
  }
  if (!found) {
    return res.status(404).json({ error: "Tracking link not found." });
  }
  await deactivateLink(found.token);
  res.json({ message: "Link deactivated.", trackingId: found.trackingId, status: found.status });
}

export function getHistory(req, res) {
  const { trackingId } = req.params;
  const session = trackingHistory.get(trackingId);
  if (!session) {
    return res.status(404).json({ error: "No tracking session found for this ID." });
  }

  let link = getTrackingLink(session.token) || null;
  if (!link) {
    link = [...trackingLinks.values()].find((l) => l.trackingId === trackingId) || null;
  }
  if (link) markExpiredIfDue(link);

  res.json({
    trackingId,
    name: session.name,
    status: session.status,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    stoppedAt: session.stoppedAt,
    stopReason: session.stopReason,
    lastSeenAt: session.lastSeenAt,
    pointCount: session.points.length,
    linkStatus: link ? link.status : null,
    points: session.points,
  });
}
