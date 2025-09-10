import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import MongoStore from "connect-mongo";
import passport from "passport";
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

dotenv.config();

const app = express();

connectDB();

/*
 * One-time index creation.
 * Uncomment this block, run the server once, then comment it out again.
 * This ensures your MongoDB text indexes are built for fast search.
 */
// (async () => {
//   console.log("Syncing MongoDB indexes...");
//   await Bot.syncIndexes();
//   await Blog.syncIndexes(); // Also sync blog indexes for better performance
//   console.log("Finished syncing indexes.");
// })();

// CORS: cho phép gọi từ FE domain
const allow = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim());
app.use(
  cors({
    origin: "https://aitooler.io/",
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
      mongoUrl: process.env.MONGO_URI,
      dbName: "ai_tooler",
      touchAfter: 24 * 3600,
    }),
  })
);

app.use(bodyParser.json());
app.use(express.json());
app.use(passport.initialize());
app.use(passport.session());

// Mount routes
app.use("/auth", authRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/bots", botRoutes);

// Error handling middleware
app.use(errorHandler);

// Test connect
app.get("/healthz", async (_req, res) => {
  try {
    const result = await mongoose.connection.db.admin().command({ ping: 1 });
    res.json({ ok: true, state: mongoose.connection.readyState, ping: result });
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
