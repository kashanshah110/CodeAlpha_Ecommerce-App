const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();
router.use(authMiddleware);

async function loadCart(userId) {
  const user = await User.findById(userId);
  if (!user) return null;
  const products = await Product.find({
    _id: { $in: user.cartItems.map((entry) => entry.product) },
  });
  const productById = new Map(products.map((product) => [product._id.toString(), product]));
  const items = user.cartItems.map((entry) => {
    const product = productById.get(entry.product.toString());
    const unitPrice = product ? product.price : 0;
    return {
      product: product
        ? {
            id: product._id,
            name: product.name,
            image: product.image,
            price: unitPrice,
            stock: Number.isInteger(product.stock) ? product.stock : 0,
          }
        : { id: entry.product, name: "Unavailable product", image: "", price: 0, stock: 0 },
      quantity: entry.quantity,
      lineTotal: Math.round(unitPrice * entry.quantity * 100) / 100,
      unavailable: !product,
    };
  });
  const total = Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
  return { items, total, itemCount: items.reduce((sum, item) => sum + item.quantity, 0) };
}

router.get("/", async (req, res, next) => {
  try {
    const user = await loadCart(req.user._id);
    if (!user) return res.status(401).json({ success: false, message: "Your account is unavailable. Please sign in again." });
    return res.json({ success: true, cart: user });
  } catch (error) {
    return next(error);
  }
});

router.post("/items", async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { productId, quantity = 1 } = body;
    if (!mongoose.isValidObjectId(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({ success: false, message: "Choose a valid product and a quantity from 1 to 99." });
    }
    const [user, product] = await Promise.all([
      User.findById(req.user._id),
      Product.findById(productId),
    ]);
    if (!user) return res.status(401).json({ success: false, message: "Your account is unavailable. Please sign in again." });
    if (!product) return res.status(404).json({ success: false, message: "This product is no longer available." });
    const existing = user.cartItems.find((item) => item.product.toString() === productId);
    const stock = Number.isInteger(product.stock) ? product.stock : 0;
    const nextQuantity = (existing ? existing.quantity : 0) + quantity;
    if (nextQuantity > stock) {
      return res.status(409).json({ success: false, message: `Only ${stock} item(s) are currently in stock.` });
    }
    if (existing) existing.quantity = nextQuantity;
    else user.cartItems.push({ product: product._id, quantity });
    await user.save();
    const updated = await loadCart(user._id);
    if (!updated) return res.status(401).json({ success: false, message: "Your account is unavailable. Please sign in again." });
    return res.json({ success: true, cart: updated });
  } catch (error) {
    return next(error);
  }
});

router.patch("/items/:productId", async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body && typeof req.body === "object" ? req.body : {};
    if (!mongoose.isValidObjectId(productId) || !Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
      return res.status(400).json({ success: false, message: "Quantity must be a whole number from 0 to 99." });
    }
    const [user, product] = await Promise.all([
      User.findById(req.user._id),
      Product.findById(productId),
    ]);
    if (!user) return res.status(401).json({ success: false, message: "Your account is unavailable. Please sign in again." });
    const existing = user.cartItems.find((item) => item.product.toString() === productId);
    if (!existing) return res.status(404).json({ success: false, message: "That item is not in your cart." });
    if (quantity > 0 && !product) {
      return res.status(409).json({ success: false, message: "This product is no longer available; remove it from your cart." });
    }
    const stock = product && Number.isInteger(product.stock) ? product.stock : 0;
    if (product && quantity > stock) {
      return res.status(409).json({ success: false, message: `Only ${stock} item(s) are currently in stock.` });
    }
    if (quantity === 0) user.cartItems = user.cartItems.filter((item) => item.product.toString() !== productId);
    else existing.quantity = quantity;
    await user.save();
    const updated = await loadCart(user._id);
    if (!updated) return res.status(401).json({ success: false, message: "Your account is unavailable. Please sign in again." });
    return res.json({ success: true, cart: updated });
  } catch (error) {
    return next(error);
  }
});

router.delete("/items/:productId", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }
    await User.updateOne(
      { _id: req.user._id },
      { $pull: { cartItems: { product: req.params.productId } } },
    );
    const updated = await loadCart(req.user._id);
    if (!updated) return res.status(401).json({ success: false, message: "Your account is unavailable. Please sign in again." });
    return res.json({ success: true, cart: updated });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
