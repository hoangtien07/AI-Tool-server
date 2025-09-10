// controllers/blogController.js
import Blog from "../models/Blog.js";
import createDOMPurify from "isomorphic-dompurify";
import { JSDOM } from "jsdom";
import mongoose from "mongoose";

const DOMPurify = createDOMPurify(new JSDOM("").window);

// ───────────── utils
function sanitizeHtml(rawHtml = "") {
  return DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
}
function htmlToText(html = "") {
  const { window } = new JSDOM(`<body>${html}</body>`);
  return (window.document.body.textContent || "").trim();
}
const LANGS = ["vi", "en"];
function normalizeLang(input) {
  const l = String(input || "").toLowerCase();
  return LANGS.includes(l) ? l : "vi";
}
function pickLocalized(fieldObj, lang) {
  const L = normalizeLang(lang);
  const other = L === "vi" ? "en" : "vi";
  const obj = fieldObj || {};

  // rich object (content)
  const prefer = obj?.[L];
  const fallback = obj?.[other];
  if (prefer && typeof prefer === "object") {
    const hasPrefer =
      (prefer.html && prefer.html.trim()) ||
      (prefer.raw && String(prefer.raw).trim()) ||
      (prefer.text && prefer.text.trim());
    if (hasPrefer) return prefer;
    return fallback || prefer || null;
  }

  // string (title/excerpt)
  const preferStr = typeof prefer === "string" ? prefer.trim() : "";
  const fallbackStr = typeof fallback === "string" ? fallback.trim() : "";
  return preferStr || fallbackStr || prefer || fallback || null;
}

// Gói content thành {raw, html, text}
function pack(input) {
  const raw =
    input?.raw ?? input?.html ?? (typeof input === "string" ? input : "");
  const html = sanitizeHtml(raw || "");
  const text = htmlToText(html);
  return { raw, html, text };
}

// Fallback-safe finder (dùng ở mọi nơi)
async function findByKey(key) {
  if (Blog.findByBlogKey) return Blog.findByBlogKey(key);
  const isId = mongoose.Types.ObjectId.isValid(key);
  return isId
    ? Blog.findOne({ $or: [{ slug: key }, { _id: key }] })
    : Blog.findOne({ slug: key });
}

// POST /api/blogs
export async function createBlog(req, res, next) {
  try {
    const b = req.body || {};
    let doc;

    // Cho phép “đơn ngữ legacy”: { lang, title: String, content: String }
    const isSingleLang =
      typeof b.lang === "string" &&
      typeof b.title === "string" &&
      (typeof b.raw === "string" || typeof b.content === "string");

    if (isSingleLang) {
      const L = normalizeLang(b.lang);
      const O = L === "vi" ? "en" : "vi";
      const cnt = pack(b.raw ?? b.content ?? "");
      const excerpt = b.excerpt ?? cnt.text.slice(0, 220);

      doc = new Blog({
        title: { [L]: b.title, [O]: b.title },
        excerpt: { [L]: excerpt, [O]: excerpt },
        content: { [L]: cnt, [O]: cnt },
        slug: b.slug,
        image: b.image,
        tags: b.tags ?? [],
        status: b.status ?? "active",
        publishedAt: b.publishedAt,
        source: b.source ?? "manual",
        sourceUrl: b.sourceUrl,
      });
    } else {
      // ĐA NGỮ CHUẨN
      if (!b?.title?.vi || !b?.title?.en) {
        return res
          .status(400)
          .json({ message: "title.vi và title.en là bắt buộc" });
      }
      const vi = pack(b?.content?.vi ?? "");
      const en = pack(b?.content?.en ?? "");
      const excerptVi = b?.excerpt?.vi ?? vi.text.slice(0, 220);
      const excerptEn = b?.excerpt?.en ?? en.text.slice(0, 220);

      doc = new Blog({
        title: { vi: b.title.vi, en: b.title.en },
        excerpt: { vi: excerptVi, en: excerptEn },
        content: { vi, en },
        slug: b.slug,
        image: b.image,
        tags: b.tags ?? [],
        status: b.status ?? "active",
        publishedAt: b.publishedAt,
        source: b.source ?? "notion",
        sourceUrl: b.sourceUrl,
      });
    }

    await doc.ensureUniqueSlug();
    await doc.save();
    res.status(201).json(doc);
  } catch (e) {
    if (e?.name === "ValidationError") {
      const details = Object.values(e.errors).map((er) => er.path);
      return res
        .status(422)
        .json({ message: "Validation failed", fields: details });
    }
    next(e);
  }
}

