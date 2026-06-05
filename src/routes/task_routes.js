const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const {isGroupMember, canManageTask} = require('../middlewares/group_middleware');
const taskController = require('../controllers/task_controllers');
const attachmentController = require('../controllers/attachment_controllers');

router.post('/', verifyToken, isGroupMember, taskController.createTask);
router.get('/group/:groupId/deadline/summary', verifyToken, isGroupMember, taskController.getDeadlineSummary);
router.get('/group/:groupId/deadline', verifyToken, isGroupMember, taskController.getDeadlineTasks);
router.get('/group/:groupId', verifyToken, isGroupMember, taskController.getTasksByGroup);
router.put('/reorder', verifyToken, isGroupMember, taskController.reorderTasks);
router.put('/:id', verifyToken, canManageTask, taskController.updateTask);
router.put('/:id/members', verifyToken, canManageTask, taskController.updateTaskMembers);
router.get('/:id/attachments', verifyToken, canManageTask, attachmentController.getTaskAttachments);
router.post('/:id/attachments', verifyToken, canManageTask, attachmentController.createTaskAttachment);
router.delete('/:id', verifyToken, canManageTask, taskController.deleteTask);
router.put('/:id/move', verifyToken, canManageTask, taskController.moveTaskToList);
router.patch('/:id/move', verifyToken, canManageTask, taskController.moveTaskToList);
router.patch('/:id/position', verifyToken, canManageTask, taskController.updateTaskPosition);
router.put('/:id/labels', verifyToken, canManageTask, taskController.assignLabels);

module.exports = router;
