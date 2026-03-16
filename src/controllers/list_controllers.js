const {PrismaClient} = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

const clampPosition = (position, maxPosition) => {
    if (!Number.isInteger(position)) {
        return null;
    }

    if (position < 0) {
        return 0;
    }

    if (position > maxPosition) {
        return maxPosition;
    }

    return position;
};

const ensureMembership = async (userId, groupId) => {
    const membership = await prisma.groupMember.findUnique({
        where: {
            userId_groupId: {
                userId,
                groupId
            }
        },
        select: {
            id: true
        }
    });

    return Boolean(membership);
};

exports.createList = async (req, res) => {
    try {
        const {groupId, name, position} = req.body;

        if (!groupId || !name) {
            return res.status(400).json({error: 'Group ID and name are required'});
        }

        const hasAccess = await ensureMembership(req.user.userId, groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        const existingLists = await prisma.list.findMany({
            where: {groupId},
            orderBy: [
                {position: 'asc'},
                {createdAt: 'asc'}
            ],
            select: {
                id: true
            }
        });

        const targetPosition = Number.isInteger(position)
            ? clampPosition(position, existingLists.length)
            : existingLists.length;

        if (targetPosition === null) {
            return res.status(400).json({error: 'Position must be an integer'});
        }

        let createdList = null;

        await prisma.$transaction(async (transaction) => {
            const reorderedListIds = existingLists.map((list) => list.id);
            const tempId = `temp-${Date.now()}`;
            reorderedListIds.splice(targetPosition, 0, tempId);

            await Promise.all(reorderedListIds
                .filter((listId) => listId !== tempId)
                .map((listId, index) => transaction.list.update({
                    where: {id: listId},
                    data: {position: index >= targetPosition ? index + 1 : index}
                })));

            createdList = await transaction.list.create({
                data: {
                    groupId,
                    name,
                    position: targetPosition
                }
            });

            const affectedLists = await transaction.list.findMany({
                where: {groupId},
                orderBy: [
                    {position: 'asc'},
                    {createdAt: 'asc'}
                ],
                select: {
                    id: true
                }
            });

            await Promise.all(affectedLists.map((list, index) => transaction.list.update({
                where: {id: list.id},
                data: {position: index}
            })));
        });

        res.status(201).json(createdList);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.getListsByGroup = async (req, res) => {
    try {
        const {groupId} = req.params;

        const hasAccess = await ensureMembership(req.user.userId, groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        const lists = await prisma.list.findMany({
            where: {groupId},
            orderBy: [
                {position: 'asc'},
                {createdAt: 'asc'}
            ],
            include: {
                tasks: {
                    orderBy: [
                        {position: 'asc'},
                        {createdAt: 'asc'}
                    ]
                }
            }
        });

        res.json(lists);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.updateList = async (req, res) => {
    try {
        const {id} = req.params;
        const {name} = req.body;

        const list = await prisma.list.findUnique({
            where: {id},
            select: {
                id: true,
                groupId: true
            }
        });

        if (!list) {
            return res.status(404).json({error: 'List not found'});
        }

        const hasAccess = await ensureMembership(req.user.userId, list.groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        const updatedList = await prisma.list.update({
            where: {id},
            data: {name}
        });

        res.json(updatedList);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.deleteList = async (req, res) => {
    try {
        const {id} = req.params;

        const list = await prisma.list.findUnique({
            where: {id},
            select: {
                id: true,
                groupId: true
            }
        });

        if (!list) {
            return res.status(404).json({error: 'List not found'});
        }

        const hasAccess = await ensureMembership(req.user.userId, list.groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        const taskCount = await prisma.task.count({
            where: {
                listId: id
            }
        });

        if (taskCount > 0) {
            return res.status(400).json({error: 'Cannot delete list that still has tasks'});
        }

        await prisma.$transaction(async (transaction) => {
            await transaction.list.delete({
                where: {id}
            });

            const remainingLists = await transaction.list.findMany({
                where: {groupId: list.groupId},
                orderBy: [
                    {position: 'asc'},
                    {createdAt: 'asc'}
                ],
                select: {
                    id: true
                }
            });

            await Promise.all(remainingLists.map((remainingList, index) => transaction.list.update({
                where: {id: remainingList.id},
                data: {position: index}
            })));
        });

        res.json({message: 'List deleted successfully'});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.updateListPosition = async (req, res) => {
    try {
        const {id} = req.params;
        const {position} = req.body;

        const currentList = await prisma.list.findUnique({
            where: {id},
            select: {
                id: true,
                groupId: true,
                position: true
            }
        });

        if (!currentList) {
            return res.status(404).json({error: 'List not found'});
        }

        const hasAccess = await ensureMembership(req.user.userId, currentList.groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        const siblingLists = await prisma.list.findMany({
            where: {
                groupId: currentList.groupId,
                NOT: {
                    id
                }
            },
            orderBy: [
                {position: 'asc'},
                {createdAt: 'asc'}
            ],
            select: {
                id: true
            }
        });

        const nextPosition = clampPosition(position, siblingLists.length);

        if (nextPosition === null) {
            return res.status(400).json({error: 'Position must be an integer'});
        }

        await prisma.$transaction(async (transaction) => {
            const reorderedListIds = siblingLists.map((list) => list.id);
            reorderedListIds.splice(nextPosition, 0, id);

            await Promise.all(reorderedListIds.map((listId, index) => transaction.list.update({
                where: {id: listId},
                data: {position: index}
            })));
        });

        const updatedList = await prisma.list.findUnique({
            where: {id}
        });

        res.json(updatedList);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.reorderLists = async (req, res) => {
    try {
        const {groupId, listIds} = req.body;

        if (!groupId) {
            return res.status(400).json({error: 'Group ID is required'});
        }

        if (!Array.isArray(listIds) || listIds.length === 0) {
            return res.status(400).json({error: 'listIds must be a non-empty array'});
        }

        const hasAccess = await ensureMembership(req.user.userId, groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        const uniqueListIds = [...new Set(listIds)];

        if (uniqueListIds.length !== listIds.length) {
            return res.status(400).json({error: 'listIds must not contain duplicates'});
        }

        const existingLists = await prisma.list.findMany({
            where: {
                id: {
                    in: listIds
                },
                groupId
            },
            select: {
                id: true
            }
        });

        if (existingLists.length !== listIds.length) {
            return res.status(400).json({error: 'One or more lists do not belong to the group'});
        }

        await prisma.$transaction(listIds.map((listId, index) => prisma.list.update({
            where: {id: listId},
            data: {position: index}
        })));

        const lists = await prisma.list.findMany({
            where: {groupId},
            orderBy: [
                {position: 'asc'},
                {createdAt: 'asc'}
            ]
        });

        res.json(lists);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};
