import express, { json, urlencoded, static as staticserve } from 'express';

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

const server = express();

server.set('port', process.env.PORT || 5005);

config();

const corsConfig = {
  origin: '*',
  credentials: true,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

server.use(morgan('dev'));
server.use(json());
server.use(urlencoded({extended: true}));
server.use(cors(corsConfig));
server.use(staticserve(__dirname + '/public'));

server.use('/api/auth', authRoutes);
server.use('/api/printer', printerRoutes);

server.get('/', (req, res) => {
  res.sendFile(join(__dirname + '/public/index.html'));
});

server.get('*', (req, res) => {
  res.redirect('/');
});

const serverInstance = server.listen(server.get('port'), () => {
  console.log("SERVIDOR PERSONALIZADO PARA IMPRESORA");
  console.log("El servicio actualmente se ejecuta en:");
  console.log('Dirección IP: ' + address());
  console.log('Puerto: ' + server.get('port'));
});
