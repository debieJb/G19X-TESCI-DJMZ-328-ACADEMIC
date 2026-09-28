const mostrarInicio = (req, res) => {
  res.render('index', {
    titulo: 'Marketing Automation',
    anio: new Date().getFullYear()
  });
};

module.exports = { mostrarInicio };