// ====== helpers ======
const escapeHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeRe = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// q: `'slow motion' video` -> /(slow motion|video)/i  (flags tuỳ chọn)
function buildQueryRegex(q, flags = "i") {
  const parts = (String(q).match(/"([^"]+)"|(\S+)/g) || [])
    .map((x) => x.replaceAll('"', ""))
    .map(escapeRe)
    .filter(Boolean);
  if (!parts.length) return null;
  return new RegExp("(" + parts.join("|") + ")", flags);
}

function highlightHTML(src = "", re) {
  if (!src) return "";
  const safe = escapeHtml(src);
  return re ? safe.replace(re, "<mark>$1</mark>") : safe;
}

function firstMatchIndex(str = "", re) {
  if (!re) return -1;
  return str.search(re);
}

function makeSnippetForField(raw, re) {
  if (!raw) return "";
  const idx = firstMatchIndex(raw, re);
  if (idx < 0) {
    const safe = escapeHtml(raw);
    return safe.length > 200 ? safe.slice(0, 200) + "…" : safe;
  }
  const start = Math.max(0, idx - 80);
  const end = Math.min(raw.length, idx + 120);
  const slice = raw.slice(start, end);
  const html = highlightHTML(slice, re);
  return (start > 0 ? "…" : "") + html + (end < raw.length ? "…" : "");
}

function resolveLang(req) {
  const q = String(req.query.lang || "").toLowerCase();
  if (q === "en") return "en";
  if (q === "vi") return "vi";
  // fallback theo header
  const h = String(req.headers["accept-language"] || "").toLowerCase();
  return h.startsWith("en") ? "en" : "vi";
}

