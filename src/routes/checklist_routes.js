const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const checklistController = require('../controllers/checklist_controllers');

router.post('/', verifyToken, checklistController.createChecklistItem);
router.get('/task/:taskId', verifyToken, checklistController.getChecklistByTask);
router.post('/sections', verifyToken, checklistController.createChecklistSection);
router.get('/sections/task/:taskId', verifyToken, checklistController.getChecklistSectionsByTask);
router.put('/sections/reorder', verifyToken, checklistController.reorderChecklistSections);
router.put('/sections/:id', verifyToken, checklistController.updateChecklistSection);
router.delete('/sections/:id', verifyToken, checklistController.deleteChecklistSection);
router.patch('/sections/:id/position', verifyToken, checklistController.updateChecklistSectionPosition);
router.post('/items', verifyToken, checklistController.createChecklistItem);
router.put('/items/reorder', verifyToken, checklistController.reorderChecklistItems);
router.put('/items/:id', verifyToken, checklistController.updateChecklistItem);
router.delete('/items/:id', verifyToken, checklistController.deleteChecklistItem);
router.patch('/items/:id/toggle', verifyToken, checklistController.toggleChecklistItem);
router.patch('/items/:id/position', verifyToken, checklistController.updateChecklistPosition);
router.put('/reorder', verifyToken, checklistController.reorderChecklistItems);
router.put('/:id', verifyToken, checklistController.updateChecklistItem);
router.delete('/:id', verifyToken, checklistController.deleteChecklistItem);
router.patch('/:id/toggle', verifyToken, checklistController.toggleChecklistItem);
router.patch('/:id/position', verifyToken, checklistController.updateChecklistPosition);

module.exports = router;
