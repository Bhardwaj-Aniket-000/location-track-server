import { Router } from "express";
import { validateToken } from "../controllers/trackingController.js";

const router = Router();

router.get("/:token", validateToken);

export default router;
