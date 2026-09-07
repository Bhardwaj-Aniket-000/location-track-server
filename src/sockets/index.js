import {
  trackingLinks,
  trackingHistory,
  activeSessions,
  latestLocations,
  isLinkValid,
  markExpiredIfDue,
  getSession,
  appendPoint,
  markStopped,
  markDisconnected,
} from "../services/trackingStore.js";

export function setupSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("tracking:join", ({ token }) => {
      const link = trackingLinks.get(token);
      if (!link || !isLinkValid(link)) {
        if (link) markExpiredIfDue(link);
        socket.emit("tracking:error", { message: "Invalid or expired tracking link." });
        return;
      }

      link.useCount++;

      let session = getSession(link.trackingId);
      if (!session) {
        session = {
          trackingId: link.trackingId,
          token: link.token,
          name: link.name,
          status: "active",
          createdAt: link.createdAt,
          expiresAt: link.expiresAt,
          stoppedAt: null,
          stopReason: null,
          lastSeenAt: null,
          points: [],
        };
        trackingHistory.set(link.trackingId, session);
      }
      session.status = "active";

      activeSessions.set(link.trackingId, {
        socketId: socket.id,
        trackingId: link.trackingId,
        token,
        status: "active",
        connected: true,
        createdAt: Date.now(),
      });

      socket.data.trackingId = link.trackingId;
      socket.data.token = token;
      socket.join(`tracking:${link.trackingId}`);

      socket.emit("tracking:joined", {
        trackingId: link.trackingId,
        pointsCount: session.points.length,
      });
      console.log(`User joined tracking: ${link.trackingId}`);
    });

    socket.on("location:update", async (data) => {
      const trackingId = socket.data.trackingId;
      const token = socket.data.token;

      console.log("Received location:update", JSON.stringify(data), "for session", trackingId);

      if (!trackingId || !token) {
        socket.emit("tracking:error", { message: "Not joined to a tracking session." });
        return;
      }

      const link = trackingLinks.get(token);
      if (!link || !isLinkValid(link)) {
        if (link) markExpiredIfDue(link);
        socket.emit("tracking:error", { message: "Tracking link is no longer active." });
        return;
      }

      const { latitude, longitude, accuracy, timestamp } = data || {};

      if (typeof latitude !== "number" || typeof longitude !== "number") {
        socket.emit("tracking:error", { message: "Invalid location data." });
        return;
      }
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        socket.emit("tracking:error", { message: "Coordinates out of range." });
        return;
      }
      if (accuracy !== undefined && (typeof accuracy !== "number" || accuracy < 0)) {
        socket.emit("tracking:error", { message: "Invalid accuracy value." });
        return;
      }

      const point = {
        latitude,
        longitude,
        accuracy: accuracy || null,
        timestamp: timestamp || Date.now(),
      };

      const session = await appendPoint(trackingId, point, link);
      const lastSeenAt = session ? session.lastSeenAt : point.timestamp;

      const locationData = {
        trackingId,
        latitude,
        longitude,
        accuracy: point.accuracy,
        timestamp: point.timestamp,
        lastSeenAt,
        pointCount: session ? session.points.length : 1,
      };

      latestLocations.set(trackingId, locationData);

      const active = activeSessions.get(trackingId);
      if (active) {
        active.status = "active";
        active.lastUpdate = Date.now();
      }

      io.to(`admin:${trackingId}`).emit("location:updated", locationData);
    });

    socket.on("tracking:stop", async () => {
      const trackingId = socket.data.trackingId;
      if (trackingId) {
        const session = await markStopped(trackingId);
        const active = activeSessions.get(trackingId);
        if (active) {
          active.status = "stopped";
          active.connected = false;
        }
        io.to(`admin:${trackingId}`).emit("tracking:stopped", {
          trackingId,
          stoppedAt: session ? session.stoppedAt : Date.now(),
          stopReason: session ? session.stopReason : "user_stopped",
        });
        console.log(`Tracking stopped: ${trackingId}`);
      }
      socket.data.trackingId = null;
      socket.data.token = null;
    });

    socket.on("admin:join", ({ trackingId }) => {
      if (!trackingId || typeof trackingId !== "string") {
        socket.emit("tracking:error", { message: "Invalid tracking ID." });
        return;
      }

      const session = getSession(trackingId);
      const location = latestLocations.get(trackingId);
      const active = activeSessions.get(trackingId);
      const link = session
        ? trackingLinks.get(session.token)
        : [...trackingLinks.values()].find((l) => l.trackingId === trackingId) || null;

      if (link) markExpiredIfDue(link);

      const lastPoint = session && session.points.length ? session.points[session.points.length - 1] : null;

      socket.join(`admin:${trackingId}`);
      socket.emit("admin:joined", {
        trackingId,
        session: session
          ? {
              trackingId: session.trackingId,
              name: session.name,
              status: session.status,
              createdAt: session.createdAt,
              expiresAt: session.expiresAt,
              stoppedAt: session.stoppedAt,
              stopReason: session.stopReason,
              lastSeenAt: session.lastSeenAt,
              pointCount: session.points.length,
            }
          : null,
        link: link
          ? {
              trackingId: link.trackingId,
              name: link.name,
              status: link.status,
              createdAt: link.createdAt,
              expiresAt: link.expiresAt,
              useCount: link.useCount,
            }
          : null,
        location: location || lastPoint ? { ...(location || lastPoint) } : null,
        points: session ? session.points : [],
        active: active ? { connected: active.connected, status: active.status } : null,
      });
      console.log(`Admin joined room for: ${trackingId}`);
    });

    socket.on("disconnect", () => {
      const trackingId = socket.data.trackingId;
      if (trackingId) {
        const active = activeSessions.get(trackingId);
        if (active && active.socketId === socket.id) {
          active.connected = false;
          active.status = "disconnected";
          markDisconnected(trackingId);
          const session = getSession(trackingId);
          io.to(`admin:${trackingId}`).emit("tracking:disconnected", {
            trackingId,
            lastSeenAt: session ? session.lastSeenAt : null,
          });
        }
      }
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}