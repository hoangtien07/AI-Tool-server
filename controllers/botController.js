import Bot from "../models/Bot.js";

/** —— Helpers —— */
function duplicateKey(res, err) {
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0];
    const value = err.keyValue?.[field];
    return res
      .status(409)
      .json({ message: `${field} already exists`, field, value });
  }
  return null;
}

const toSlug = (s) =>
  s
    ?.toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "";

/** tạo slug không trùng: base, base-2, base-3... */
async function ensureUniqueSlug(Model, base, excludeId) {
  const baseSlug = toSlug(base);
  let slug = baseSlug;
  let i = 2;
  const ne = excludeId ? { _id: { $ne: excludeId } } : {};
  // lặp tới khi không còn đụng
  // dùng exists() để nhẹ nhàng
  // eslint-disable-next-line no-await-in-loop
  while (await Model.exists({ slug, ...ne })) slug = `${baseSlug}-${i++}`;
  return slug;
}

/** Map dữ liệu cũ {price:[{service,price}]} -> pricing[] theo schema mới */
function mapLegacyPrice(body) {
  if (Array.isArray(body?.price) && !Array.isArray(body?.pricing)) {
    body.pricing = body.price.map((p) => ({
      plan: p.service,
      priceText: p.price,
      // amount/currency/interval: có thể parse sau nếu cần
    }));
  }
  delete body.price;
  return body;
}

/** Chuẩn hoá một số field mảng */
function normalizeArrays(body) {
  const normList = (arr) =>
    Array.isArray(arr) ? arr.map((v) => String(v)) : [];
  ["tags", "features", "strengths", "weaknesses", "targetUsers"].forEach(
    (k) => {
      if (body[k]) body[k] = normList(body[k]);
    }
  );
  return body;
}

/** —— Controllers —— */

// CREATE
export async function createBot(req, res, next) {
  try {
    let payload = { ...req.body };
    payload = mapLegacyPrice(payload);
    payload = normalizeArrays(payload);

    if (!payload.name)
      return res.status(400).json({ message: "name is required" });

    // tạo slug duy nhất
    payload.slug = await ensureUniqueSlug(Bot, payload.name);

    const doc = await Bot.create(payload);
    res.status(201).json(doc);
  } catch (err) {
    if (!duplicateKey(res, err)) next(err);
  }
}

// LIST (paginate + full-text + sort)
export async function listBots(req, res, next) {
  try {
    const { q, tag, category, status, skip = 0, limit = 12, sort = q ? "relevance" : "-views" } = req.query;
    const base = {};
    if (q) base.$text = { $search: q };
    if (tag) base.tags = tag;
    if (category) base.category = category;
    if (status) base.status = status;

    const LIM = Math.min(Number(limit), 100);
    const SKIP = Number(skip);

    // Không có q: trả danh sách bình thường
    if (!q || !q.trim()) {
      const [items, total] = await Promise.all([
        Bot.find(base)
          .sort(sort || "-views")
          .skip(SKIP)
          .limit(LIM),
        Bot.countDocuments(base),
      ]);
      return res.json({ total, items });
    }

    const query = q.trim();
    // regex an toàn (escape ký tự đặc biệt)
    const esc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(esc, "i");

    // 1) Thử full-text trước (ưu tiên relevance)
    let textItems = [];
    try {
      textItems = await Bot.find(
        { ...base, $text: { $search: query } },
        { score: { $meta: "textScore" } }
      )
        .sort({ score: { $meta: "textScore" }, views: -1 })
        .skip(SKIP)
        .limit(LIM);
    } catch (_) {
      // nếu chưa có text index, bỏ qua
    }

    // 2) Fallback/expand bằng regex cho partial match (name/tags/summary/description/features)
    const regexItems = await Bot.find({
      ...base,
      $or: [
        { name: rx },
        { summary: rx },
        { description: rx },
        { tags: { $elemMatch: { $regex: rx } } },
        { features: { $elemMatch: { $regex: rx } } },
      ],
    })
      .sort("-views")
      .limit(LIM * 2); // nới rộng chút để merge

    // 3) Gộp & khử trùng lặp (ưu tiên kết quả text trước)
    const map = new Map();
    [...textItems, ...regexItems].forEach((d) => map.set(String(d._id), d));
    const merged = Array.from(map.values()).slice(0, LIM);

    // 4) Tổng gần đúng (tránh ràng buộc $text+$or trong 1 câu query)
    let totalText = 0;
    try {
      totalText = await Bot.countDocuments({
        ...base,
        $text: { $search: query },
      });
    } catch {}
    const totalRegex = await Bot.countDocuments({
      ...base,
      $or: [
        { name: rx },
        { summary: rx },
        { description: rx },
        { tags: { $elemMatch: { $regex: rx } } },
        { features: { $elemMatch: { $regex: rx } } },
      ],
    });
    const total = Math.max(totalText, totalRegex);

    res.json({ total, items: merged });
  } catch (err) {
    next(err);
  }
}

// GET /api/bots/facets  (optional nhưng rất hữu ích cho UI filter)
export async function getBotFacets(req, res, next) {
  try {
    const { q, tag, status, category } = req.query;
    const filter = {};
    if (q) filter.$text = { $search: q };
    if (tag) filter.tags = tag;
    if (status) filter.status = status;
    if (category) filter.category = category;

    const [categories, tags] = await Promise.all([
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
      tags: tags.map((t) => ({ value: t._id, count: t.count })),
    });
  } catch (e) {
    next(e);
  }
}

// DETAIL by id
export async function getBotById(req, res, next) {
  try {
    const doc = await Bot.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Bot not found" });
    res.json(doc);
  } catch (err) {
    next(err);
  }
}

// DETAIL by slug
export async function getBotBySlug(req, res, next) {
  try {
    const doc = await Bot.findOne({ slug: req.params.slug });
    if (!doc) return res.status(404).json({ message: "Bot not found" });
    res.json(doc);
  } catch (err) {
    next(err);
  }
}

// UPDATE (partial)
export async function updateBot(req, res, next) {
  try {
    let payload = { ...req.body };
    payload = mapLegacyPrice(payload);
    payload = normalizeArrays(payload);

    // nếu đổi tên -> tạo slug mới không trùng
    if (payload.name) {
      payload.slug = await ensureUniqueSlug(Bot, payload.name, req.params.id);
    }

    const doc = await Bot.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: "Bot not found" });
    res.json(doc);
  } catch (err) {
    if (!duplicateKey(res, err)) next(err);
  }
}

// DELETE
export async function deleteBot(req, res, next) {
  try {
    const doc = await Bot.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Bot not found" });
    res.json({ deleted: true, _id: doc._id });
  } catch (err) {
    next(err);
  }
}

// tăng views (xếp hạng theo lượt quan tâm)
export async function incViews(req, res, next) {
  try {
    const doc = await Bot.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Bot not found" });
    res.json({ views: doc.views });
  } catch (err) {
    next(err);
  }
}

// track click-out affiliate
export async function trackClick(req, res, next) {
  try {
    const doc = await Bot.findByIdAndUpdate(
      req.params.id,
      { $inc: { clicks: 1 } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Bot not found" });
    res.json({ clicks: doc.clicks });
  } catch (err) {
    next(err);
  }
}

// TOP theo views (status=active)
export async function topBots(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit || 10), 50);
    const items = await Bot.find({ status: "active" })
      .sort("-views")
      .limit(limit);
    res.json(items);
  } catch (err) {
    next(err);
  }
}
