const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const {isGroupMember, canModifyTask} = require('../middlewares/group_middleware');
const taskController = require('../controllers/task_controllers');

router.post('/', verifyToken, isGroupMember, taskController.createTask);
router.get('/group/:groupId', verifyToken, isGroupMember, taskController.getTasksByGroup);
router.put('/:id', verifyToken, canModifyTask, taskController.updateTask);
router.delete('/:id', verifyToken, canModifyTask, taskController.deleteTask);
router.put('/:id/status', verifyToken, canModifyTask, taskController.updateTaskStatus);
router.patch('/:id/status', verifyToken, canModifyTask, taskController.updateTaskStatus);
router.patch('/:id/position', verifyToken, canModifyTask, taskController.updateTaskPosition);
router.put('/reorder', verifyToken, isGroupMember, taskController.reorderTasks);

module.exports = router;