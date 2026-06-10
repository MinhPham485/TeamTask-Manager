const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const {canManageGroupTasks, isGroupMember} = require('../middlewares/group_middleware');
const deadlineTaskController = require('../controllers/deadline_task_controllers');

router.get('/group/:groupId/summary', verifyToken, isGroupMember, deadlineTaskController.getDeadlineTaskSummary);
router.get('/group/:groupId', verifyToken, isGroupMember, deadlineTaskController.getDeadlineTasksByGroup);
router.post('/', verifyToken, canManageGroupTasks, deadlineTaskController.createDeadlineTask);
router.get('/:id', verifyToken, deadlineTaskController.getDeadlineTask);
router.post('/:id/members', verifyToken, deadlineTaskController.addDeadlineTaskMember);
router.post('/:id/checklist', verifyToken, deadlineTaskController.createDeadlineChecklistItem);
router.patch('/:id/checklist/:itemId/toggle', verifyToken, deadlineTaskController.toggleDeadlineChecklistItem);
router.delete('/:id/checklist/:itemId', verifyToken, deadlineTaskController.deleteDeadlineChecklistItem);
router.delete('/:id', verifyToken, deadlineTaskController.deleteDeadlineTask);

module.exports = router;
