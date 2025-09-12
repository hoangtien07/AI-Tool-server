/* eslint-disable no-console */
import dotenv from "dotenv";
import mongoose from "mongoose";
import Bot from "../models/Bot.js"; // chỉnh path đúng model
import { categories } from "./category.js"; // <— đổi tên từ .txt sang .js

dotenv.config();

const DB_NAME = process.env.MONGODB_DB || "test";
const DRY_RUN = process.env.DRY_RUN === "1"; // chỉ xem trước, không ghi DB
const FORCE = process.env.FORCE_RECATEGORIZE === "1"; // ghi đè category cũ nếu có

// Lấy toàn bộ map tool -> category từ file category (ổn định & theo curated)
function buildToolToCategory() {
  const map = new Map();

  for (const cat of categories) {
    const catKey = cat.key;
    // hỗ trợ cả "tags" lẫn "tagses" (file có 1 nơi dùng "tagses")
    const tagList = Array.isArray(cat.tags)
      ? cat.tags
      : Array.isArray(cat.tagses)
      ? cat.tagses
      : [];
    for (const tg of tagList) {
      const tools = Array.isArray(tg.tools) ? tg.tools : [];
      for (const tool of tools) {
        // chỉ cần key của tool; một số item có "nam" thay vì "name" nên không phụ thuộc vào "name"
        const k = (tool?.key || "").trim();
        if (!k) continue;
        // Ưu tiên giữ mapping đầu tiên nếu tool bị lặp ở 2 nơi (tránh dao động)
        if (!map.has(k)) map.set(k, catKey);
      }
    }
  }
  return map;
}

async function upsertCategoriesCollection() {
  // Lưu (upsert) danh mục curated vào collection "bot_categories" (nếu bạn muốn tra cứu ở BE)
  const col = mongoose.connection.collection("bot_categories");
  const ops = categories.map((c) => ({
    updateOne: {
      filter: { key: c.key },
      update: {
        $set: {
          key: c.key,
          title: c.title,
          desc: c.desc ?? "",
          // chỉ lưu những gì cần dùng; tránh phình document
          updatedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));
  if (ops.length) await col.bulkWrite(ops, { ordered: false });
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGODB_URI");
  await mongoose.connect(uri, { dbName: DB_NAME });
  console.log("Connected to", DB_NAME);

  // Tạo index category + status (phục vụ filter FE)
  try {
    await Bot.collection.createIndex({ category: 1, status: 1 });
  } catch {}

  // 1) Lưu bộ danh mục curated vào DB (tuỳ chọn, có thể bỏ nếu bạn không cần)
  await upsertCategoriesCollection();

  // 2) Build mapping tool -> category từ file category
  const toolToCat = buildToolToCategory();
  const slugs = [...toolToCat.keys()];
  console.log(`Mapped ${slugs.length} tools to categories from curated file.`);

  // 3) Lấy các bot có slug nằm trong danh sách curated
  const bots = await Bot.find(
    { slug: { $in: slugs } },
    { _id: 1, slug: 1, category: 1 }
  ).lean();

  const writeOps = [];
  for (const b of bots) {
    const cat = toolToCat.get(b.slug);
    if (!cat) continue;

    // Nếu đã có category mà không FORCE thì bỏ qua (tránh ghi đè ngoài ý muốn)
    if (b.category && !FORCE && b.category === cat) continue;
    if (b.category && !FORCE && b.category !== cat) continue;

    writeOps.push({
      updateOne: {
        filter: { _id: b._id },
        update: { $set: { category: cat } },
      },
    });
  }

  if (!writeOps.length) {
    console.log("Nothing to update. (No matched bots or FORCE disabled)");
  } else if (DRY_RUN) {
    console.log(
      `[DRY_RUN] Will update ${writeOps.length} bots, not writing to DB.`
    );
  } else {
    const res = await Bot.bulkWrite(writeOps, { ordered: false });
    console.log(
      `Updated ${res.modifiedCount || 0} bots (matched: ${res.matchedCount}).`
    );
  }

  // 4) Thống kê lại
  const stat = await Bot.aggregate([
    { $group: { _id: "$category", c: { $sum: 1 } } },
    { $sort: { c: -1, _id: 1 } },
  ]);
  console.table(stat);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
