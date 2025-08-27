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

// CRUD + tiện ích
router.post("/", createBot); // POST   /api/bots
router.get("/", listBots); // GET    /api/bots?q=&tag=&status=&skip=&limit=&sort=-views
router.get("/facets", getBotFacets);
router.get("/top", topBots); // GET    /api/bots/top?limit=10
router.get("/slug/:slug", getBotBySlug); // GET    /api/bots/slug/:slug
router.get("/:id", getBotById); // GET    /api/bots/:id
router.patch("/:id", updateBot); // PATCH  /api/bots/:id
router.delete("/:id", deleteBot); // DELETE /api/bots/:id
router.patch("/:id/views", incViews); // PATCH  /api/bots/:id/views
router.post("/:id/click", trackClick); // POST   /api/bots/:id/click

export default router;
