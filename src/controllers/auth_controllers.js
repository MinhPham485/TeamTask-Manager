const {PrismaClient} = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

exports.register = async (req, res) => {
    try {
        const {username, email, password} = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                username,
                email,
                password: hashedPassword
            }
        });
        res.json(user);
    } catch (error) {
        res.status(500).json({error: 'Registration failed'});
    }
};

exports.login = async (req, res) => {
    try {
        const {username, password} = req.body;
        const user = await prisma.user.findUnique({where: {username}});
        if (!user) return res.status(404).json({error: 'User not found'});
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({error: 'Wrong password'});
        const token = jwt.sign(
            {userId: user.id},
            "SECRET_KEY",
            {expiresIn: '1h'}
        );
        res.json({token});
    }
        catch (error) { 
            res.status(500).json({error: 'Login failed'});
        }
};