const express = require("express");
const mongoose = require("mongoose");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const User = require("../models/User");
const Order = require("../models/Order");
const Product = require("../models/Product");

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

router.get("/summary", async (req, res, next) => {
  try {
    const [products, orders, users, pendingOrders] = await Promise.all([
      Product.countDocuments(),
      Order.countDocuments(),
      User.countDocuments(),
      Order.countDocuments({ status: "pending" }),
    ]);
    return res.json({ success: true, summary: { products, orders, users, pendingOrders } });
  } catch (error) {
    return next(error);
  }
});

router.get("/orders", async (req, res, next) => {
  try {
    const orders = await Order.find()
      .populate("customer", "name email status")
      .sort({ createdAt: -1 })
      .limit(200);
    return res.json({ success: true, orders });
  } catch (error) {
    return next(error);
  }
});

router.patch("/orders/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body && typeof req.body === "object" ? req.body : {};
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID." });
    }
    const allowedTransitions = {
      pending: ["processing", "cancelled"],
      processing: ["shipped", "cancelled"],
      shipped: ["delivered"],
      delivered: [],
      cancelled: [],
    };
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    if (!allowedTransitions[order.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Order status cannot move from ${order.status} to ${status}.`,
      });
    }
    if (status === "cancelled" && order.payment.status === "paid") {
      return res.status(400).json({
        success: false,
        message: "This order is marked paid. Arrange any external refund before cancelling it.",
      });
    }
    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        status: order.status,
        ...(status === "cancelled" ? { "payment.status": { $ne: "paid" } } : {}),
      },
      { $set: { status } },
      { new: true, runValidators: true },
    );
    if (!updatedOrder) {
      return res.status(409).json({ success: false, message: "This order changed. Refresh and try again." });
    }
    if (status === "cancelled") {
      const restored = [];
      try {
        for (const item of order.items) {
          const result = await Product.updateOne(
            { _id: item.product },
            { $inc: { stock: item.quantity } },
          );
          if (result.modifiedCount) restored.push(item);
        }
      } catch (error) {
        await Promise.all(
          restored.map((item) =>
            Product.updateOne({ _id: item.product }, { $inc: { stock: -item.quantity } }),
          ),
        ).catch((rollbackError) => {
          console.error("Could not roll back inventory after order cancellation:", rollbackError.message);
        });
        await Order.updateOne(
          { _id: order._id, status: "cancelled" },
          { $set: { status: order.status } },
        ).catch((rollbackError) => {
          console.error("Could not restore order status after cancellation failure:", rollbackError.message);
        });
        return next(error);
      }
    }
    return res.json({ success: true, order: updatedOrder });
  } catch (error) {
    return next(error);
  }
});

router.patch("/orders/:id/payment", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID." });
    }
    if (req.body?.status !== "paid" || Object.keys(req.body).some((key) => key !== "status")) {
      return res.status(400).json({ success: false, message: "Payment can only be recorded as paid after it has been received." });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    if (order.status === "cancelled") {
      return res.status(400).json({ success: false, message: "Payment cannot be recorded for a cancelled order." });
    }
    if (order.payment.status === "paid") {
      return res.status(409).json({ success: false, message: "Payment has already been recorded for this order." });
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { _id: order._id, status: { $ne: "cancelled" }, "payment.status": { $ne: "paid" } },
      {
        $set: {
          "payment.method": "manual",
          "payment.status": "paid",
          "payment.paidAt": new Date(),
          "payment.recordedBy": req.user._id,
        },
      },
      { new: true, runValidators: true },
    );
    if (!updatedOrder) {
      return res.status(409).json({ success: false, message: "This order changed. Refresh and try again." });
    }
    return res.json({ success: true, order: updatedOrder });
  } catch (error) {
    return next(error);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const users = await User.find()
      .select("name email role status createdAt")
      .sort({ createdAt: -1 })
      .limit(200);
    return res.json({ success: true, users });
  } catch (error) {
    return next(error);
  }
});

router.patch("/users/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const keys = Object.keys(body);
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID." });
    }
    if (!keys.length || keys.some((key) => !["role", "status"].includes(key))) {
      return res.status(400).json({ success: false, message: "Only account role and status can be changed." });
    }
    if (body.role !== undefined && !["customer", "admin"].includes(body.role)) {
      return res.status(400).json({ success: false, message: "Role must be customer or admin." });
    }
    if (body.status !== undefined && !["active", "disabled"].includes(body.status)) {
      return res.status(400).json({ success: false, message: "Status must be active or disabled." });
    }
    const target = await User.findById(id);
    if (!target) return res.status(404).json({ success: false, message: "User not found." });
    const removesActiveAdmin =
      target.role === "admin" &&
      target.status === "active" &&
      (body.role === "customer" || body.status === "disabled");
    if (target._id.equals(req.user._id) && removesActiveAdmin) {
      return res.status(400).json({ success: false, message: "You cannot disable or demote your own active administrator account." });
    }
    if (removesActiveAdmin && (await User.countDocuments({ role: "admin", status: "active" })) <= 1) {
      return res.status(400).json({ success: false, message: "At least one active administrator must remain." });
    }
    if (body.role !== undefined) target.role = body.role;
    if (body.status !== undefined) target.status = body.status;
    await target.save();
    return res.json({
      success: true,
      user: {
        id: target._id,
        name: target.name,
        email: target.email,
        role: target.role,
        status: target.status,
        createdAt: target.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
