// controllers/searchController.js — DROP-IN
import Bot from "../models/Bot.js";
import Blog from "../models/Blog.js";

/* ============ utils ============ */
const escHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const escRe = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (q, flags = "i") => {
  const parts = (String(q).match(/"([^"]+)"|(\S+)/g) || [])
    .map((x) => x.replaceAll('"', ""))
    .map(escRe)
    .filter(Boolean);
  return parts.length ? new RegExp("(" + parts.join("|") + ")", flags) : null;
};
const hi = (raw = "", re) =>
  re ? escHtml(raw).replace(re, "<mark>$1</mark>") : escHtml(raw);
const makeSnippet = (raw = "", re, max = 160) => {
  if (!raw) return "";
  if (!re) return escHtml(raw.length > max ? raw.slice(0, max) + "…" : raw);
  const i = raw.search(re);
  if (i < 0) return escHtml(raw.length > max ? raw.slice(0, max) + "…" : raw);
  const start = Math.max(0, i - Math.floor((max - 1) / 2));
  const end = Math.min(raw.length, start + max);
  return (
    (start > 0 ? "…" : "") +
    hi(raw.slice(start, end), re) +
    (end < raw.length ? "…" : "")
  );
};

const LANGS = ["vi", "en"];
const normLang = (v) =>
  LANGS.includes(String(v).toLowerCase()) ? String(v).toLowerCase() : "vi";
const pickMap = (m = {}, lang = "vi") => {
  const L = normLang(lang);
  const O = L === "vi" ? "en" : "vi";
  const get = (obj, key) => (obj?.get ? obj.get(key) : obj?.[key]);
  return get(m, L) || get(m, O) || "";
};
const pickList = (list = [], lang = "vi") =>
  (Array.isArray(list) ? list : [])
    .map((x) => x?.[lang] ?? x?.[lang === "vi" ? "en" : "vi"] ?? "")
    .filter(Boolean);
const resolveLang = (req) => {
  const q = String(req.query.lang || "").toLowerCase();
  if (q === "en") return "en";
  if (q === "vi") return "vi";
  const h = String(req.headers["accept-language"] || "").toLowerCase();
  return h.startsWith("en") ? "en" : "vi";
};