// ====== controller ======
export async function listBlogs(req, res, next) {
  try {
    const lang = resolveLang(req);
    const { q, tag, status = "active", page = 1, limit = 10, sort } = req.query;

    // Regex cho Mongo (i) và cho highlight (ig)
    const reMongo = q ? buildQueryRegex(q, "i") : null;
    const reHi    = q ? buildQueryRegex(q, "ig") : null;

    // --- filter: title/excerpt/content (vi|en) + tags ---
    const filter = {};
    if (status) filter.status = status;
    if (tag) filter.tags = tag;

    if (reMongo) {
      filter.$or = [
        { "title.vi":         { $regex: reMongo } },
        { "title.en":         { $regex: reMongo } },
        { "excerpt.vi":       { $regex: reMongo } },
        { "excerpt.en":       { $regex: reMongo } },
        { "content.vi.text":  { $regex: reMongo } },
        { "content.en.text":  { $regex: reMongo } },
        { "tags":             { $regex: reMongo } },
      ];
    }

    const pageNum  = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

    const toSortObj = (s) => {
      if (!s) return { publishedAt: -1 };
      const desc = s.startsWith("-");
      const key  = desc ? s.slice(1) : s;
      return { [key]: desc ? -1 : 1 };
    };

    const [total, docs] = await Promise.all([
      Blog.countDocuments(filter),
      Blog.find(filter)
        .sort(toSortObj(typeof sort === "string" ? sort : "-publishedAt"))
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    const items = docs.map((d) => {
      const titleVi   = d.title?.vi || "";
      const titleEn   = d.title?.en || "";
      const excerptVi = d.excerpt?.vi || "";
      const excerptEn = d.excerpt?.en || "";
      const textVi    = d.content?.vi?.text || "";
      const textEn    = d.content?.en?.text || "";

      // title theo ngôn ngữ ưu tiên
      const titlePref = lang === "vi" ? (titleVi || titleEn) : (titleEn || titleVi);

      // highlight riêng cho title nếu tự nó match
      const titleHighlighted =
        reHi && titlePref && reHi.test(titlePref)
          ? highlightHTML(titlePref, reHi)
          : undefined;

      // chọn nguồn để tạo snippet (ưu tiên theo lang hiện tại)
      const sources = [
        { raw: lang === "vi" ? excerptVi : excerptEn, field: `excerpt.${lang}` },
        { raw: lang === "vi" ? textVi    : textEn,    field: `content.${lang}.text` },
        { raw: lang === "vi" ? excerptEn : excerptVi, field: `excerpt.${lang === "vi" ? "en" : "vi"}` },
        { raw: lang === "vi" ? textEn    : textVi,    field: `content.${lang === "vi" ? "en" : "vi"}.text` },
        { raw: titlePref,                                   field: "title" },
      ];

      let picked = sources[0];
      if (reHi) {
        const hit = sources.find((s) => s.raw && reHi.test(s.raw));
        if (hit) picked = hit;
      } else {
        picked = sources[0].raw ? sources[0] : sources[4];
      }

      const snippet = makeSnippetForField(picked.raw || "", reHi);


      return {
        _id: d._id,
        slug: d.slug,
        image: d.image,
        tags: d.tags || [],
        status: d.status,
        publishedAt: d.publishedAt,
        title: titlePref || "",
        titleHighlighted,      // HTML (opt)
        excerpt: (lang === "vi" ? excerptVi : excerptEn) || "",
        snippet,               // HTML, luôn có
        // snippetField: picked.field, // bật nếu muốn debug nguồn
      };
    });

    res.json({
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
      items,
      lang,
      q: q || undefined,
      usedTextSearch: false,
    });
  } catch (err) {
    next(err);
  }
}


// ───────────── DETAIL: GET /api/blogs/:slug?lang=vi
export async function getBlog(req, res, next) {
  try {
    const key = req.params.slug;
    const lang = resolveLang(req);
    const doc = await findByKey(key);
    if (!doc) return res.status(404).json({ message: "Blog not found" });

    const json = doc.toObject({ versionKey: false });
    const resolved = {
      lang,
      title: pickLocalized(json.title, lang),
      excerpt: pickLocalized(json.excerpt, lang),
      content: pickLocalized(json.content, lang),
    };
    res.json({ ...json, resolved });
  } catch (e) {
    next(e);
  }
}

// ───────────── UPDATE: PATCH /api/blogs/:slug  (đơn ngôn ngữ hoặc đa ngôn ngữ)
export async function updateBlog(req, res, next) {
  try {
    const key = req.params.slug;
    const body = req.body || {};
    const doc = await findByKey(key);
    if (!doc) return res.status(404).json({ message: "Blog not found" });

    // title
    if (typeof body.title === "string" && body.lang) {
      const L = normalizeLang(body.lang);
      doc.title[L] = body.title;
    } else if (body.title && typeof body.title === "object") {
      if (typeof body.title.vi === "string") doc.title.vi = body.title.vi;
      if (typeof body.title.en === "string") doc.title.en = body.title.en;
    }

    // excerpt
    if (typeof body.excerpt === "string" && body.lang) {
      const L = normalizeLang(body.lang);
      doc.excerpt[L] = body.excerpt;
    } else if (body.excerpt && typeof body.excerpt === "object") {
      if (typeof body.excerpt.vi === "string") doc.excerpt.vi = body.excerpt.vi;
      if (typeof body.excerpt.en === "string") doc.excerpt.en = body.excerpt.en;
    }

    // content
    if (
      (typeof body.raw === "string" || typeof body.content === "string") &&
      body.lang
    ) {
      const L = normalizeLang(body.lang);
      const packed = pack(body.raw ?? body.content ?? "");
      doc.content[L] = packed;
      if (!doc.excerpt?.[L] || !doc.excerpt[L].trim()) {
        doc.excerpt[L] = packed.text.slice(0, 220);
      }
    } else if (body.content && typeof body.content === "object") {
      if (body.content.vi !== undefined) {
        const vi = pack(body.content.vi);
        doc.content.vi = vi;
        if (!doc.excerpt?.vi || !doc.excerpt.vi.trim()) {
          doc.excerpt.vi = vi.text.slice(0, 220);
        }
      }
      if (body.content.en !== undefined) {
        const en = pack(body.content.en);
        doc.content.en = en;
        if (!doc.excerpt?.en || !doc.excerpt.en.trim()) {
          doc.excerpt.en = en.text.slice(0, 220);
        }
      }
    }

    // fields khác
    if (Array.isArray(body.tags)) doc.tags = body.tags;
    if (typeof body.image === "string") doc.image = body.image;
    if (typeof body.status === "string") doc.status = body.status;
    if (typeof body.source === "string") doc.source = body.source;
    if (typeof body.sourceUrl === "string") doc.sourceUrl = body.sourceUrl;
    if (body.publishedAt) doc.publishedAt = new Date(body.publishedAt);

    // đổi slug thủ công
    if (typeof body.slug === "string" && body.slug.trim())
      doc.slug = body.slug.trim();

    await doc.ensureUniqueSlug();
    await doc.save();
    res.json(doc.toObject({ versionKey: false }));
  } catch (e) {
    if (e?.name === "ValidationError") {
      const fields = Object.values(e.errors).map((er) => er.path);
      return res.status(422).json({ message: "Validation failed", fields });
    }
    next(e);
  }
}

// ───────────── DELETE: DELETE /api/blogs/:slug
export async function deleteBlog(req, res, next) {
  try {
    const key = req.params.slug;
    // Ưu tiên xoá theo slug, nếu không hợp lệ thì thử _id
    const isId = mongoose.Types.ObjectId.isValid(key);
    const del = await Blog.findOneAndDelete(
      isId ? { $or: [{ slug: key }, { _id: key }] } : { slug: key }
    );
    if (!del) return res.status(404).json({ message: "Blog not found" });
    res.json({ deleted: true, _id: del._id });
  } catch (e) {
    next(e);
  }
}
