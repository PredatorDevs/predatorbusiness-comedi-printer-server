import { Router } from 'express';
const router = Router();

import { controller } from '../controllers/authorizations.cjs';

const { authLogin, testPrincerConnection } = controller;

router.post('/test', testPrincerConnection);
router.post('/', authLogin);

export default router;
