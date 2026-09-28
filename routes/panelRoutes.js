const router = require('express').Router();
const { requerirAutenticacion } = require('../middlewares/autenticacion');
const { mostrarPanel } = require('../controllers/panelController');
router.get('/', requerirAutenticacion, mostrarPanel);
module.exports = router;
