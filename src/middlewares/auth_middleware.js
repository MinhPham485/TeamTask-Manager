const jwt= require('jsonwebtoken');
const { getJwtSecret } = require('../config/auth_config');

const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({error: 'No token provided'});
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({error: 'Invalid token'});
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret());
        const userId = decoded?.userId || decoded?.id;

        if (!userId) {
            return res.status(401).json({error: 'Invalid token payload'});
        }

        req.user= {
            ...decoded,
            userId
        };

        next();
    } catch  {
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
