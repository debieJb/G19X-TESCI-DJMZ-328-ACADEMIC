const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { fixture, vistas } = require('./soporte/internoFixtures.cjs');
const { casos, fixturePublico } = require('./soporte/publicoFixtures.cjs');
const raiz = path.resolve(__dirname, '..');
const archivos = carpeta => fs.readdirSync(carpeta, { withFileTypes: true }).flatMap(entrada => {
  const nombre = path.join(carpeta, entrada.name);
  return entrada.isDirectory() ? archivos(nombre) : [nombre];
});
test('inventario: toda página EJS está cubierta por un fixture de renderizado', () => {
  const paginas = archivos(path.join(raiz, 'views')).filter(p => !p.includes(`${path.sep}partials${path.sep}`) && !path.basename(p).startsWith('_'))
    .map(p => path.relative(path.join(raiz, 'views'), p).replaceAll(path.sep, '/').replace(/\.ejs$/, ''));
  const cubiertas = new Set([...vistas, ...casos.map(c => fixturePublico(c).vista)]);
  assert.deepEqual(paginas.filter(p => !cubiertas.has(p)), []);
});
test('fuentes EJS, CSS y JS son UTF-8 válido, sin caracteres de reemplazo o mojibake', () => {
  for (const archivo of [...archivos(path.join(raiz, 'views')), ...archivos(path.join(raiz, 'public'))]) {
    if (!/\.(ejs|css|js)$/.test(archivo)) continue;
    const contenido = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(archivo));
    assert.doesNotMatch(contenido, /\uFFFD|\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]/, path.relative(raiz, archivo));
  }
});
for (const caso of casos) {
  test(`página pública renderiza con identidad y estados: ${caso}`, async () => {
    const { vista, datos } = fixturePublico(caso);
    const html = await ejs.renderFile(path.join(raiz, 'views', vista + '.ejs'), datos);
    assert.match(html, /<meta charset="UTF-8">/);
    assert.match(html, /css\/styles.css/); assert.match(html, /css\/publico.css/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /class="saltar"/); assert.match(html, /id="contenido"/);
    assert.doesNotMatch(html, /\uFFFD/);
  });
}
for (const rol of ['superadmin', 'admin_empresa', 'operador']) {
  test(`tabla de usuarios: acciones y empresa según permiso ${rol}`, async () => {
    const datos = fixture('empresa/panelAdmin');
    datos.usuarioActual.rol = rol;
    const html = await ejs.renderFile(path.join(raiz, 'views/admin/_usuarios.ejs'), { ...datos, leyenda: 'Usuarios', sinEmpresa: false });
    for (const titulo of ['Nombre', 'Email', 'Rol', 'Empresa', 'Acceso', 'Acciones']) assert.ok(html.includes(titulo));
    assert.equal(html.includes('Activar operador'), rol !== 'operador');
    assert.equal(html.includes('Reactivar'), rol !== 'operador');
    assert.equal(html.includes('>Consultar '), rol !== 'operador');
    assert.match(html, /Estudio Horizonte/);
  });
}
for (const [vista, etiqueta] of [['admin/empresaNueva', 'Empresas'], ['admin/empresaDetalle', 'Empresas'], ['admin/usuarioNuevo', 'Usuarios'], ['empresa/usuarioNuevo', 'Operadores']]) {
  test(`navegación identifica la sección actual: ${vista}`, async () => {
    const html = await ejs.renderFile(path.join(raiz, 'views', vista + '.ejs'), fixture(vista));
    assert.match(html, new RegExp(`aria-current="page"[^>]*>${etiqueta}</a>`));
  });
}
