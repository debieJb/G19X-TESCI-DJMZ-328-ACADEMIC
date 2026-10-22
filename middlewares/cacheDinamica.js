// Las respuestas dinámicas contienen identidad o formularios de sesión.
// Los recursos estáticos conservan su caché independiente.
module.exports = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.vary('Cookie');
  next();
};
