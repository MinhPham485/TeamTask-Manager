const parseMaxQuestionChars = () => {
    const raw = Number(process.env.AI_MAX_QUESTION_CHARS || 800);

    if (!Number.isFinite(raw) || raw <= 0) {
        return 800;
    }

    return Math.floor(raw);
};

const validateAskQuestion = (req, res, next) => {
    const {question} = req.body || {};
    const maxQuestionChars = parseMaxQuestionChars();

    if (typeof question !== 'string') {
        return res.status(400).json({
            error: {
                code: 'INVALID_REQUEST',
                message: 'Question is required and must be a string'
            }
        });
    }

    const normalizedQuestion = question.trim();

    if (!normalizedQuestion) {
        return res.status(400).json({
            error: {
                code: 'INVALID_REQUEST',
                message: 'Question must not be empty'
            }
        });
    }

    if (normalizedQuestion.length > maxQuestionChars) {
        return res.status(400).json({
            error: {
                code: 'INVALID_REQUEST',
                message: `Question exceeds ${maxQuestionChars} characters`
            }
        });
    }

    req.ai = {
        question: normalizedQuestion
    };

    next();
};

module.exports = {
    validateAskQuestion
};