/* ============ BOT SEARCH ============ */
async function searchBots(q, lang, skip = 0, limit = 5, categoryRaw = "") {
  const cats = String(categoryRaw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const base = { status: { $ne: "inactive" } };
  if (cats.length) base.category = { $in: cats }; 

  const re = toRegex(q, "ig");

  // 1) full-text
  let textItems = [];
  let totalText = 0;
  try {
    const textFilter = { ...base, $text: { $search: q } };
    textItems = await Bot.find(textFilter, { score: { $meta: "textScore" } })
      .sort({ score: { $meta: "textScore" }, views: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();
    totalText = await Bot.countDocuments(textFilter);
  } catch (_) {}

  // 2) regex i18n
  const regexFilter = {
    ...base,
    $or: [
      { "name.vi": { $regex: re } },
      { "name.en": { $regex: re } },
      { "title.vi": { $regex: re } },
      { "title.en": { $regex: re } },
      { "summary.vi": { $regex: re } },
      { "summary.en": { $regex: re } },
      { "description.vi": { $regex: re } },
      { "description.en": { $regex: re } },
      { "features.vi": { $regex: re } },
      { "features.en": { $regex: re } },
      { "strengths.vi": { $regex: re } },
      { "strengths.en": { $regex: re } },
      { "weaknesses.vi": { $regex: re } },
      { "weaknesses.en": { $regex: re } },
      { "targetUsers.vi": { $regex: re } },
      { "targetUsers.en": { $regex: re } },
      { "pricing.plan.vi": { $regex: re } },
      { "pricing.plan.en": { $regex: re } },
      { "pricing.priceText.vi": { $regex: re } },
      { "pricing.priceText.en": { $regex: re } },
      { tags: { $regex: re } },
    ],
  };
  const regexItems = await Bot.find(regexFilter)
    .sort("-views")
    .limit(Number(limit) * 2)
    .lean();

  // 3) Hợp nhất (ưu tiên full-text), map sang dạng FE
  const map = new Map();
  [...textItems, ...regexItems].forEach((d) => map.set(String(d._id), d));

  const items = Array.from(map.values())
    .slice(0, Number(limit))
    .map((d) => {
      const namePref = pickMap(d.name, lang);
      const titlePref = pickMap(d.title, lang);
      const sumPref = pickMap(d.summary, lang);
      const descPref = pickMap(d.description, lang);
      const featuresTxt = pickList(d.features, lang).join(" • ");
      const strengthsTxt = pickList(d.strengths, lang).join(" • ");
      const weaknessesTxt = pickList(d.weaknesses, lang).join(" • ");
      const targetUsersTxt = pickList(d.targetUsers, lang).join(" • ");
      const pricingTxt = (d.pricing || [])
        .map((p) => {
          const plan =
            p?.plan?.[lang] || p?.plan?.[lang === "vi" ? "en" : "vi"] || "";
          const price =
            p?.priceText?.[lang] ||
            p?.priceText?.[lang === "vi" ? "en" : "vi"] ||
            "";
          return plan && price ? `${plan} — ${price}` : plan || price;
        })
        .filter(Boolean)
        .join(" • ");

      const sources = [
        sumPref,
        descPref,
        featuresTxt,
        strengthsTxt,
        weaknessesTxt,
        targetUsersTxt,
        pricingTxt,
        titlePref || namePref,
      ].filter(Boolean);
      const chosen =
        sources.find((s) => re && s && re.test(s)) || sources[0] || "";

      return {
        _id: String(d._id),
        type: "bot",
        name: namePref || titlePref || "",
        slug: d.slug,
        image: d.image,
        views: d.views,
        snippet: makeSnippet(chosen, re) || "",
      };
    });

  const totalRegex = await Bot.countDocuments(regexFilter).catch(() => 0);
  return { total: Math.max(totalText, totalRegex), items };
}

/* ============ BLOG SEARCH ============ */
async function searchBlogs(q, lang, skip = 0, limit = 5) {
  const re = toRegex(q, "ig");

  // 1) Thử full-text
  let textItems = [];
  let totalText = 0;
  try {
    textItems = await Blog.find(
      { $text: { $search: q } },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" }, publishedAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();
    totalText = await Blog.countDocuments({ $text: { $search: q } });
  } catch (_) {}

  // 2) Fallback regex i18n (title/excerpt/content + tags)
  const regexFilter = {
    $or: [
      { "title.vi": { $regex: re } },
      { "title.en": { $regex: re } },
      { "excerpt.vi": { $regex: re } },
      { "excerpt.en": { $regex: re } },
      { "content.vi.text": { $regex: re } },
      { "content.en.text": { $regex: re } },
      { tags: { $regex: re } },
    ],
  };
  const regexItems = await Blog.find(regexFilter)
    .sort("-publishedAt")
    .limit(Number(limit) * 2)
    .lean();

  // 3) Hợp nhất (ưu tiên full-text), map sang dạng FE
  const map = new Map();
  [...textItems, ...regexItems].forEach((d) => map.set(String(d._id), d));

  const items = Array.from(map.values())
    .slice(0, Number(limit))
    .map((d) => {
      const titleL =
        lang === "vi"
          ? d?.title?.vi || d?.title?.en
          : d?.title?.en || d?.title?.vi;
      const excerptL =
        lang === "vi"
          ? d?.excerpt?.vi || d?.excerpt?.en
          : d?.excerpt?.en || d?.excerpt?.vi;
      const textL =
        lang === "vi"
          ? d?.content?.vi?.text || d?.content?.en?.text
          : d?.content?.en?.text || d?.content?.vi?.text;

      const sources = [excerptL, textL, titleL].filter(Boolean);
      const chosen =
        sources.find((s) => re && s && re.test(s)) || sources[0] || "";

      return {
        _id: String(d._id),
        type: "blog",
        title: titleL || "",
        slug: d.slug || String(d._id),
        image: d.image,
        views: d.views,
        snippet: makeSnippet(chosen, re) || "",
      };
    });

  const totalRegex = await Blog.countDocuments(regexFilter).catch(() => 0);
  return { total: Math.max(totalText, totalRegex), items };
}

/* ============ GET /api/search ============ */
export async function globalSearch(req, res, next) {
  try {
    const q = (req.query.q || "").trim();
    const tab = (req.query.tab || "all").toLowerCase();
    const limitBots = Number(req.query.limitBots || 5);
    const limitBlogs = Number(req.query.limitBlogs || 5);
    const skipBots = Number(req.query.skipBots || 0);
    const skipBlogs = Number(req.query.skipBlogs || 0);
    const lang = resolveLang(req);

    // 👇 NEW: nhận category (đa giá trị)
    const category = (
      req.query.category ||
      req.query.categories ||
      ""
    ).toString();

    if (!q) return res.status(400).json({ message: "q is required" });

    const [bots, blogs] = await Promise.all([
      tab === "blogs"
        ? { total: 0, items: [] }
        : searchBots(q, lang, skipBots, limitBots, category), // <-- truyền category
      tab === "bots"
        ? { total: 0, items: [] }
        : searchBlogs(q, lang, skipBlogs, limitBlogs),
    ]);

    res.json({
      query: q,
      lang,
      counts: { bots: bots.total, blogs: blogs.total },
      tabs: { bots: bots.items, blogs: blogs.items },
    });
  } catch (err) {
    next(err);
  }
}

