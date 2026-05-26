const express = require('express');
const router  = express.Router();
const authController = require('../controllers/auth_controllers');
const {verifyToken, isAdmin} = require('../middlewares/auth_middleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

router.get("/admin/users", verifyToken, isAdmin, authController.getAllUsers);
router.get("/profile", verifyToken, authController.getProfile);

router.patch("/profile", verifyToken, authController.updateProfile);
router.patch("/profile/password", verifyToken, authController.changePassword);

module.exports = router;