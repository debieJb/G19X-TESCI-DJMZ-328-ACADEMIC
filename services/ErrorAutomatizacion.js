class ErrorAutomatizacion extends Error {
  constructor(codigo) {
    super(codigo);
    this.name = 'ErrorAutomatizacion';
    this.codigo = codigo;
  }
}

module.exports = ErrorAutomatizacion;
