import express from "express";
import MongoStore from "connect-mongo";
import passport from "passport";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import session from "express-session";
import cors from "cors";

import connectDB from "./config/db.js";
import "./config/passportConfig.js";
import { errorHandler } from "./config/errorHandler.js";

import authRoutes from "./routes/authRoutes.js";
import blogRoutes from "./routes/blogRoutes.js";
import botRoutes from "./routes/botRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import Blog from "./models/Blog.js";

dotenv.config();

const app = express();

connectDB();

// Tạo text index
// import Bot from "./models/bot.js";
// import Blog from "./models/blog.js";
// await Bot.createCollection();
// await Blog.createCollection();
// await Bot.syncIndexes();
// await Blog.syncIndexes();

// CORS: cho phép gọi từ FE domain
const allow = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim());
app.use(
  cors({
    // origin: "http://localhost:5173",
    origin(origin, cb) {
      if (!origin || allow.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true, // Allow credentials (cookies, headers)
  })
);
app.set("trust proxy", 1);
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: true, // bắt buộc trên HTTPS
      sameSite: "none", // để FE domain khác dùng cookie được
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI || process.env.MONGO_URI,
      dbName: "ai-tooler",
      touchAfter: 24 * 3600,
    }),
  })
);

app.use(bodyParser.json());
app.use(express.json());
app.use(passport.initialize());
app.use(passport.session());
Blog.syncIndexes?.();
// Mount routes
app.use("/auth", authRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/search", searchRoutes);

// Error handling middleware
app.use(errorHandler);
app.use("/api/bots", botRoutes);

// Test connect
app.get("/healthz", async (_req, res) => {
  try {
    const ping = await mongoose.connection.db.admin().ping();
    res.json({ ok: true, state: mongoose.connection.readyState, ping });
  } catch (e) {
    res.status(500).json({
      ok: false,
      state: mongoose.connection.readyState,
      error: e.message,
    });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
