import { Router } from "express";
import {
  createBot,
  listBots,
  getBotById,
  getBotBySlug,
  getBotFacets,
  updateBot,
  deleteBot,
  incViews,
  trackClick,
  topBots,
} from "../controllers/botController.js";

const router = Router();

router.post("/", createBot);
router.get("/", listBots); // ?q=&tag=&category=&status=&page=&limit=&lang=
router.get("/facets", getBotFacets);
router.get("/top", topBots);
router.get("/slug/:slug", getBotBySlug);
router.get("/:id", getBotById);
router.patch("/:id", updateBot);
router.delete("/:id", deleteBot);
router.patch("/:id/views", incViews);
router.post("/:id/click", trackClick);

export default router;
