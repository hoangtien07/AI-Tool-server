// routes/blogs.js
import { Router } from "express";
import {
  listBlogs,
  createBlog,
  getBlog,
  updateBlog,
  deleteBlog,
} from "../controllers/blogController.js";

const router = Router();

router.get("/", listBlogs);
router.post("/", createBlog);

router.get("/:slug", getBlog);
router.patch("/:slug", updateBlog);
router.delete("/:slug", deleteBlog);

export default router;
