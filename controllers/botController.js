import Bot from "../models/Bot.js";

/* —— utils i18n + highlight —— */
const LANGS = ["vi","en"];
const normLang = (v)=> LANGS.includes(String(v).toLowerCase()) ? String(v).toLowerCase() : "vi";
const pickMap = (m = {}, lang = "vi") => {
  const L = normLang(lang); const O = L === "vi" ? "en" : "vi";
  const get = (obj, key) => (obj?.get ? obj.get(key) : obj?.[key]);
  return get(m, L) || get(m, O) || "";
};
const pickList = (list = [], lang = "vi") =>
  (Array.isArray(list) ? list : [])
    .map((x) => x?.[lang] ?? x?.[lang === "vi" ? "en" : "vi"] ?? "")
    .filter(Boolean);

const escHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const escRe = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const qToRegex = (q, flags = "i") => {
  const parts = (String(q).match(/"([^"]+)"|(\S+)/g) || [])
    .map((x) => x.replaceAll('"', ""))
    .map(escRe)
    .filter(Boolean);
  return parts.length ? new RegExp("(" + parts.join("|") + ")", flags) : null;
};
const hi = (raw = "", re) =>
  re ? escHtml(raw).replace(re, "<mark>$1</mark>") : escHtml(raw);
const snippet = (raw = "", re) => {
  if (!raw) return "";
  if (!re) return escHtml(raw.length > 200 ? raw.slice(0, 200) + "…" : raw);
  const i = raw.search(re);
  if (i < 0) return escHtml(raw.length > 200 ? raw.slice(0, 200) + "…" : raw);
  const start = Math.max(0, i - 80);
  const end = Math.min(raw.length, i + 120);
  const html = hi(raw.slice(start, end), re);
  return (start > 0 ? "…" : "") + html + (end < raw.length ? "…" : "");
};
const resolveLang = (req) => {
  const q = String(req.query.lang || "").toLowerCase();
  if (q === "en") return "en";
  if (q === "vi") return "vi";
  const h = String(req.headers["accept-language"] || "").toLowerCase();
  return h.startsWith("en") ? "en" : "vi";
};
const dupKey = (res, err) => {
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0];
    const value = err.keyValue?.[field];
    res.status(409).json({ message: `${field} already exists`, field, value });
    return true;
  }
  return false;
};

/* chuyển legacy (đơn ngữ) → đa ngữ */
const asLoc = (v) => (typeof v === "string" ? { vi: v, en: v } : v);
const toLocList = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((x) => (typeof x === "string" ? { vi: x, en: x } : x))
    .filter((x) => x && (x.vi || x.en));
const toLocPricing = (arr) =>
  (Array.isArray(arr) ? arr : []).map((p) => ({
    plan: asLoc(p?.plan),
    priceText: asLoc(p?.priceText),
    amount: p?.amount,
    currency: p?.currency || "USD",
    interval: p?.interval || "month",
  }));

