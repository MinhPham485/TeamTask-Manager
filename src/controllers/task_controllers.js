const {PrismaClient} = require('@prisma/client');    
require('dotenv').config();
const prisma = new PrismaClient();

exports.createTask = async (req, res) => {
    try {
        const {title, description, groupId, assignedTo} = req.body;
        const task = await prisma.task.create({
            data: {
                title,
                description,
                groupId,
                status: 'TODO',
                assignedTo
            }
        });
        res.status(201).json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getTasksByGroup = async (req, res) => {
    try {
        const {groupId} = req.params;
        const tasks = await prisma.task.findMany({
            where: { groupId },
            include: { 
                assignee: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }   
};

exports.updateTask = async (req, res) => {
    try {   
        const {id} = req.params;
        const {title, description, assignedTo} = req.body;
        const task = await prisma.task.update({
            where: {id},
            data: {title, description, assignedTo}
        });
        res.json(task);
    }
    catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.deleteTask = async (req, res) => {
    try {
        const {id} = req.params;
        await prisma.task.delete({where: {id}});
        res.json({message: 'Task deleted successfully'});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};


exports.updateTaskStatus = async (req, res) => {
    try {
        const {id} = req.params;
        const {status} = req.body;
        const task = await prisma.task.update({
            where: {id},
            data: {status}
        });
        res.json(task);
    } 
    catch (error) {
        res.status(500).json({error: error.message});
    }
};