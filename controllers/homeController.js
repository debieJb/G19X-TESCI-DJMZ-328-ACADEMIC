const mostrarInicio = (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.render('index', {
    titulo: 'Marketing Automation',
    anio: new Date().getFullYear()
  });
};

module.exports = { mostrarInicio };
