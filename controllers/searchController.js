import Bot from "../models/Bot.js";
import Blog from "../models/Blog.js";

/* ===== helpers ===== */
const esc = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRx = (q) => new RegExp(`(${esc(q.trim())})`, "i"); // partial, case-insensitive

function snippet(text, rx, max = 160) {
  if (!text) return null;
  const m = text.match(rx);
  if (!m) return null;
  const i = m.index ?? 0;
  const start = Math.max(0, i - Math.floor((max - m[0].length) / 2));
  const end = Math.min(text.length, start + max);
  let s = text.slice(start, end);
  s = s.replace(rx, "<mark>$1</mark>");
  return (start > 0 ? "…" : "") + s + (end < text.length ? "…" : "");
}

function matchedFields(doc, rx, fields) {
  const out = new Set();
  for (const f of fields) {
    const v = doc[f];
    if (typeof v === "string" && rx.test(v)) out.add(f);
    if (Array.isArray(v) && v.some((x) => rx.test(String(x)))) out.add(f);
  }
  return [...out];
}

/* ===== search helpers for each collection ===== */
async function searchBots(q, skip = 0, limit = 5) {
  const base = { status: { $ne: "inactive" } };
  const rx = toRx(q);

  // 1) full-text ưu tiên (độ liên quan)
  let textItems = [],
    totalText = 0;
  try {
    textItems = await Bot.find(
      { ...base, $text: { $search: q } },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" }, views: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    totalText = await Bot.countDocuments({ ...base, $text: { $search: q } });
  } catch (_) {
    /* nếu chưa có text index thì bỏ qua */
  }

  // 2) fallback partial (regex) cho tìm chuỗi con
  const regexFilter = {
    ...base,
    $or: [
      { name: rx },
      { summary: rx },
      { description: rx },
      { tags: { $elemMatch: { $regex: rx } } },
      { features: { $elemMatch: { $regex: rx } } },
    ],
  };
  const regexItems = await Bot.find(regexFilter)
    .sort("-views")
    .limit(Number(limit) * 2);

  // 3) gộp + map ra cấu trúc kết quả
  const map = new Map();
  [...textItems, ...regexItems].forEach((d) => map.set(String(d._id), d));
  const items = Array.from(map.values())
    .slice(0, Number(limit))
    .map((d) => ({
      _id: String(d._id),
      type: "bot",
      name: d.name,
      slug: d.slug,
      image: d.image,
      views: d.views,
      snippet: snippet(d.summary || d.description || d.name, rx) || "",
      matchIn: matchedFields(d, rx, [
        "name",
        "summary",
        "description",
        "tags",
        "features",
      ]),
    }));

  const totalRegex = await Bot.countDocuments(regexFilter).catch(() => 0);
  return { total: Math.max(totalText, totalRegex), items };
}

async function searchBlogs(q, skip = 0, limit = 5) {
  const rx = toRx(q);

  // full-text
  let textItems = [],
    totalText = 0;
  try {
    textItems = await Blog.find(
      { $text: { $search: q } },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" }, views: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    totalText = await Blog.countDocuments({ $text: { $search: q } });
  } catch (_) {}

  // fallback partial (title/content/tags)
  const regexFilter = {
    $or: [
      { title: rx },
      { content: rx },
      { tags: { $elemMatch: { $regex: rx } } },
    ],
  };
  const regexItems = await Blog.find(regexFilter)
    .sort("-views")
    .limit(Number(limit) * 2);

  const map = new Map();
  [...textItems, ...regexItems].forEach((d) => map.set(String(d._id), d));
  const items = Array.from(map.values())
    .slice(0, Number(limit))
    .map((d) => ({
      _id: String(d._id),
      type: "blog",
      title: d.title,
      slug: d._id, // nếu bạn có slug cho blog thì trả slug ở đây
      image: d.image,
      views: d.views,
      snippet:
        snippet((d.content || d.title).replace(/<[^>]*>/g, " "), rx) || "",
      matchIn: matchedFields(d, rx, ["title", "content", "tags"]),
    }));

  const totalRegex = await Blog.countDocuments(regexFilter).catch(() => 0);
  return { total: Math.max(totalText, totalRegex), items };
}

/* ===== main controller: /api/search ===== */
export async function globalSearch(req, res, next) {
  try {
    const q = (req.query.q || "").trim();
    const tab = req.query.tab || "all"; // "bots" | "blogs" | "all"
    const limitBots = Number(req.query.limitBots || 5);
    const limitBlogs = Number(req.query.limitBlogs || 5);
    const skipBots = Number(req.query.skipBots || 0);
    const skipBlogs = Number(req.query.skipBlogs || 0);

    if (!q) return res.status(400).json({ message: "q is required" });

    const [bots, blogs] = await Promise.all([
      tab === "blogs"
        ? { total: 0, items: [] }
        : searchBots(q, skipBots, limitBots),
      tab === "bots"
        ? { total: 0, items: [] }
        : searchBlogs(q, skipBlogs, limitBlogs),
    ]);

    res.json({
      query: q,
      counts: { bots: bots.total, blogs: blogs.total },
      tabs: { bots: bots.items, blogs: blogs.items },
    });
  } catch (err) {
    next(err);
  }
}
