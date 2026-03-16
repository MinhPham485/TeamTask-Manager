const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const labelController = require('../controllers/label_controllers');

router.post('/', verifyToken, labelController.createLabel);
router.get('/group/:groupId', verifyToken, labelController.getLabelsByGroup);
router.put('/:id', verifyToken, labelController.updateLabel);
router.delete('/:id', verifyToken, labelController.deleteLabel);

module.exports = router;
