const jwt= require('jsonwebtoken');
require('dotenv').config();

const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({error: 'No token provided'});
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY");
        req.user= decoded;
        next();
    } catch (error) {
        res.status(401).json({error: 'Invalid token'});
    }
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'Admin') {
        return res.status(403).json({error: 'Access denied'});
    }
    next();
}
module.exports = {isAdmin, verifyToken};