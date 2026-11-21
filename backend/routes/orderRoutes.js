const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();
router.use(authMiddleware);

function validText(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

router.get("/", async (req, res, next) => {
  try {
    const orders = await Order.find({ customer: req.user._id }).sort({ createdAt: -1 }).limit(100);
    return res.json({ success: true, orders });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID." });
    }
    const order = await Order.findOne({ _id: req.params.id, customer: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    return res.json({ success: true, order });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  const reserved = [];
  let createdOrder;
  try {
    const { phone, address, city, postalCode, country } =
      req.body && typeof req.body === "object" ? req.body : {};
    if (!validText(phone, 40) || !validText(address, 200) || !validText(city, 100) ||
        !validText(postalCode, 30) || !validText(country, 100)) {
      return res.status(400).json({
        success: false,
        message: "Provide a phone number and complete address, city, postal code, and country.",
      });
    }

    const user = await User.findById(req.user._id).populate("cartItems.product");
    if (!user) return res.status(401).json({ success: false, message: "Your account is unavailable. Please sign in again." });
    if (!user.cartItems.length) return res.status(400).json({ success: false, message: "Your cart is empty." });
    const items = [];
    for (const entry of user.cartItems) {
      const product = entry.product;
      if (!product) {
        return res.status(409).json({ success: false, message: "A cart item is no longer available. Update your cart." });
      }
      const stock = Number.isInteger(product.stock) ? product.stock : 0;
      if (!Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > stock) {
        return res.status(409).json({ success: false, message: `${product.name} does not have enough stock. Update your cart.` });
      }
      const lineTotal = Math.round(product.price * entry.quantity * 100) / 100;
      items.push({
        product: product._id,
        name: product.name,
        image: product.image,
        quantity: entry.quantity,
        unitPrice: product.price,
        lineTotal,
      });
    }

    for (const item of items) {
      const result = await Product.updateOne(
        { _id: item.product, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
      );
      if (!result.modifiedCount) {
        throw Object.assign(new Error(`${item.name} just sold out. Please review your cart.`), { status: 409 });
      }
      reserved.push(item);
    }

    const total = Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
    [createdOrder] = await Order.create(
      [
        {
          customer: user._id,
          customerDetails: { name: user.name, email: user.email, phone: phone.trim() },
          shippingAddress: {
            address: address.trim(),
            city: city.trim(),
            postalCode: postalCode.trim(),
            country: country.trim(),
          },
          items,
          total,
          status: "pending",
          payment: { method: "sandbox", status: "not_processed" },
        },
      ],
      { ordered: true },
    );
    user.cartItems = [];
    await user.save();
    return res.status(201).json({
      success: true,
      message: "Sandbox order placed. No payment was collected.",
      order: createdOrder,
    });
  } catch (error) {
    const cleanupFailures = [];
    if (createdOrder) {
      try {
        await Order.deleteOne({ _id: createdOrder._id });
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
    }
    const restorations = await Promise.allSettled(
      reserved.map((item) => Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } })),
    );
    cleanupFailures.push(...restorations.filter((result) => result.status === "rejected").map((result) => result.reason));
    if (cleanupFailures.length) {
      console.error("Checkout rollback failed:", cleanupFailures.map((failure) => failure.message).join("; "));
      return next(new Error("Checkout failed and its inventory rollback could not be completed."));
    }
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    return next(error);
  }
});

module.exports = router;
