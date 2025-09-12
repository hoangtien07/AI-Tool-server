// seed-data/reset-bot-categories.mjs
import "dotenv/config";
import { MongoClient } from "mongodb";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---- Config ----
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://hoangtien07:tienpro0711@mydb.ycsagsl.mongodb.net/?retryWrites=true&w=majority&appName=mydb";
const DB_NAME = process.env.DB_NAME || "test";
const COLL_NAME = "bot_categories";

// Đường dẫn đến file gốc (sửa lại cho đúng repo của bạn)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const importSource = path.resolve(__dirname, "./groupsData.ts"); // <-- file gốc

// Tên các thuộc tính có thể có trong file gốc
const pick = (obj, ...keys) =>
  keys.find((k) => obj && obj[k] != null)
    ? obj[keys.find((k) => obj[k] != null)]
    : undefined;
const toSlug = (s = "") =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase()
    .trim();

function normalizeCategories(rawArr) {
  // chấp nhận nhiều cấu trúc khác nhau: [{key, name:{vi,en}}], hoặc [{key, vi, en}], hoặc [{title:{vi,en}}, ...]
  return rawArr.map((g, idx) => {
    const key =
      g.key?.toString().trim().toLowerCase() ||
      g.slug?.toString().trim().toLowerCase() ||
      toSlug(
        pick(g, "en", "EN", "nameEn", "titleEn", "title?.en", "name?.en") || ""
      );

    const vi =
      pick(g, "vi", "VI", "nameVi", "titleVi", "name?.vi", "title?.vi") ||
      g?.name?.vi ||
      g?.title?.vi ||
      "";
    const en =
      pick(g, "en", "EN", "nameEn", "titleEn", "name?.en", "title?.en") ||
      g?.name?.en ||
      g?.title?.en ||
      "";

    const order = typeof g.order === "number" ? g.order : idx;
    const icon = g.icon ?? g?.iconName ?? null;

    return {
      key,
      name: { vi: String(vi || "").trim(), en: String(en || "").trim() },
      order,
      icon,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });
}

function validate(cats) {
  const errors = [];
  // key rỗng
  cats.forEach((c, i) => {
    if (!c.key) errors.push(`Row ${i} missing key`);
    if (!c.name?.vi && !c.name?.en) errors.push(`Row ${i} missing name.vi/en`);
  });

  // trùng key
  const dup = cats.reduce((m, c) => ((m[c.key] = (m[c.key] || 0) + 1), m), {});
  const dups = Object.entries(dup)
    .filter(([, n]) => n > 1)
    .map(([k]) => k);
  if (dups.length) errors.push(`Duplicate keys: ${dups.join(", ")}`);

  return errors;
}

(async () => {
  console.log("Connecting to MongoDB…");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const coll = db.collection(COLL_NAME);

  // Import file gốc (.ts) — yêu cầu export một trong các tên sau:
  //   BOT_CATEGORIES / CATEGORIES / GROUPS / groups / categories
  console.log("Loading source:", importSource);
  const mod = await import(importSource);
  const source =
    mod.BOT_CATEGORIES ||
    mod.CATEGORIES ||
    mod.GROUPS ||
    mod.groups ||
    mod.categories;

  if (!Array.isArray(source)) {
    console.error(
      "❌ Không tìm thấy mảng category trong groupsData.ts. Hãy export một mảng với tên BOT_CATEGORIES/CATEGORIES/GROUPS/groups/categories."
    );
    process.exit(1);
  }

  let cats = normalizeCategories(source);
  const errs = validate(cats);
  if (errs.length) {
    console.error("❌ Dữ liệu category lỗi:");
    errs.forEach((e) => console.error(" -", e));
    process.exit(1);
  }

  // Nếu collection đang tồn tại và bạn đã drop bằng mongosh thì insert mới;
  // nếu chưa drop, bạn có thể xoá sạch tại đây (bật tùy chọn)
  const DROP_FIRST = (process.env.DROP_FIRST || "0") === "1";
  if (DROP_FIRST) {
    await coll.drop().catch(() => {});
  }

  // Tạo index unique cho key
  await coll.createIndex({ key: 1 }, { unique: true });

  // Insert mới
  if (DROP_FIRST) {
    const r = await coll.insertMany(cats);
    console.log(`✅ Inserted ${r.insertedCount} categories.`);
  } else {
    // upsert theo key (nếu bạn không drop)
    let upserts = 0;
    for (const c of cats) {
      const r = await coll.updateOne(
        { key: c.key },
        {
          $set: { ...c, updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
      if (r.upsertedCount || r.matchedCount) upserts++;
    }
    console.log(`✅ Upserted ${upserts} categories.`);
  }

  const count = await coll.countDocuments();
  console.log("Total categories:", count);

  await client.close();
  console.log("Done.");
})();
