// scripts/export-tool-map.js
import { categories } from "../seed-data/category.js"; // đường dẫn đúng đến file category.js
const rows = [];
for (const c of categories) {
  const tagList = Array.isArray(c.tags)
    ? c.tags
    : Array.isArray(c.tagses)
    ? c.tagses
    : [];
  for (const t of tagList) {
    for (const tool of t.tools || []) {
      const slug = String(tool?.key || "")
        .trim()
        .toLowerCase();
      if (!slug) continue;
      // mỗi tool 1 hàng: slug -> category (key của danh mục)
      rows.push({ slug, category: c.key });
    }
  }
}
console.log(JSON.stringify(rows, null, 2));
