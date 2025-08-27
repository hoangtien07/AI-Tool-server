// routes/auth.js
import express from "express";
import passport from "passport";

const router = express.Router();

// Đăng nhập qua Google OAuth
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Callback của Google OAuth sau khi người dùng đăng nhập
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("/dashboard"); // Redirect sau khi đăng nhập thành công
  }
);

export default router;
