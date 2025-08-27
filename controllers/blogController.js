// controllers/blogController.js
import Blog from "../models/Blog.js";

// POST /api/blogs
export async function createBlog(req, res, next) {
  try {
    const doc = new Blog(req.body);
    await doc.ensureUniqueSlug();
    await doc.save();
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

// GET /api/blogs
export async function listBlogs(req, res, next) {
  try {
    const {
      q,
      tag, // + thêm: filter theo tag
      status,
      skip = 0,
      limit = 10,
      sort = "-publishedAt",
    } = req.query;

    const filter = {};
    if (q) filter.$text = { $search: q };
    if (status) filter.status = status;
    if (tag) filter.tags = tag; // + thêm

    const [items, total] = await Promise.all([
      Blog.find(filter)
        .sort(String(sort))
        .skip(Number(skip))
        .limit(Math.min(Number(limit), 100)),
      Blog.countDocuments(filter),
    ]);
    res.json({ total, items });
  } catch (e) {
    next(e);
  }
}

// GET /api/blogs/:slug
export async function getBlog(req, res, next) {
  try {
    const doc = await Blog.findOne({ slug: req.params.slug }); // slug-only
    if (!doc) return res.status(404).json({ message: "Blog not found" });
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

// PATCH /api/blogs/:slug
export async function updateBlog(req, res, next) {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug }); // slug-only
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    Object.assign(blog, req.body);

    // nếu đổi slug hoặc đổi title (mà không muốn giữ slug cũ), tạo lại slug duy nhất
    const needReslug =
      "slug" in req.body || ("title" in req.body && !req.body.keepSlug);
    if (needReslug) await blog.ensureUniqueSlug();

    await blog.save();
    res.json(blog);
  } catch (e) {
    next(e);
  }
}

// DELETE /api/blogs/:slug
export async function deleteBlog(req, res, next) {
  try {
    const del = await Blog.findOneAndDelete({ slug: req.params.slug }); // slug-only
    if (!del) return res.status(404).json({ message: "Blog not found" });
    res.json({ deleted: true, _id: del._id });
  } catch (e) {
    next(e);
  }
}
