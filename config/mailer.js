require('dotenv').config();

const nodemailer = require('nodemailer');

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Faltan las credenciales de Gmail en .env');
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

transporter.verify((error) => {
    if (error) {
        console.error('No se pudo autenticar Gmail SMTP.');
    } else {
        console.log('Servidor de correo listo.');
    }
});

module.exports = transporter;