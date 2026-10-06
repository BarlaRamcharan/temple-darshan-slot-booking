const express = require('express');
const { getTemples, getTempleById } = require('../controllers/templeController');

const router = express.Router();

router.get('/', getTemples);
router.get('/:id', getTempleById);

module.exports = router;
