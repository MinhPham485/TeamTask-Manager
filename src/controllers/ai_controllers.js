const {askGroupAssistant} = require('../services/ai_service');

exports.askGroupAssistant = async (req, res) => {
    try {
        const result = await askGroupAssistant({
            groupId: req.params.groupId,
            userId: req.user.userId,
            question: req.ai.question
        });

        if (result.error) {
            return res.status(result.status || 500).json({error: result.error});
        }

        return res.status(result.status || 200).json(result.data);
    } catch (error) {
        return res.status(500).json({
            error: {
                code: 'AI_INTERNAL_ERROR',
                message: 'Unable to process AI request'
            }
        });
    }
};
