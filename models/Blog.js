// models/Blog.js
import mongoose from "mongoose";

function slugify(text = "") {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const BlogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    slug: { type: String, required: true, unique: true }, // ← unique slug
    tags: [{ type: String, index: true }],
    image: String,
    excerpt: String,
    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      default: "active",
    },
    publishedAt: { type: Date, default: Date.now },

    // các field seed Notion (không bắt buộc)
    source: { type: String, enum: ["notion", "manual"], default: "manual" },
    sourceUrl: String,
    externalKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

BlogSchema.index({ title: "text", content: "text", tags: "text" });

BlogSchema.methods.ensureUniqueSlug = async function () {
  const Blog = this.constructor;
  const base = this.slug ? slugify(this.slug) : slugify(this.title || "");
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

// helper: tìm theo "blog" (slug ưu tiên, fallback id 24-hex)
BlogSchema.statics.findByBlogKey = async function (key) {
  const Blog = this;
  let doc = await Blog.findOne({ slug: key });
  if (!doc && /^[a-f0-9]{24}$/i.test(key)) doc = await Blog.findById(key);
  return doc;
};

const Blog = mongoose.model("Blog", BlogSchema);
export default Blog;
