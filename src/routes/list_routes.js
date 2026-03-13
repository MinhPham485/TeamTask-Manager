const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const listController = require('../controllers/list_controllers');

router.post('/', verifyToken, listController.createList);
router.get('/group/:groupId', verifyToken, listController.getListsByGroup);
router.put('/reorder', verifyToken, listController.reorderLists);
router.put('/:id', verifyToken, listController.updateList);
router.delete('/:id', verifyToken, listController.deleteList);
router.patch('/:id/position', verifyToken, listController.updateListPosition);

module.exports = router;
