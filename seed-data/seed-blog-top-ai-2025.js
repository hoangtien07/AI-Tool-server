// scripts/seed-blog-top-ai-2025.js
import "dotenv/config.js";
import mongoose from "mongoose";
import Blog from "../models/Blog.js"; // sửa path theo dự án của bạn
import fs from "node:fs";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ai_tooler";

// --- Tải HTML ở trên (dán vào file cùng thư mục để dễ quản lý) ---
const content = fs.readFileSync(
  new URL("./top-ai-2025.html", import.meta.url),
  "utf8"
);

// Tạo excerpt ngắn
const toPlain = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const excerpt = toPlain(content).slice(0, 200);

// Document theo Blog model (đã có slug unique)
const doc = {
  title:
    "Top AI Tools năm 2025: 10 công cụ giúp bạn bứt phá trong kỷ nguyên số",
  slug: "top-ai-tools-2025-10-cong-cu-giup-ban-but-pha",
  image:
    "https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=1600&auto=format&fit=crop",
  content,
  tags: ["ai", "tools", "video", "automation", "vi"],
  excerpt,
  status: "active",
  publishedAt: new Date(),
  source: "manual",
};

async function main() {
  await mongoose.connect(MONGODB_URI);
  // Upsert theo slug
  const saved = await Blog.findOneAndUpdate(
    { slug: doc.slug },
    { $set: doc },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log("Saved blog:", {
    id: saved._id.toString(),
    slug: saved.slug,
    title: saved.title,
  });
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
