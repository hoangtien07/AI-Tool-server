import mongoose from "mongoose";

// Định nghĩa kiểu LocalizedString cho đa ngôn ngữ
const LocalizedString = {
  vi: { type: String, required: true },
  en: { type: String, required: true },
};

// Định nghĩa kiểu LocalizedRich cho nội dung với HTML
const LocalizedRich = {
  vi: { raw: mongoose.Schema.Types.Mixed, html: String, text: String },
  en: { raw: mongoose.Schema.Types.Mixed, html: String, text: String },
};

function slugify(text = "") {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Blog Schema
const BlogSchema = new mongoose.Schema(
  {
    title: LocalizedString,
    slug: { type: String, required: true, unique: true },
    tags: [{ type: String, index: true }],
    image: String,
    excerpt: LocalizedString,
    content: LocalizedRich,
    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      default: "active",
    },
    publishedAt: { type: Date, default: Date.now },
    source: { type: String, enum: ["notion", "manual"], default: "manual" },
    sourceUrl: String,
    externalKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

BlogSchema.index(
  {
    "title.vi": "text",
    "title.en": "text",
    "excerpt.vi": "text",
    "excerpt.en": "text",
    "content.vi.text": "text",
    "content.en.text": "text",
  },
  {
    name: "blog_text",
    weights: {
      "title.vi": 10,
      "title.en": 10,
      "excerpt.vi": 6,
      "excerpt.en": 6,
      "content.vi.text": 2,
      "content.en.text": 2,
    },
  }
);

BlogSchema.methods.ensureUniqueSlug = async function () {
  const Blog = this.constructor;
  const baseTitle =
    this.title && typeof this.title === "object"
      ? this.title.vi || this.title.en || ""
      : this.title || "";
  const base = this.slug ? slugify(this.slug) : slugify(baseTitle);
  let candidate = base || String(this._id);
  let i = 1;
  while (await Blog.exists({ slug: candidate, _id: { $ne: this._id } })) {
    i += 1;
    candidate = `${base}-${i}`;
  }
  this.slug = candidate;
};

BlogSchema.pre("validate", async function (next) {
  if (!this.slug) await this.ensureUniqueSlug();
  next();
});

const Blog = mongoose.model("Blog", BlogSchema);
export default Blog;
