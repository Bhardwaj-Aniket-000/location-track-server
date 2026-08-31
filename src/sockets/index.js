import { trackingLinks, activeSessions, latestLocations, isLinkValid } from "../services/trackingStore.js";

export function setupSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("tracking:join", ({ token }) => {
      const link = trackingLinks.get(token);
      if (!isLinkValid(link)) {
        socket.emit("tracking:error", { message: "Invalid or expired tracking link." });
        return;
      }

      link.useCount++;

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

      socket.emit("tracking:joined", { trackingId: link.trackingId });
      console.log(`User joined tracking: ${link.trackingId}`);
    });

    socket.on("location:update", (data) => {
      const trackingId = socket.data.trackingId;
      const token = socket.data.token;

      console.log("Received location:update", JSON.stringify(data), "for session", trackingId);

      if (!trackingId || !token) {
        socket.emit("tracking:error", { message: "Not joined to a tracking session." });
        return;
      }

      const { latitude, longitude, accuracy, timestamp } = data || {};

      const link = trackingLinks.get(token);
      if (!isLinkValid(link)) {
        socket.emit("tracking:error", { message: "Tracking link is no longer active." });
        return;
      }

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

      const locationData = {
        trackingId,
        latitude,
        longitude,
        accuracy: accuracy || null,
        timestamp: timestamp || Date.now(),
        updatedAt: Date.now(),
      };

      latestLocations.set(trackingId, locationData);

      const session = activeSessions.get(trackingId);
      if (session) {
        session.status = "active";
        session.lastUpdate = Date.now();
      }

      io.to(`admin:${trackingId}`).emit("location:updated", locationData);
    });

    socket.on("tracking:stop", () => {
      const trackingId = socket.data.trackingId;
      if (trackingId) {
        const session = activeSessions.get(trackingId);
        if (session) {
          session.status = "stopped";
          session.connected = false;
        }
        io.to(`admin:${trackingId}`).emit("tracking:stopped", { trackingId });
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

      const session = activeSessions.get(trackingId);
      const location = latestLocations.get(trackingId);
      const link = [...trackingLinks.values()].find(l => l.trackingId === trackingId);

      socket.join(`admin:${trackingId}`);
      socket.emit("admin:joined", {
        trackingId,
        session: session || null,
        location: location || null,
        link: link || null,
      });
      console.log(`Admin joined room for: ${trackingId}`);
    });

    socket.on("disconnect", () => {
      const trackingId = socket.data.trackingId;
      if (trackingId) {
        const session = activeSessions.get(trackingId);
        if (session && session.socketId === socket.id) {
          session.connected = false;
          session.status = "disconnected";
          io.to(`admin:${trackingId}`).emit("tracking:disconnected", { trackingId });
        }
      }
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}
