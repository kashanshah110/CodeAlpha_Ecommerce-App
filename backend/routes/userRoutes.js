const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const safeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  createdAt: user.createdAt,
});

router.post("/register", async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ success: false, message: "Name must be between 2 and 80 characters." });
    }
    if (!emailPattern.test(email) || email.length > 254) {
      return res.status(400).json({ success: false, message: "Enter a valid email address." });
    }
    if (password.length < 8 || password.length > 128 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ success: false, message: "Password must be 8–128 characters and no more than 72 UTF-8 bytes." });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password: passwordHash });
    return res.status(201).json({ success: true, message: "Account created. You can now sign in.", user: safeUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!emailPattern.test(email) || !password || password.length > 128 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ success: false, message: "Enter a valid email and password." });
    }
    const user = await User.findOne({ email }).select("+password");
    const matches = user && (await bcrypt.compare(password, user.password));
    if (!matches || user.status !== "active") {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }
    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => (error ? reject(error) : resolve()));
    });
    req.session.userId = user._id.toString();
    return res.json({ success: true, message: "Signed in successfully.", user: safeUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", authMiddleware, async (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("novastore.sid", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
    return res.json({ success: true, message: "You have been signed out." });
  });
});

router.post("/change-password", authMiddleware, async (req, res, next) => {
  try {
    const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    if (!currentPassword || currentPassword.length > 128 || Buffer.byteLength(currentPassword, "utf8") > 72) {
      return res.status(400).json({ success: false, message: "Enter your current password." });
    }
    if (newPassword.length < 8 || newPassword.length > 128 || Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({ success: false, message: "New password must be 8–128 characters and no more than 72 UTF-8 bytes." });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ success: false, message: "Your current password is incorrect." });
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({ success: false, message: "Choose a password different from your current password." });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    return res.json({ success: true, message: "Password updated successfully." });
  } catch (error) {
    return next(error);
  }
});

router.get("/profile", authMiddleware, (req, res) => {
  res.json({ success: true, user: safeUser(req.user) });
});

module.exports = router;
