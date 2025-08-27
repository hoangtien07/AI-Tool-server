import { Router } from "express";
import { globalSearch } from "../controllers/searchController.js";

const router = Router();
router.get("/", globalSearch); // GET /api/search?q=slide&tab=all
export default router;
