const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const uploadController = require('../controllers/upload_controllers');

router.post('/presign', verifyToken, uploadController.createPresignedUpload);

module.exports = router;
