const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const { fixture, vistas } = require('./soporte/internoFixtures.cjs');
for (const vista of vistas) {
  test(`vista interna renderiza con fixtures locales: ${vista}`, async () => {
    const html = await ejs.renderFile(path.resolve(__dirname, '../views', vista + '.ejs'), fixture(vista));
    assert.match(html, /<main id="contenido"/);
    assert.match(html, /lang="es"/);
    assert.match(html, /css\/interno.css/);
  });
}
