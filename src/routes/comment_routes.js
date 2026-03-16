const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const commentController = require('../controllers/comment_controllers');

router.post('/', verifyToken, commentController.createComment);
router.get('/task/:taskId', verifyToken, commentController.getCommentsByTask);
router.put('/:id', verifyToken, commentController.updateComment);
router.delete('/:id', verifyToken, commentController.deleteComment);

module.exports = router;
