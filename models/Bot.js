import mongoose from "mongoose";

// util slug
const toSlug = (s) =>
  s
    ?.toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "";

// gộp & làm sạch tags
const normalizeTags = (arr = []) => [
  ...new Set(arr.map((t) => t.toString().trim().toLowerCase()).filter(Boolean)),
];

// tạo mảng keywords phụ cho full-text (synonyms, alias)
const buildKeywords = (doc) => {
  const kws = new Set();
  normalizeTags(doc.tags).forEach((t) => kws.add(t));
  (doc.features || []).forEach((f) => kws.add(f));
  (doc.targetUsers || []).forEach((u) => kws.add(u));
  (doc.strengths || []).forEach((p) => kws.add(p));
  (doc.weaknesses || []).forEach((c) => kws.add(c));
  // tuỳ ý thêm alias/viết tắt thủ công vào đây
  return Array.from(kws).slice(0, 200);
};

const pricingTier = new mongoose.Schema(
  {
    plan: { type: String, required: true }, // "Personal", "Professional"
    priceText: { type: String, required: true }, // "$11/month"
    // Tuỳ chọn: số hoá để sort/filter:
    amount: { type: Number }, // 11
    currency: { type: String, default: "USD" }, // "USD"
    interval: {
      type: String,
      enum: ["month", "year", "one_time", "other"],
      default: "month",
    },
  },
  { _id: false }
);

const botSchema = new mongoose.Schema(
  {
    // Nhận từ nguồn cũ
    externalKey: { type: String, index: true }, // "dupdub" (không bắt buộc unique)
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, unique: true, index: true },

    image: { type: String }, // logo/url ảnh
    affiliateLink: { type: String }, // link đi kèm "via"
    originUrl: { type: String }, // link gốc (nếu muốn tách)

    headquarters: { type: String },
    foundedYear: { type: Number },

    summary: { type: String, index: true }, // mô tả ngắn (meta)
    description: { type: String }, // mô tả dài (tuỳ cần)
    category: { type: String, trim: true, index: true, default: "" },
    tags: { type: [String], default: [] },
    features: { type: [String], default: [] },
    strengths: { type: [String], default: [] }, // pros
    weaknesses: { type: [String], default: [] }, // cons
    targetUsers: { type: [String], default: [] },

    pricing: { type: [pricingTier], default: [] },

    // thống kê / xếp hạng
    views: { type: Number, default: 0, index: true },
    clicks: { type: Number, default: 0 },

    // từ khóa phụ cho tìm kiếm
    searchKeywords: { type: [String], default: [] },

    // SEO meta
    seo: {
      title: { type: String },
      description: { type: String },
      ogImage: { type: String },
      canonical: { type: String },
    },

    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

// ----- INDEX cho full-text (có trọng số) -----
botSchema.index(
  {
    name: "text",
    summary: "text",
    description: "text",
    features: "text",
    tags: "text",
    strengths: "text",
    weaknesses: "text",
    targetUsers: "text",
    searchKeywords: "text",
  },
  {
    name: "bot_text_idx",
    weights: {
      name: 10,
      summary: 6,
      tags: 6,
      features: 3,
      targetUsers: 2,
      strengths: 2,
      weaknesses: 1,
      description: 4,
      searchKeywords: 5,
    },
    default_language: "english",
  }
);

// ----- Middleware để chuẩn hoá dữ liệu & SEO -----
botSchema.pre("validate", function (next) {
  if (!this.slug && this.name) this.slug = toSlug(this.name);
  // chuẩn hoá tags
  this.tags = normalizeTags(this.tags);
  // keywords phụ
  this.searchKeywords = buildKeywords(this);
  // tách foundedYear nếu nhập dưới dạng chuỗi
  if (this.foundedYear && typeof this.foundedYear === "string") {
    const n = Number(this.foundedYear);
    if (!Number.isNaN(n)) this.foundedYear = n;
  }
  next();
});

const Bot = mongoose.model("Bot", botSchema);
export default Bot;
