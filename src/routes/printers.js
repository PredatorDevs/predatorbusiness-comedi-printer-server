import { Router } from 'express';
const router = Router();

import { controller } from '../controllers/printers.cjs';

const {
  printCCF,
  validatePrinterConnection,
  printTicketKitchen,
  printTicketPreAccount,
  printPackOff,
  printCFTicket,
  printInternalSaleTicket,
  printDteVoucher,
  printTransferVoucher,
  printOrderSaleVoucher,
  printDispatchOrderVoucher,
  printCF,
  testPrinterConnection,
  testNetworkPrinterConnection,
  printTestPage,
  printGuideLines,
  printCharLine,
  printSaleDetailsToNetworkPrinter,
  testCashdrawerOpenAction,
  printSettlementXTicket,
  printSettlementZTicket,
  printManager
} = controller;

router.get('/print-guide-lines', printGuideLines);
router.get('/print-char-line', printCharLine);

router.get('/test-cashdrawer-open', testCashdrawerOpenAction);

router.post('/manager', printManager);

router.get('/test-network', testNetworkPrinterConnection);
router.get('/test', testPrinterConnection);
router.post('/validate-connection', validatePrinterConnection);
router.get('/testpage', printTestPage);
router.post('/ccf', printCCF);
router.post('/cf', printCF);
router.post('/cfticket', printCFTicket);
router.post('/internalsaleticket', printInternalSaleTicket);
router.post('/dtevoucher', printDteVoucher);
router.post('/transfervoucher', printTransferVoucher);
router.post('/ordersalevoucher', printOrderSaleVoucher);
router.post('/dispatchordervoucher', printDispatchOrderVoucher);
router.post('/printTicketKitchen', printTicketKitchen);
router.post('/printTicketPreAccount', printTicketPreAccount);
router.post('/printPackOff', printPackOff);

router.post('/print-sale-details-to-network-printer', printSaleDetailsToNetworkPrinter);
router.post('/settlement-x-ticket', printSettlementXTicket);
router.post('/settlement-z-ticket', printSettlementZTicket);

export default router;
