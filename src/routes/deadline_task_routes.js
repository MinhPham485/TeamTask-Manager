const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const {canManageGroupTasks, isGroupMember} = require('../middlewares/group_middleware');
const deadlineTaskController = require('../controllers/deadline_task_controllers');

router.get('/me/summary', verifyToken, deadlineTaskController.getMyDeadlineTaskSummary);
router.get('/group/:groupId/summary', verifyToken, isGroupMember, deadlineTaskController.getDeadlineTaskSummary);
router.get('/group/:groupId', verifyToken, isGroupMember, deadlineTaskController.getDeadlineTasksByGroup);
router.post('/', verifyToken, canManageGroupTasks, deadlineTaskController.createDeadlineTask);
router.get('/:id', verifyToken, deadlineTaskController.getDeadlineTask);
router.post('/:id/members', verifyToken, deadlineTaskController.addDeadlineTaskMember);
router.post('/:id/checklist/sections', verifyToken, deadlineTaskController.createDeadlineChecklistSection);
router.put('/:id/checklist/sections/:sectionId', verifyToken, deadlineTaskController.updateDeadlineChecklistSection);
router.delete('/:id/checklist/sections/:sectionId', verifyToken, deadlineTaskController.deleteDeadlineChecklistSection);
router.post('/:id/checklist/items', verifyToken, deadlineTaskController.createDeadlineChecklistItem);
router.put('/:id/checklist/items/:itemId', verifyToken, deadlineTaskController.updateDeadlineChecklistItem);
router.patch('/:id/checklist/items/:itemId/toggle', verifyToken, deadlineTaskController.toggleDeadlineChecklistItem);
router.delete('/:id/checklist/items/:itemId', verifyToken, deadlineTaskController.deleteDeadlineChecklistItem);
router.delete('/:id', verifyToken, deadlineTaskController.deleteDeadlineTask);

module.exports = router;
