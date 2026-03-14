const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const checklistController = require('../controllers/checklist_controllers');

router.post('/', verifyToken, checklistController.createChecklistItem);
router.get('/task/:taskId', verifyToken, checklistController.getChecklistByTask);
router.put('/reorder', verifyToken, checklistController.reorderChecklistItems);
router.put('/:id', verifyToken, checklistController.updateChecklistItem);
router.delete('/:id', verifyToken, checklistController.deleteChecklistItem);
router.patch('/:id/toggle', verifyToken, checklistController.toggleChecklistItem);
router.patch('/:id/position', verifyToken, checklistController.updateChecklistPosition);

module.exports = router;
