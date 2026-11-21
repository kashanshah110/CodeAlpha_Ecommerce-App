const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const Product = require("../models/Product");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const router = express.Router();
const editableFields = ["name", "category", "price", "oldPrice", "description", "image", "stock"];
const uploadDirectory = path.resolve(__dirname, "..", "..", "frontend", "uploads");
const imageTypes = new Map([
  ["image/jpeg", { extension: "jpg", matches: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff }],
  ["image/png", { extension: "png", matches: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ["image/webp", { extension: "webp", matches: (buffer) => buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" }],
  ["image/gif", { extension: "gif", matches: (buffer) => ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6)) }],
]);
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    callback(null, imageTypes.has(file.mimetype));
  },
});

router.post("/images", authMiddleware, adminMiddleware, (req, res, next) => {
  imageUpload.single("image")(req, res, async (error) => {
    if (error) {
      const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({
        success: false,
        message: status === 413 ? "Image must be 5 MB or smaller." : "Choose one supported image file.",
      });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Choose a JPEG, PNG, WebP, or GIF image." });
    }
    const imageType = imageTypes.get(req.file.mimetype);
    if (!imageType.matches(req.file.buffer)) {
      return res.status(400).json({ success: false, message: "The selected file is not a valid image of the declared type." });
    }
    try {
      await fs.mkdir(uploadDirectory, { recursive: true });
      const filename = `${crypto.randomUUID()}.${imageType.extension}`;
      await fs.writeFile(path.join(uploadDirectory, filename), req.file.buffer, { flag: "wx" });
      return res.status(201).json({ success: true, image: `/uploads/${filename}` });
    } catch (writeError) {
      return next(writeError);
    }
  });
});

function validateProductInput(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "A product object is required.";
  const keys = Object.keys(body);
  if (keys.some((key) => !editableFields.includes(key))) return "The request includes unsupported product fields.";
  const required = ["name", "category", "price", "description", "image"];
  if (!partial && required.some((key) => body[key] === undefined || body[key] === "")) {
    return "Name, category, price, description, and image are required.";
  }
  for (const key of ["name", "category", "description", "image"]) {
    if (body[key] !== undefined && (typeof body[key] !== "string" || !body[key].trim())) {
      return `${key} must be a non-empty string.`;
    }
    if (body.image !== undefined) {
      const image = body.image.trim();
      if (!image.startsWith("/") || image.startsWith("//")) {
        try {
          const parsed = new URL(image);
          if (!["http:", "https:"].includes(parsed.protocol)) return "Image must use HTTP or HTTPS.";
        } catch {
          return "Image must be a valid HTTP(S) URL or a local path.";
        }
      }
    }
  }
  for (const key of ["price", "oldPrice", "stock"]) {
    if (body[key] !== undefined && (!Number.isFinite(Number(body[key])) || Number(body[key]) < 0)) {
      return `${key} must be a non-negative number.`;
    }
  }
  if (body.stock !== undefined && (!Number.isInteger(Number(body.stock)) || Number(body.stock) > 100000)) {
    return "Stock must be a whole number between 0 and 100000.";
  }
  if (body.image !== undefined && body.image.length > 2048) return "Image URL is too long.";
  return null;
}

router.get("/", async (req, res, next) => {
  try {
    const filter = {};
    if (typeof req.query.category === "string" && req.query.category !== "all") {
      filter.category = new RegExp(`^${req.query.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    }
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      const search = req.query.search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = ["name", "description", "category"].map((field) => ({
        [field]: { $regex: search, $options: "i" },
      }));
    }
    const sorters = {
      "price-asc": { price: 1 },
      "price-desc": { price: -1 },
      name: { name: 1 },
      newest: { createdAt: -1 },
    };
    const products = await Product.find(filter).sort(sorters[req.query.sort] || { createdAt: -1 }).limit(200);
    return res.json({ success: true, products });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found." });
    return res.json({ success: true, product });
  } catch (error) {
    return next(error);
  }
});

router.post("/", authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const invalid = validateProductInput(req.body);
    if (invalid) return res.status(400).json({ success: false, message: invalid });
    const product = await Product.create(req.body);
    return res.status(201).json({ success: true, product });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ success: false, message: "Please check the product fields and try again." });
    }
    return next(error);
  }
});

router.put("/:id", authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }
    const invalid = validateProductInput(req.body, true);
    if (invalid) return res.status(400).json({ success: false, message: invalid });
    const updates = Object.fromEntries(
      Object.entries(req.body).map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : Number(value),
      ]),
    );
    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ success: false, message: "Product not found." });
    return res.json({ success: true, product });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ success: false, message: "Please check the product fields and try again." });
    }
    return next(error);
  }
});

router.delete("/:id", authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found." });
    return res.json({ success: true, message: "Product deleted." });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
