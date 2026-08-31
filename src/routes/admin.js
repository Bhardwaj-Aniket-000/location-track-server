import { Router } from "express";
import { createLink, listLinks, deactivateLinkById } from "../controllers/adminController.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = Router();

router.post("/tracking-links", adminAuth, createLink);
router.get("/tracking-links", adminAuth, listLinks);
router.post("/tracking-links/:id/deactivate", adminAuth, deactivateLinkById);

export default router;
