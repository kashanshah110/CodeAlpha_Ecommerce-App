const User = require("../models/User");

const authMiddleware = async(req, res, next) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ success: false, message: "Please sign in to continue." });
        }
        const user = await User.findById(req.session.userId);
        if (!user || user.status !== "active") {
            req.session.destroy((error) => {
                if (error) console.error("Could not destroy unavailable account session:", error.message);
            });
            return res.status(401).json({ success: false, message: "Your account is unavailable. Please sign in again." });
        }
        req.user = user;
        return next();
    } catch (error) {
        return next(error);
    }
};

module.exports = authMiddleware;