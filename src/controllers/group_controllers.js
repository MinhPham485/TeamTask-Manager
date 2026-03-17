const {PrismaClient} = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

exports.createGroup = async (req, res) => {
    try {
        const {name} = req.body;
        const groupCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const group = await prisma.$transaction(async (transaction) => {
            const createdGroup = await transaction.group.create({
                data: {
                    name,
                    groupCode,
                    ownerId: req.user.userId
                }
            });

            await transaction.groupMember.create({
                data: {
                    groupId: createdGroup.id,
                    userId: req.user.userId,
                    role: 'owner'
                }
            });

            await transaction.list.createMany({
                data: [
                    {
                        name: 'Can lam',
                        position: 0,
                        groupId: createdGroup.id
                    },
                    {
                        name: 'Dang lam',
                        position: 1,
                        groupId: createdGroup.id
                    },
                    {
                        name: 'Da xong',
                        position: 2,
                        groupId: createdGroup.id
                    }
                ]
            });

            return createdGroup;
        });
        res.json(group);
    } catch (error) {
        res.status(500).json({error: 'Failed to create group'});
    }   
};

exports.joinGroup = async (req, res) => {
    try {
        const {groupCode} = req.body;
        const group = await prisma.group.findUnique({where: {groupCode}});
        if (!group) return res.status(404).json({error: 'Group not found'});
        
        // Check if user is already a member
        const existingMember = await prisma.groupMember.findUnique({
            where: {
                userId_groupId: {
                    userId: req.user.userId,
                    groupId: group.id
                }
            }
        });
        
        if (existingMember) {
            return res.status(400).json({error: 'You are already a member of this group'});
        }
        
        await prisma.groupMember.create({
            data: {
                groupId: group.id,
                userId: req.user.userId,
                role: 'member'
            }
        });
        res.json({message: 'Joined group successfully'});
    }
    catch (error) {
        res.status(500).json({error: 'Failed to join group'});
    }
};

exports.getGroups = async (req, res) => {
    try {
        const groups = await prisma.groupMember.findMany({
            where: {
                userId: req.user.userId
            },
            include: {
                group: true
            }
        });
        res.json(groups);
    } catch (error) {
        res.status(500).json({error: 'Failed to fetch groups'});
    }
};

exports.getGroupById = async (req, res) => {
    try {
        const {id} = req.params;
        const group = await prisma.group.findUnique({
            where: {id},
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                email: true
                            }
                        }
                    }
                },
                tasks: true
            }
        });
        if (!group) return res.status(404).json({error: 'Group not found'});
        res.json(group);
    } catch (error) {
        res.status(500).json({error: 'Failed to fetch group'});
    }
};

exports.getGroupMembers = async (req, res) => {
    try {
        const {id} = req.params;
        const members = await prisma.groupMember.findMany({
            where: {groupId: id},
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });
        res.json(members);
    }
    catch (error) {
        res.status(500).json({error: 'Failed to fetch group members'});
    }
};

exports.updateGroup = async (req, res) => {
    try {
        const {id} = req.params;
        const {name} = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({error: 'Group name is required'});
        }

        const updatedGroup = await prisma.group.update({
            where: {id},
            data: {
                name: name.trim()
            }
        });

        res.json(updatedGroup);
    } catch (error) {
        res.status(500).json({error: 'Failed to update group'});
    }
};

exports.removeGroupMember = async (req, res) => {
    try {
        const {id, userId} = req.params;

        const targetMember = await prisma.groupMember.findUnique({
            where: {
                userId_groupId: {
                    userId,
                    groupId: id
                }
            }
        });

        if (!targetMember) {
            return res.status(404).json({error: 'Member not found in this group'});
        }

        const group = await prisma.group.findUnique({
            where: {id},
            select: {
                ownerId: true
            }
        });

        if (!group) {
            return res.status(404).json({error: 'Group not found'});
        }

        if (group.ownerId === userId) {
            return res.status(400).json({error: 'Cannot remove group owner'});
        }

        await prisma.groupMember.delete({
            where: {
                userId_groupId: {
                    userId,
                    groupId: id
                }
            }
        });

        res.json({message: 'Member removed successfully'});
    } catch (error) {
        res.status(500).json({error: 'Failed to remove group member'});
    }
};

exports.deleteGroup = async (req, res) => {
    try {
        const {id} = req.params;

        const group = await prisma.group.findUnique({
            where: {id},
            select: {
                id: true
            }
        });

        if (!group) {
            return res.status(404).json({error: 'Group not found'});
        }

        await prisma.$transaction(async (transaction) => {
            const tasks = await transaction.task.findMany({
                where: {groupId: id},
                select: {
                    id: true
                }
            });

            const taskIds = tasks.map((task) => task.id);

            if (taskIds.length > 0) {
                await transaction.checklistItem.deleteMany({
                    where: {
                        taskId: {
                            in: taskIds
                        }
                    }
                });

                await transaction.taskComment.deleteMany({
                    where: {
                        taskId: {
                            in: taskIds
                        }
                    }
                });

                await transaction.taskLabel.deleteMany({
                    where: {
                        taskId: {
                            in: taskIds
                        }
                    }
                });

                await transaction.task.deleteMany({
                    where: {
                        id: {
                            in: taskIds
                        }
                    }
                });
            }

            await transaction.message.deleteMany({
                where: {
                    groupId: id
                }
            });

            await transaction.label.deleteMany({
                where: {
                    groupId: id
                }
            });

            await transaction.list.deleteMany({
                where: {
                    groupId: id
                }
            });

            await transaction.groupMember.deleteMany({
                where: {
                    groupId: id
                }
            });

            await transaction.group.delete({
                where: {id}
            });
        });

        res.json({message: 'Group deleted successfully'});
    } catch (error) {
        res.status(500).json({error: 'Failed to delete group'});
    }
};