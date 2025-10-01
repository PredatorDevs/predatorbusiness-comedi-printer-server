import express, { json, urlencoded, static as staticserve } from 'express';
import https from 'https';
import fs from 'fs';
import path from 'path';
import morgan from 'morgan';
import cors from 'cors';

import { config } from 'dotenv';
import { join } from 'path';
import { fileURLToPath } from 'url';

import ip from 'ip';
const { address } = ip;

import authRoutes from './src/routes/authorizations.js';
import printerRoutes from './src/routes/printers.js';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('port', process.env.PORT || 5005);

const corsConfig = {
  origin: 'https://sigprocom.vercel.app', // O añade otras IPs necesarias
  credentials: true,
};

app.use(morgan('dev'));
app.use(json());
app.use(urlencoded({ extended: true }));
app.use(cors(corsConfig));
app.use(staticserve(join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/printer', printerRoutes);

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
  res.redirect('/');
});

// 📜 Lee los certificados
const httpsOptions = {
  key: fs.readFileSync(join(__dirname, 'certs', 'micertificado+3-key.pem')),
  cert: fs.readFileSync(join(__dirname, 'certs', 'micertificado+3.pem')),
};

// 🚀 Arranca servidor HTTPS
https.createServer(httpsOptions, app).listen(app.get('port'), () => {
  console.log("SERVIDOR HTTPS PARA IMPRESORA");
  console.log("El servicio actualmente se ejecuta en:");
  console.log('Dirección IP: ' + address());
  console.log('Puerto: ' + app.get('port'));
});
