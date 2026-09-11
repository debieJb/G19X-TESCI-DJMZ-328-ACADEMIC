const mostrarInicio = (req, res) => {
  res.render('index', {
    titulo: 'Marketing Automation'
  });
};

module.exports = {
  mostrarInicio
};