const parseMaybeJSON = (v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

/* ——— CREATE ——— */
export async function createBot(req, res, next) {
  try {
    const raw = req.body || {};
    // Nếu client gửi form-data/urlencoded, các field dưới có thể là string → parse
    const b = {
      ...raw,
      features: parseMaybeJSON(raw.features),
      strengths: parseMaybeJSON(raw.strengths),
      weaknesses: parseMaybeJSON(raw.weaknesses),
      targetUsers: parseMaybeJSON(raw.targetUsers),
      pricing: parseMaybeJSON(raw.pricing),
      name: parseMaybeJSON(raw.name),
      title: parseMaybeJSON(raw.title),
      summary: parseMaybeJSON(raw.summary),
      description: parseMaybeJSON(raw.description),
    };

    if (!b.name) return res.status(400).json({ message: "name is required" });

    // các helper i18n như trong file hiện tại của bạn
    const asLoc = (v) => (typeof v === "string" ? { vi: v, en: v } : v);
    const toLocList = (arr) =>
      (Array.isArray(arr) ? arr : [])
        .map((x) => (typeof x === "string" ? { vi: x, en: x } : x))
        .filter((x) => x && (x.vi || x.en));
    const toLocPricing = (arr) =>
      (Array.isArray(arr) ? arr : []).map((p) => ({
        plan: asLoc(p?.plan),
        priceText: asLoc(p?.priceText),
        amount: p?.amount,
        currency: p?.currency || "USD",
        interval: p?.interval || "month",
      }));

    const doc = new Bot({
      externalKey: b.externalKey,
      name: asLoc(b.name) || b.name,
      title: asLoc(b.title) || b.title,
      summary: asLoc(b.summary) || b.summary,
      description: asLoc(b.description) || b.description,

      features: toLocList(b.features),
      strengths: toLocList(b.strengths),
      weaknesses: toLocList(b.weaknesses),
      targetUsers: toLocList(b.targetUsers),

      pricing: toLocPricing(b.pricing),

      image: b.image,
      affiliateLink: b.affiliateLink,
      originUrl: b.originUrl,
      headquarters: b.headquarters,
      foundedYear: b.foundedYear,
      category: b.category,
      tags: b.tags || [],
      seo: b.seo,
      status: b.status || "active",
      slug: b.slug,
    });

    await doc.ensureUniqueSlug();
    await doc.save();
    res.status(201).json(doc.toObject({ versionKey: false }));
  } catch (e) {
    if (e?.code === 11000) {
      const field = Object.keys(e.keyPattern || {})[0];
      return res.status(409).json({ message: `${field} already exists` });
    }
    next(e);
  }
}


/* ——— LIST + SEARCH + HIGHLIGHT ——— */
export async function listBots(req, res, next) {
  try {
    const lang = resolveLang(req);
    const {
      q,
      tag,
      category,
      status = "active",
      page = 1,
      limit = 12,
      skip,
    } = req.query;

    const reMongo = q ? qToRegex(q, "i") : null;
    const reHi = q ? qToRegex(q, "ig") : null;

    const filter = {};
    if (status) filter.status = status;
    if (tag) filter.tags = tag;
    if (category) filter.category = category;
    if (reMongo) {
      filter.$or = [
        { "name.vi": { $regex: reMongo } },
        { "name.en": { $regex: reMongo } },
        { "title.vi": { $regex: reMongo } },
        { "title.en": { $regex: reMongo } },
        { "summary.vi": { $regex: reMongo } },
        { "summary.en": { $regex: reMongo } },
        { "description.vi": { $regex: reMongo } },
        { "description.en": { $regex: reMongo } },

        { "features.vi": { $regex: reMongo } },
        { "features.en": { $regex: reMongo } },
        { "strengths.vi": { $regex: reMongo } },
        { "strengths.en": { $regex: reMongo } },
        { "weaknesses.vi": { $regex: reMongo } },
        { "weaknesses.en": { $regex: reMongo } },
        { "targetUsers.vi": { $regex: reMongo } },
        { "targetUsers.en": { $regex: reMongo } },

        { "pricing.plan.vi": { $regex: reMongo } },
        { "pricing.plan.en": { $regex: reMongo } },
        { "pricing.priceText.vi": { $regex: reMongo } },
        { "pricing.priceText.en": { $regex: reMongo } },

        { tags: { $regex: reMongo } },
      ];
    }

    const pageNum =
      skip !== undefined
        ? Math.floor((parseInt(skip, 10) || 0) / (parseInt(limit, 10) || 12)) +
          1
        : Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 100);
    const offset =
      skip !== undefined
        ? Math.max(parseInt(skip, 10) || 0, 0)
        : (pageNum - 1) * limitNum;

    const [total, docs] = await Promise.all([
      Bot.countDocuments(filter),
      Bot.find(filter)
        .sort("-views -updatedAt")
        .skip(offset)
        .limit(limitNum)
        .lean(),
    ]);

    const items = docs.map((d) => {
      const namePref = pickMap(d.name, lang);
      const titlePref = pickMap(d.title, lang);
      const sumPref = pickMap(d.summary, lang);
      const descPref = pickMap(d.description, lang);

      const featuresTxt = pickList(d.features, lang).join(" • ");
      const strengthsTxt = pickList(d.strengths, lang).join(" • ");
      const weaknessesTxt = pickList(d.weaknesses, lang).join(" • ");
      const targetUsersTxt = pickList(d.targetUsers, lang).join(" • ");
      const pricingTxt = (d.pricing || [])
        .map(
          (p) =>
            `${
              p?.plan?.[lang] || p?.plan?.[lang === "vi" ? "en" : "vi"] || ""
            } — ${
              p?.priceText?.[lang] ||
              p?.priceText?.[lang === "vi" ? "en" : "vi"] ||
              ""
            }`
        )
        .filter(Boolean)
        .join(" • ");

      /* ưu tiên snippet theo trường nào match */
      const sources = [
        { raw: sumPref, field: `summary.${lang}` },
        { raw: descPref, field: `description.${lang}` },
        { raw: featuresTxt, field: `features.${lang}` },
        { raw: strengthsTxt, field: `strengths.${lang}` },
        { raw: weaknessesTxt, field: `weaknesses.${lang}` },
        { raw: targetUsersTxt, field: `targetUsers.${lang}` },
        { raw: pricingTxt, field: `pricing.${lang}` },
        { raw: titlePref || namePref, field: "title/name" },
      ];
      let chosen =
        sources.find((s) => reHi && s.raw && reHi.test(s.raw)) ||
        sources.find((s) => s.raw) ||
        sources[7];

      const nameHighlighted =
        reHi && namePref && reHi.test(namePref)
          ? hi(namePref, reHi)
          : undefined;
      const titleHighlighted =
        reHi && titlePref && reHi.test(titlePref)
          ? hi(titlePref, reHi)
          : undefined;
      const tagsHighlighted = Array.isArray(d.tags)
        ? d.tags.map((t) => (reHi ? hi(t, reHi) : escHtml(t)))
        : [];

      return {
        _id: d._id,
        slug: d.slug,
        image: d.image,
        category: d.category,
        tags: d.tags || [],
        tagsHighlighted,
        views: d.views,
        clicks: d.clicks,
        status: d.status,
        updatedAt: d.updatedAt,

        name: namePref || "",
        title: titlePref || "",
        nameHighlighted,
        titleHighlighted,
        summary: sumPref || "",
        snippet: snippet(chosen.raw || "", reHi), // HTML
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
    });
  } catch (e) {
    next(e);
  }
}

/* ——— FACETS ——— */
export async function getBotFacets(req, res, next) {
  try {
    const { q, tag, category, status = "active" } = req.query;
    const reMongo = q ? qToRegex(q, "i") : null;

    const filter = {};
    if (status) filter.status = status;
    if (tag) filter.tags = tag;
    if (category) filter.category = category;
    if (reMongo) {
      filter.$or = [
        { "name.vi": { $regex: reMongo } },
        { "name.en": { $regex: reMongo } },
        { "title.vi": { $regex: reMongo } },
        { "title.en": { $regex: reMongo } },
        { "features.vi": { $regex: reMongo } },
        { "features.en": { $regex: reMongo } },
        { "strengths.vi": { $regex: reMongo } },
        { "strengths.en": { $regex: reMongo } },
        { tags: { $regex: reMongo } },
      ];
    }

    const [categories, tagsAgg] = await Promise.all([
      Bot.aggregate([
        { $match: filter },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Bot.aggregate([
        { $match: filter },
        { $unwind: "$tags" },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    res.json({
      categories: categories
        .filter((c) => c._id && c._id !== "")
        .map((c) => ({ value: c._id, count: c.count })),
      tags: tagsAgg.map((t) => ({ value: t._id, count: t.count })),
    });
  } catch (e) {
    next(e);
  }
}

/* ——— DETAIL ——— */
export async function getBotBySlug(req, res, next) {
  try {
    const lang = (req.query.lang || req.headers["x-lang"] || "vi")
      .toString()
      .toLowerCase();
    const doc = await Bot.findOne({ slug: req.params.slug }).lean(); // <- thêm lean()
    if (!doc) return res.status(404).json({ message: "Bot not found" });

    res.json({
      ...doc,
      resolved: {
        lang,
        name: pickMap(doc.name, lang),
        title: pickMap(doc.title, lang),
        summary: pickMap(doc.summary, lang),
        description: pickMap(doc.description, lang),
        features: pickList(doc.features, lang),
        strengths: pickList(doc.strengths, lang),
        weaknesses: pickList(doc.weaknesses, lang),
        targetUsers: pickList(doc.targetUsers, lang),
        pricing: (doc.pricing || []).map((p) => ({
          plan: p?.plan?.[lang] || p?.plan?.[lang === "vi" ? "en" : "vi"] || "",
          priceText:
            p?.priceText?.[lang] ||
            p?.priceText?.[lang === "vi" ? "en" : "vi"] ||
            "",
          amount: p?.amount,
          currency: p?.currency,
          interval: p?.interval,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
}

export async function getBotById(req, res, next) {
  try {
    const lang = resolveLang(req);
    const doc = await Bot.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Bot not found" });
    const json = doc.toObject({ versionKey: false });
    res.json({
      ...json,
      resolved: {
        lang,
        name: pickMap(json.name, lang),
        title: pickMap(json.title, lang),
        summary: pickMap(json.summary, lang),
        description: pickMap(json.description, lang),
        features: pickList(json.features, lang),
        strengths: pickList(json.strengths, lang),
        weaknesses: pickList(json.weaknesses, lang),
        targetUsers: pickList(json.targetUsers, lang),
        pricing: (json.pricing || []).map((p) => ({
          plan: p?.plan?.[lang] || p?.plan?.[lang === "vi" ? "en" : "vi"] || "",
          priceText:
            p?.priceText?.[lang] ||
            p?.priceText?.[lang === "vi" ? "en" : "vi"] ||
            "",
          amount: p?.amount,
          currency: p?.currency,
          interval: p?.interval,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
}

/* ——— UPDATE ——— */
export async function updateBot(req, res, next) {
  try {
    const id = req.params.id;
    const b = req.body || {};
    const lang = b.lang ? normLang(b.lang) : null;

    const doc = await Bot.findById(id);
    if (!doc) return res.status(404).json({ message: "Bot not found" });

    /* i18n text (cho phép gửi string + lang, hoặc object vi/en) */
    const setText = (field) => {
      if (typeof b[field] === "string" && lang) {
        const map = doc[field] || new Map();
        map.set ? map.set(lang, b[field]) : (map[lang] = b[field]);
        doc[field] = map;
      } else if (b[field] && typeof b[field] === "object") {
        const map = doc[field] || new Map();
        if (typeof b[field].vi === "string")
          map.set ? map.set("vi", b[field].vi) : (map.vi = b[field].vi);
        if (typeof b[field].en === "string")
          map.set ? map.set("en", b[field].en) : (map.en = b[field].en);
        doc[field] = map;
      }
    };
    ["name", "title", "summary", "description"].forEach(setText);

    /* i18n list */
    const mergeLocList = (oldArr = [], incoming) => {
      if (!incoming) return oldArr;
      if (
        Array.isArray(incoming) &&
        incoming.every((x) => typeof x === "string") &&
        lang
      ) {
        const out = [...oldArr];
        incoming.forEach((val, i) => {
          const cur = out[i] || {};
          out[i] = { ...cur, [lang]: val };
        });
        return out.slice(0, incoming.length);
      }
      return toLocList(incoming);
    };
    if (b.features !== undefined)
      doc.features = mergeLocList(doc.features, b.features);
    if (b.strengths !== undefined)
      doc.strengths = mergeLocList(doc.strengths, b.strengths);
    if (b.weaknesses !== undefined)
      doc.weaknesses = mergeLocList(doc.weaknesses, b.weaknesses);
    if (b.targetUsers !== undefined)
      doc.targetUsers = mergeLocList(doc.targetUsers, b.targetUsers);

    /* pricing i18n */
    const mergePricing = (oldArr = [], incoming) => {
      if (!incoming) return oldArr;
      if (
        Array.isArray(incoming) &&
        incoming.every(
          (x) => typeof x?.plan === "string" || typeof x?.priceText === "string"
        ) &&
        lang
      ) {
        const out = [...oldArr];
        incoming.forEach((p, i) => {
          const cur = out[i] || {};
          out[i] = {
            plan: {
              ...(cur.plan || {}),
              [lang]: p.plan ?? cur?.plan?.[lang] ?? "",
            },
            priceText: {
              ...(cur.priceText || {}),
              [lang]: p.priceText ?? cur?.priceText?.[lang] ?? "",
            },
            amount: p.amount ?? cur.amount,
            currency: p.currency ?? cur.currency ?? "USD",
            interval: p.interval ?? cur.interval ?? "month",
          };
        });
        return out.slice(0, incoming.length);
      }
      return toLocPricing(incoming);
    };
    if (b.pricing !== undefined)
      doc.pricing = mergePricing(doc.pricing, b.pricing);

    /* non-i18n */
    [
      "image",
      "affiliateLink",
      "originUrl",
      "headquarters",
      "foundedYear",
      "category",
      "seo",
      "status",
    ].forEach((k) => {
      if (b[k] !== undefined) doc[k] = b[k];
    });
    if (Array.isArray(b.tags)) doc.tags = b.tags;

    if (typeof b.slug === "string" && b.slug.trim()) doc.slug = b.slug.trim();

    await doc.ensureUniqueSlug();
    await doc.save();
    res.json(doc.toObject({ versionKey: false }));
  } catch (e) {
    if (!dupKey(res, e)) next(e);
  }
}

/* ——— DELETE / METRICS / TOP ——— */
export async function deleteBot(req, res, next) {
  try {
    const del = await Bot.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ message: "Bot not found" });
    res.json({ deleted: true, _id: del._id });
  } catch (e) {
    next(e);
  }
}

export async function incViews(req, res, next) {
  try {
    const doc = await Bot.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Bot not found" });
    res.json({ views: doc.views });
  } catch (e) {
    next(e);
  }
}

export async function trackClick(req, res, next) {
  try {
    const doc = await Bot.findByIdAndUpdate(
      req.params.id,
      { $inc: { clicks: 1 } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Bot not found" });
    res.json({ clicks: doc.clicks });
  } catch (e) {
    next(e);
  }
}

export async function topBots(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const items = await Bot.find({ status: "active" })
      .sort("-views")
      .limit(limit);
    res.json(items);
  } catch (e) {
    next(e);
  }
}
