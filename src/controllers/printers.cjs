const escpos = require('escpos');
const dayjs = require('dayjs');
const fs = require('fs');
const ping = require('ping');
const { exec } = require('child_process');
const { default: formatters } = require('../printers/formatters');
// install escpos-usb adapter module manually

escpos.USB = require('escpos-usb');
escpos.Network = require('escpos-network');

// Select the adapter based on your printer type
// const device  = new escpos.USB(vId, pId);

// const device  = new escpos.Serial('/dev/usb/lp0');

// encoding is optional

const controller = {};

const vId = "8137";
const pId = "8214";

const matrix_vId = "1203";
const matrix_pId = "17717";

controller.printManager = async (req, res) => {
  let device;

  try {
    const { ip, name, port, details, place, type, waiter, status, customerName, tipAmount, customerAddress, customerPhone } = req.body;

    if (!Array.isArray(details)) {
      return res.status(400).json({ message: 'Invalid details' });
    }

    device = new escpos.Network(ip, port);
    const options = { encoding: "857", width: 56 }
    const printer = new escpos.Printer(device, options);

    function openDevice(device) {
      return new Promise((resolve, reject) => {
        device.open((error) => {
          if (error) return reject(error);
          resolve();
        });
      });
    }

    await openDevice(device);

    if (type === 'kitchen') {
      await formatters.kictchenPrinter(printer, { name, details, place, waiter, status, customerName })
    } else if (type === 'precheck') {
      await formatters.printPreCuentaTicket(printer, { name, details, place, waiter, status, customerName, tipAmount, customerAddress, customerPhone });
    }

    return res.status(200).json({ data: "The ticket was printed successfully." });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: error });
  } finally {
    if (device) device.close();
  }
}

controller.printTicketKitchen = async (req, res) => {
  try {
    const { ticketBody } = req.body;
    const { orderDetails, orderInfo, ticketName, date, time } = ticketBody;

    const networkDevices = {};

    const groupProductsByLocation = (orderDetails) => {
      const ubicationsProducts = {};
      orderDetails.forEach(obj => {
        const { ubicationId, ubicationName, printerIP, printerPORT } = obj;

        if (!(ubicationId in ubicationsProducts)) {
          ubicationsProducts[ubicationId] = {};
        }

        if (!(printerIP in ubicationsProducts[ubicationId])) {
          ubicationsProducts[ubicationId][printerIP] = {
            id: ubicationId,
            name: ubicationName,
            ip: printerIP,
            port: printerPORT,
            products: []
          };

          networkDevices[printerIP] = new escpos.Network(printerIP, printerPORT);
        }

        ubicationsProducts[ubicationId][printerIP].products.push(obj);
      });
      return ubicationsProducts;
    };

    const openPrinterConnections = async (networkDevices) => {
      await Promise.all(Object.values(networkDevices).map(networkDevice => {
        return new Promise((resolve, reject) => {
          networkDevice.open(function (error) {
            if (error) {
              console.error('Error al abrir la conexión con la impresora:', error);
              reject(error);
            } else {
              resolve();
            }
          });
        });
      }));
    };

    const closePrinterConnections = async (networkDevices) => {
      await Promise.all(Object.values(networkDevices).map(networkDevice => {
        return new Promise(resolve => {
          networkDevice.close(resolve);
        });
      }));
    };

    const ubicationsProducts = groupProductsByLocation(orderDetails);
    await openPrinterConnections(networkDevices);

    for (const ubicationId in ubicationsProducts) {
      if (ubicationsProducts.hasOwnProperty(ubicationId)) {
        const ips = Object.keys(ubicationsProducts[ubicationId]);

        for (const ip of ips) {
          const { id, name, ip: printerIP, port: printerPORT, products } = ubicationsProducts[ubicationId][ip];
          const printer = new escpos.Printer(networkDevices[ip], { encoding: "857", width: 56 });

          printer
            .font('A')
            .align('LT')
            .style('NORMAL')
            .size(0, 0)
            .text('-----------------------------------------')
            .style('B')
            .text(`Asados El Flaco`)
            .style('NORMAL')
            .text('-----------------------------------------')
            .text(`PARA ${name} ${orderInfo[0].orderTypeId === 2 ? '(A DOMICILIO)' : orderInfo[0].orderTypeId === 3 ? '(PARA LLEVAR)' : ''}`)
            .text(`FECHA: ${date}          HORA: ${time}`)
            .feed(1)
            .text(`Ticket No. ${orderInfo[0].TicketNo}`)
            .text(`${orderInfo[0].fullName}`)
            .feed(1)
            .text(`${orderInfo[0].name}`)
            .text('-----------------------------------------');

          for (const product of products) {
            const { quantity, comments, name } = product;
            const formattedQuantity = parseInt(quantity).toString().padStart(3);
            const formattedComment = comments.trim() !== "" ? `"${comments}"` : '';

            printer
              .style('B')
              .text(`${formattedQuantity}  ${name}`);

            if (formattedComment !== '') {
              printer
                .text(`     ${formattedComment}`);
            }

            printer
              .style('NORMAL');
          }

          printer
            .text('-----------------------------------------')
            .text(`${orderInfo[0].comments}`)
            .text('-----------------------------------------')
            .feed(2)
            .control('FF')
            .cut()
            .close();
        }
      }
    }

    await closePrinterConnections(networkDevices);

    res.json({ data: "Printer connection success!" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
};

controller.printTicketPreAccount = (req, res) => {
  try {

    const { ticketBody } = req.body;
    const { orderDetails, orderInfo, ticketName, date, time } = ticketBody;

    //const networkDevice = new escpos.Network('192.168.1.100', 9100);
    const networkDevice = new escpos.Network('192.168.0.5', 9105);

    const options = { encoding: "857", width: 56 /* default */ }
    const printer = new escpos.Printer(networkDevice, options);

    networkDevice.open(function (error) {

      if (error) {
        console.error('Error al abrir la conexión con la impresora:', error);
        return res.status(500).json({ status: 500, message: 'Error al conectar con la impresora', errorContent: error });
      }

      printer
        .font('A')
        .align('LT')
        .style('NORMAL')
        .size(0, 0)
        .style('B')
        .text(`           P R E C U E N T A`)
        .style('NORMAL')
        .text('-----------------------------------------')
        .text(`Empleado(a): ${orderInfo.fullName}`)
        .text(`FECHA: ${date}            HORA: ${time}`)
        .feed(1)
        .text(`Ticket No. ${orderInfo.TicketNo}`)
        .text(`${orderInfo.Client}`)
        .text('-----------------------------------------')

      for (let i = 0; i < orderDetails.length; i++) {
        const { quantity, name, totalDetail } = orderDetails[i];
        const formattedQuantity = parseInt(quantity).toString().padStart(3);
        const formattedTotal = parseFloat(totalDetail).toFixed(2);

        printer
          .style('B')
          .text(`${formattedQuantity}  ${name}          $${formattedTotal}`)
          .style('NORMAL');
      }

      printer
        .text('-----------------------------------------')
        .style('B')
        .text(`Total a Pagar:                 $${parseFloat(orderInfo.total).toFixed(2)}`)
        .style('NORMAL');

      printer
        .feed(2)
        .control('FF')
        .cut()
        .close((err) => {
          if (err) {
            res.status(500).json({ status: 500, message: 'Printer connection failed!', errorContent: err });
          } else {
            res.json({ data: "Printer connection success!" });
          }
        });
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
};

controller.printPackOff = (req, res) => {
  try {

    const { ticketBody } = req.body;
    const { orderDetails, clientInfo, orderInfo, ticketName, date, time } = ticketBody;
    const networkDevice = new escpos.Network('192.168.1.100', 9100);

    const options = { encoding: "857", width: 56 /* default */ }
    const printer = new escpos.Printer(networkDevice, options);

    networkDevice.open(function (error) {

      if (error) {
        console.error('Error al abrir la conexión con la impresora:', error);
        return res.status(500).json({ status: 500, message: 'Error al conectar con la impresora', errorContent: error });
      }

      printer
        .font('A')
        .align('LT')
        .style('NORMAL')
        .size(0, 0)
        .text('-----------------------------------------')
        .style('B')
        .text(`Asados El Flaco`)
        .style('NORMAL')
        .text('-----------------------------------------')
        .text(`Empleado(a): ${orderInfo.fullName}`)
        .text(`FECHA: ${date}            HORA: ${time}`)
        .feed(1)
        .text(`Ticket No. ${orderInfo.TicketNo}`)
        .text(`${orderInfo.Client}`)
        .feed(2)
        .text(`Direccion: ${clientInfo.FullAddress}`);

      if (clientInfo.reference !== '') {
        printer
          .text(`Referencias: ${clientInfo.reference}`);
      }

      printer
        .text(`DUI: ${clientInfo.dui}`)
        .text(`Telefono: ${clientInfo.phoneNumber}`);

      if (orderInfo.comments !== '') {
        printer
          .text(`Indicaciones Adicionales: ${orderInfo.comments}`)
      }

      printer
        .text('-----------------------------------------');

      for (let i = 0; i < orderDetails.length; i++) {
        const { quantity, name, totalDetail } = orderDetails[i];
        const formattedQuantity = parseInt(quantity).toString().padStart(3); // Asegura que la cantidad tenga una longitud fija
        const formattedTotal = parseFloat(totalDetail).toFixed(2); // Asegura que el total tenga una longitud fija

        printer
          .style('B')
          .text(`${formattedQuantity}  ${name}          $${formattedTotal}`)
          .style('NORMAL');
      }

      printer
        .text('-----------------------------------------')
        .style('B')
        .text(`Total a Pagar:                 $${parseFloat(orderInfo.total).toFixed(2)}`)
        .style('NORMAL');

      printer
        .feed(2)
        .control('FF')
        .cut()
        .close((err) => {
          if (err) {
            res.status(500).json({ status: 500, message: 'Printer connection failed!', errorContent: err });
          } else {
            res.json({ data: "Printer connection success!" });
          }
        });
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
};

controller.testNetworkPrinterConnection = (req, res) => {
  try {
    // const device  = new escpos.USB(vId, pId);
    // const networkDevice = new escpos.Network('127.0.0.1', 9105);
    const networkDevice = new escpos.Network('192.168.1.100', 9100);

    const options = { encoding: "857", width: 56 /* default */ }
    const printer = new escpos.Printer(networkDevice, options);

    const remoteAddress = req.headers['x-real-ip'] || req.connection.remoteAddress;

    networkDevice.open(function (error) {
      if (error) {
        console.error('Error al abrir la conexión con la impresora:', error);
        return res.status(500).json({ status: 500, message: 'Error al conectar con la impresora', errorContent: error });
      }

      printer
        .font('A')
        .align('LT')
        .style('NORMAL')
        .size(0, 0)
        .text(`You are printing from ${remoteAddress || ''}`)
        .text(`Prueba SigPro`)
        .control('FF')
        .cut()
        .close((err) => {
          if (err) {
            res.status(500).json({ status: 500, message: 'Printer connection failed!', errorContent: err });
          } else {
            res.json({ data: "Printer connection success!" });
          }
        });
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.testPrinterConnection = (req, res) => {
  try {
    console.log(escpos.USB.findPrinter());

    //const device  = new escpos.USB(vId, pId);
    const device = new escpos.Network('192.168.0.4', 9101);
    const options = { encoding: "857", width: 56 /* default */ }
    const printer = new escpos.Printer(device, options);

    device.open(function (error) {
      printer.close((err) => {
        if (err) {
          res.status(500).json({ status: 500, message: 'Printer connection failed!', errorContent: err });
        } else {
          res.json({ data: "Printer connection success!" });
        }
      });
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.testCashdrawerOpenAction = (req, res) => {
  try {
    // const device = new escpos.USB(vId, pId);
    const device = new escpos.Network('192.168.0.130', 9100);

    console.log("HOLA VOY A ABRIR LA CAJA");
    
    const options = { encoding: "857", width: 48 /* default */ }
    const printer = new escpos.Printer(device, options);

    device.open(function (error) {
      printer
        // .feed(2)
        .cashdraw(2)
        .close((err) => {
          if (err) {
            res.json({ data: "Print error" });
          } else {
            res.json({ data: "Print success" });
          }
        });
    });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.validatePrinterConnection = async (req, res) => {
  try {
    const { ip, port } = req.body;

    const printerOnline = await checkPrinterOnline(ip);

    if (printerOnline) {
      res.status(200).json({ message: 'Printer Ready to Work!' });
    } else {
      res.status(400).json({ error: 'Printer not found!' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Printer not found!' });
  }
};

async function checkPrinterOnline(ipAddress) {
  try {
    const res = await ping.promise.probe(ipAddress);
    return res.alive;
  } catch (error) {
    console.error('Error al ejecutar ping:', error);
    return false;
  }
}

controller.printTestPage = (req, res) => {
  try {
    const device = new escpos.USB(vId, pId);
    // const device = new escpos.Network('127.0.0.1', 9101);
    // const device = new escpos.Network('172.26.96.1', 9101);
    // const device = new escpos.Network('192.168.0.4', 9101);
    const options = { encoding: "857", width: 56 /* default */ }
    const printer = new escpos.Printer(device, options);

    const remoteAddress = req.headers['x-real-ip'] || req.connection.remoteAddress;

    device.open(function (error) {
      const now = new Date();
      const formatDate = now.toLocaleDateString();
      const formatTime = now.toLocaleTimeString();
      const clientIp = remoteAddress || 'Unknown';

      printer
        // ============= ENCABEZADO =============
        // .align('CT')
        // .style('B')
        // .size(0, 0)
        // .text('*********************')
        // .text('*    SigProCOM    *') // Cambia aquí tu marca
        // .text('*********************')
        // .feed(1)
        
        // ============= LOGO ASCII =============
        .align('CT')
        .size(0, 0)
        .style('NORMAL')
        // .text('   ___       __                  ')
        // .text('  / _ \\___  / /__ ___ _  ___ ___ ')
        // .text(' / , _/ _ \\/ / -_) _ `/ (_-</ -_)')
        // .text('/_/|_|\\___/_/\\__/\\_,_/ /___/\\__/ ')
        .text('  _________.__      __________                ')
        .text(' /   _____/|__| ____\______   \_______  ____  ')
        .text(' \_____  \ |  |/ ___\|     ___/\_  __ \/  _ \ ')
        .text(' /        \|  / /_/  >    |     |  | \(  <_> )')
        .text('/_______  /|__\___  /|____|     |__|   \____/ ')
        .text('        \/   /_____/                          ')

        // ============= BORDE SUPERIOR =============
        .text('================================')
        .align('CT')
        .text('      PRUEBA DE IMPRESIÓN')
        .text('================================')

        // ============= INFO GENERAL =============
        .align('LT')
        .text(`Fecha: ${formatDate}`)
        .text(`Hora:  ${formatTime}`)
        .text(`IP del Cliente: ${clientIp}`)
        .feed(1)

        // ============= DIAGNÓSTICO =============
        .text('Diagnóstico de instalación:')
        .text('[v] Conexión establecida')
        .text('[v] Comunicación correcta con impresora')
        .text('[v] Driver ESC/POS activo')
        .text('[v] Codificación aplicada correctamente')
        // ============= BORDE =============
        .align('CT')
        .text('--------------------------------')
        // ============= QR CODE =============
        // QR de tu sitio, WhatsApp o panel de cliente
        .qrimage('https://sigprocom.vercel.app', { type: 'png', mode: 'dhdw', size: 3 }, function (err) {
          console.log(err);
          // ============= DATOS DE CONTACTO =============
          printer.align('CT')
          .text('Escanea el código QR')
          .text('para más información')
          .feed(1)
          .text('--------------------------------')
          .text('CONTACTO Y SOPORTE')
          .text('--------------------------------')
          .align('LT')
          .text('Teléfono: +503 7260-2996')
          .text('Email: info@sigpro.dev')
          .text('Web: https://sigprocom.vercel.app')
          // ============= MENSAJE FINAL =============
          .align('CT')
          .text('================================')
          .text('Gracias por confiar en nosotros')
          .text('Su impresora está funcionando')
          .text('correctamente')
          .text('================================')
          .feed(1)
          .cut()
          .close((err) => {
            if (err) {
              res.status(500).json({ status: 500, message: 'Printer connection failed!', errorContent: err });
            } else {
              res.json({ data: "Printer connection success!" });
            }
          });
        })
      });

  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printCCF = (req, res) => {
  try {
    const device = new escpos.USB(matrix_vId, matrix_pId);
    const options = { encoding: "857", width: 56 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerState, customerNit, customerNRC, customerBusinessType, taxableSale, totalTaxes, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, taxableSale }]

    const { invoiceHeaderData, invoiceBodyData } = req.body;

    if (invoiceHeaderData === undefined || invoiceBodyData === undefined) {
      throw "You must provide a header and body sale data to print";
    }

    const {
      customerFullname,
      documentDatetime,
      customerAddress,
      customerState,
      customerNit,
      paymentTypeName,
      customerNrc,
      customerDui,
      customerBusinessType,
      customerDepartmentName,
      taxableSale,
      taxableSaleWithoutTaxes,
      noTaxableSale,
      totalTaxes,
      totalSale,
      totalToLetters
    } = invoiceHeaderData;

    let totalToLettersSplited = (totalToLetters || " ( ").split("(", 2);
    let totalToLettersPartOne = totalToLettersSplited[0];
    let totalToLettersPartTwo = `(${totalToLettersSplited[1]}`;

    device.open(function (error) {
      printer
        .font('A')
        .align('LT')
        .style('NORMAL')
        .size(0, 0)
        .marginLeft(3)
        .marginRight(4)
        .feed(7) // LINE 1 - 7
        .feed(2) // LINE 8 - 9
        .tableCustom(
          [
            { text: ``, align: "LEFT", width: 0.75 },
            { text: `${documentDatetime || ''}`, align: "LEFT", width: 0.25 }
          ]
        ) // LINE 10
        .text(`     ${customerFullname.substring(0, 50) || ''}`) // LINE 11 CLIENTE NAME
        .feed(1) // LINEA 12
        .tableCustom(
          [
            { text: `     ${customerAddress.substring(0, 45) || ''}`, align: "LEFT", width: 0.7 },
            { text: `${customerNrc || ''}`, align: 'RIGHT', width: 0.3 }
          ]
        ) // LINE 13
        .tableCustom(
          [
            { text: `         ${customerDepartmentName.substring(0, 31) || ''}`, align: "LEFT", width: 0.60 },
            { text: `${customerBusinessType.substring(0, 19) || ''}`, align: "RIGHT", width: 0.40 }
          ]
        ) // LINE 12
        .tableCustom(
          [
            { text: `         ${customerDui || customerNit || ''}`, align: "LEFT", width: 0.80 },
            { text: `${paymentTypeName || ''}`, align: "RIGHT", width: 0.20 },
          ]
        ) // LINE 13
        .feed(1) // LINE 14
        .tableCustom(
          [
            { text: `    `.substring(0, 26), align: "LEFT", width: 1 }
          ]
        ) // LINE 15
        .feed(3); // LINE 17 - 18
      for (let i = 0; i < invoiceBodyData.length; i++) {
        printer.font('A')
          .align('LT')
          .style('NORMAL')
          .size(0, 0)
          .marginLeft(3)
          .marginRight(5)
          .tableCustom(
            [
              { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.07 },
              { text: `${invoiceBodyData[i].productName || ""}`.substring(0, 35), align: "LEFT", width: 0.57 },
              // { text: "", align: "LEFT", width: 0.11 },
              { text: `${invoiceBodyData[i].unitPriceNoTaxes || 0}`, align: "LEFT", width: 0.11 },
              // { text: `${invoiceBodyData[i].noTaxableSubTotal || ''}`, align: "LEFT", width: 0.13 },
              { text: `${''}`, align: "LEFT", width: 0.15 },
              { text: `${invoiceBodyData[i].taxableSubTotalWithoutTaxes || 0}`, align: "RIGHT", width: 0.11 }
            ]
          );
      }
      printer.font('A')
        .align('LT')
        .style('NORMAL')
        .size(0, 0)
        .marginLeft(3)
        .marginRight(4)
        .feed(14 - +invoiceBodyData.length) // LINE 19 - 36
        .tableCustom(
          [
            { text: `    ${totalToLettersPartOne || ''}`, align: "LEFT", width: 0.50 },
            { text: "", align: "LEFT", width: 0.35 },
            { text: `  ${taxableSaleWithoutTaxes || 0}`, align: "LEFT", width: 0.16 }
          ]
        ) // LINE 38
        .tableCustom(
          [
            { text: `    ${totalToLettersPartTwo || ''}`, align: "LEFT", width: 0.50 },
            { text: "", align: "LEFT", width: 0.35 },
            { text: ``, align: "LEFT", width: 0.16 } // AQUI PUEDE IR EL DESCUENTO
          ]
        ) // LINE 39
        .tableCustom(
          [
            { text: ``, align: "LEFT", width: 0.50 },
            { text: "", align: "LEFT", width: 0.35 },
            { text: `  ${totalTaxes || 0}`, align: "LEFT", width: 0.16 } // AQUI PUEDE IR EL DESCUENTO
          ]
        ) // LINE 39
        .tableCustom(
          [
            { text: "", align: "LEFT", width: 0.89 },
            { text: `  ${(Number(taxableSaleWithoutTaxes) + Number(totalTaxes)).toFixed(2) || 0}`, align: "LEFT", width: 0.16 }
          ]
        ) // LINE 42
        .feed(4) // LINE 43 - 45
        .tableCustom(
          [
            { text: "", align: "LEFT", width: 0.89 },
            { text: `  ${''}`, align: "LEFT", width: 0.16 } // noTaxableSale
          ]
        ) // LINE 46
        .tableCustom(
          [
            { text: "", align: "LEFT", width: 0.89 },
            { text: `  ${totalSale || 0}`, align: "LEFT", width: 0.16 }
          ]
        ) // LINE 47
        .marginLeft(0)
        .marginRight(0)
        .control('FF')
        .close((err) => {
          if (err) {
            res.json({ data: "Print error" });
          } else {
            res.json({ data: "Print success" });
          }
        });
    });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printCFTicket = (req, res) => {
  try {
    // const device  = new escpos.USB(vId, pId);
    const device = new escpos.Network('127.0.0.1', 9105);
    const options = { encoding: "857", width: 48 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]
    const { invoiceHeaderData, invoiceBodyData } = req.body;

    if (invoiceHeaderData === undefined || invoiceBodyData === undefined) {
      throw "You must provide a header and body sale data to print";
    }

    const {
      customerFullname,
      documentDatetime,
      customerAddress,
      customerDui,
      customerNit,
      customerPhone,
      paymentTypeName,
      totalSale,
      totalToLetters
    } = invoiceHeaderData;

    let totalToLettersSplited = (totalToLetters || " ( ").split("(", 2);
    let totalToLettersPartOne = totalToLettersSplited[0];
    let totalToLettersPartTwo = `(${totalToLettersSplited[1]}`;

    device.open(function (error) {
      printer
        .font('A')
        .align('CT')
        .style('NORMAL')
        .size(0, 0)
        .text('LLANTERIA CORINTO')
        .text('Corinto, Morazan')
        .text(`Tel: ${'26666666'}`)
        .text(`NIT: ${'0000-000000-000-0'} - NRC: ${'00000-0'}`)
        .feed(1)
        .align('LT')
        .tableCustom([
          { text: `TICKET-${"0001"}`, align: "LEFT", width: 0.50 },
          { text: `COND: ${"CONTADO"}`, align: "RIGHT", width: 0.50 }
        ])
        .tableCustom([
          { text: `CAJA: ${'000'}`, align: "LEFT", width: 0.50 },
          { text: `SUC: ${"0000"}`, align: "RIGHT", width: 0.50 }
        ])
        .text(`Fecha: ${documentDatetime}`)
        .text(`Cliente: ${customerFullname}`)
        .text(`DUI o NIT: ${customerDui || customerNit || '-'}`)
        .feed(1) // LINE 9
        .align('CT')
        .text('------------------------------------------')
        .tableCustom([
          { text: `DESCRIPCION`, align: "LEFT", width: 1 }
        ])
        .tableCustom([
          { text: `CANT.`, align: "LEFT", width: 0.25 },
          { text: `PRES.`, align: "LEFT", width: 0.25 },
          { text: `PRE. UNI.`, align: "RIGHT", width: 0.25 },
          { text: `SUBTOTAL`, align: "RIGHT", width: 0.25 }
        ])
        .text('------------------------------------------')
      for (let i = 0; i < invoiceBodyData.length; i++) {
        printer.tableCustom([
          { text: `${invoiceBodyData[i].productName || ""}`, align: "LEFT", width: 1 }
        ])
          .tableCustom([
            { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.25 },
            { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
            { text: `${invoiceBodyData[i].unitPrice || 0}`, align: "RIGHT", width: 0.25 },
            { text: `${invoiceBodyData[i].subTotal || 0}`, align: "RIGHT", width: 0.25 }
          ]);

        if ((i + 1) < invoiceBodyData.length) printer.feed(1);
      } // LINE 15
      printer.text('------------------------------------------')
        .tableCustom([
          { text: `SUMAS`, align: "LEFT", width: 0.25 },
          { text: ``, align: "LEFT", width: 0.25 },
          { text: ``, align: "RIGHT", width: 0.25 },
          { text: `${totalSale || 0}`, align: "RIGHT", width: 0.25 }
        ])
        .tableCustom([
          { text: `TOTAL`, align: "LEFT", width: 0.25 },
          { text: ``, align: "LEFT", width: 0.25 },
          { text: ``, align: "RIGHT", width: 0.25 },
          { text: `${totalSale || 0}`, align: "RIGHT", width: 0.25 }
        ])
        .align('CT')
        .feed(1)
        .text('*** SIN EFECTO FISCAL ***')
        .feed(2)
        .control('FF')
        .cut()
        .feed(2)
        // .cashdraw(2)
        .close((err) => {
          if (err) {
            res.json({ data: "Print error" });
          } else {
            res.json({ data: "Print success" });
          }
        });
    });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printInternalSaleTicket = (req, res) => {
  try {
    // const device  = new escpos.USB(vId, pId);
    const device = new escpos.Network('127.0.0.1', 9105);
    const options = { encoding: "857", width: 48 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]
    const { invoiceHeaderData, invoiceBodyData } = req.body;

    if (invoiceHeaderData === undefined || invoiceBodyData === undefined) {
      throw "You must provide a header and body sale data to print";
    }

    const {
      customerFullname,
      locationName,
      documentTypeName,
      docNumber,
      documentDatetime,
      customerAddress,
      customerDui,
      customerNit,
      customerPhone,
      paymentTypeName,
      totalSale,
      totalToLetters
    } = invoiceHeaderData;

    let totalToLettersSplited = (totalToLetters || " ( ").split("(", 2);
    let totalToLettersPartOne = totalToLettersSplited[0];
    let totalToLettersPartTwo = `(${totalToLettersSplited[1]}`;

    device.open(function (error) {
      printer
        .font('A')
        .align('CT')
        .style('NORMAL')
        .size(0, 0)
        .text('LLANTERIA CORINTO Y TALLER AMAYA')
        .text('BO. LA ALIANZA, CORINTO, MORAZAN')
        .text(`Tel: ${'7339-2091'}`)
        .text('*** TICKET DE CONTROL INTERNO ***')
        // .text(`NIT: ${'0000-000000-000-0'} - NRC: ${'00000-0'}`)
        .feed(1)
        .align('LT')
        .tableCustom([
          { text: `DOC: ${documentTypeName} ${docNumber}`, align: "LEFT", width: 0.65 },
          { text: `COND: ${String(paymentTypeName).toUpperCase()}`, align: "RIGHT", width: 0.35 }
        ])
        .tableCustom([
          { text: ``, align: "LEFT", width: 0.50 },
          { text: `SUC: ${String(locationName).toUpperCase()}`, align: "RIGHT", width: 0.50 }
        ])
        .text(`Fecha: ${documentDatetime}`)
        .text(`Cliente: ${customerFullname}`)
        .text(`DUI o NIT: ${customerDui || customerNit || '-'}`)
        .feed(1) // LINE 9
        .align('CT')
        // .text('------------------------------------------------')
        // .tableCustom([
        //   { text: `DESCRIPCION`, align: "LEFT", width: 1 }
        // ])
        // .style('U')
        .tableCustom([
          // { text: `CANT.`, align: "LEFT", width: 0.15 },
          { text: `DESCRIPCION`, align: "LEFT", width: 0.55 },
          // { text: `PRES.`, align: "LEFT", width: 0.25 },
          { text: ``, align: "RIGHT", width: 0.25 },
          { text: `SUBTOTAL`, align: "RIGHT", width: 0.20 }
        ])
        .text('------------------------------------------------')
      // .feed(1)
      for (let i = 0; i < invoiceBodyData.length; i++) {
        // printer.tableCustom([
        //   { text: `${invoiceBodyData[i].productName || ""}`, align: "LEFT", width: 1 }
        // ])
        printer.style('U').tableCustom([
          // { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.15 },
          { text: `${invoiceBodyData[i].productName || ""}`, align: "LEFT", width: 0.55 },
          // { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
          { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0} x ${invoiceBodyData[i].unitPrice || 0}`, align: "RIGHT", width: 0.25 },
          { text: `${invoiceBodyData[i].subTotal || 0}`, align: "RIGHT", width: 0.20 }
        ]);

        if ((i + 1) < invoiceBodyData.length) printer.feed(1);
      } // LINE 15
      printer.style('NORMAL')
        // .feed(1)
        .text('------------------------------------------------')
        // .text('------------------------------------------')
        .tableCustom([
          { text: `SUMAS`, align: "LEFT", width: 0.30 },
          { text: ``, align: "LEFT", width: 0.25 },
          { text: ``, align: "RIGHT", width: 0.25 },
          { text: `${totalSale || 0}`, align: "RIGHT", width: 0.20 }
        ])
        .tableCustom([
          { text: `TOTAL`, align: "LEFT", width: 0.30 },
          { text: ``, align: "LEFT", width: 0.25 },
          { text: ``, align: "RIGHT", width: 0.25 },
          { text: `${totalSale || 0}`, align: "RIGHT", width: 0.20 }
        ])
        .align('CT')
        .feed(1)
        .text('*** SIN EFECTO FISCAL ***')
        .feed(2)
        .control('FF')
        .cut()
        // .feed(2)
        // .cashdraw(2)
        .close((err) => {
          if (err) {
            res.json({ data: "Print error" });
          } else {
            res.json({ data: "Print success" });
          }
        });
    });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printDteVoucher = (req, res) => {
  try {
    const { useNetworkPrint } = req.query;
    const { invoiceHeaderData, invoiceBodyData, cashierPrinterIp, cashierPrinterPort } = req.body;

    let device;

    if (+useNetworkPrint === 1) {
      // console.log("Using network printer");
      // console.log(cashierPrinterIp || '192.168.1.100', cashierPrinterPort || 9100);
      device = new escpos.Network(cashierPrinterIp || '192.168.1.100', cashierPrinterPort || 9100);
    } else {
      device = new escpos.USB(vId, pId);
    }
    // const device  = new escpos.USB(vId, pId);
    // const device = new escpos.Network('127.0.0.1', 9105);
    const options = { encoding: "857", width: 48 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]

    if (invoiceHeaderData === undefined || invoiceBodyData === undefined) {
      throw "You must provide a header and body sale data to print";
    }

    const {
      cashierId,
      controlNumber,
      cotransTaxAmount,
      createdBy,
      createdByFullname,
      currencyType,
      customerAddress,
      customerBusinessLine,
      customerCityMhCode,
      customerCityName,
      customerCode,
      customerDefPhoneNumber,
      customerDepartmentMhCode,
      customerDepartmentName,
      customerDui,
      customerEconomicActivityCode,
      customerEconomicActivityName,
      customerEmail,
      customerFullname,
      customerId,
      customerNit,
      customerNrc,
      customerOccupation,
      docDate,
      docDatetime,
      docDatetimeFormatted,
      docDatetimeLabel,
      docNumber,
      docTime,
      documentTypeId,
      documentTypeName,
      dteTransmitionStatus,
      dteTransmitionStatusName,
      dteType,
      establishmentType,
      estCodeInternal,
      estCodeMH,
      expirationDays,
      expirationInformation,
      expired,
      expiresIn,
      fovialTaxAmount,
      generationCode,
      id: currentSaleId,
      isNoTaxableOperation,
      isVoided,
      IVAperception,
      IVAretention,
      ivaTaxAmount,
      locationAddress,
      locationCityMhCode,
      locationCityName,
      locationDepartmentMhCode,
      locationDepartmentName,
      locationEmail,
      locationId,
      locationName,
      locationPhone,
      noTaxableSubTotal,
      ownerActivityCode,
      ownerActivityDescription,
      ownerName,
      ownerNit,
      ownerNrc,
      ownerTradename,
      order_type,
      orderCustomerComplementaryName,
      paymentStatus,
      paymentStatusName,
      paymentTypeId,
      paymentTypeName,
      posCodeInternal,
      posCodeMH,
      receptionStamp,
      saleTotalPaid,
      serie,
      shiftcutId,
      taxableSubTotal,
      taxableSubTotalWithoutTaxes,
      total,
      totalInLetters,
      totalTaxes,
      tourismTaxAmount,
      transmissionModel,
      transmissionModelName,
      transmissionType,
      transmissionTypeName,
      tip,
      cashReceived,
      userPINCodeFullName,
      voidedByFullname,
      dteVoucherFooterMessage,
      notes
    } = invoiceHeaderData;

    let totalToLettersSplited = (totalInLetters || " ( ").split("(", 2);
    let totalToLettersPartOne = totalToLettersSplited[0];
    let totalToLettersPartTwo = `(${totalToLettersSplited[1]}`;

    device.open(function (error) {
      printer
        .font('A')
        .align('CT')
        .style('NORMAL')
        .size(1, 0);
      
      if (ownerTradename) printer.text(ownerTradename.toUpperCase() || '');

      printer.size(0, 0);

      if (ownerName) printer.text(ownerName.toUpperCase() || '');
      if (ownerActivityDescription) printer.text(`${ownerActivityDescription}`.toUpperCase() || '');

      printer
        .text(`NIT: ${ownerNit || ''} - NRC: ${ownerNrc || ''}`)
        .text(locationAddress || '')
        .text(locationPhone || '')
        // .text('*** TICKET DE CONTROL INTERNO ***')
        // .text(`NIT: ${'0000-000000-000-0'} - NRC: ${'00000-0'}`)
        .feed(1)
        .align('LT')
        .tableCustom([
          { text: `COD INTERNO: ${currentSaleId}`, align: "LEFT", width: 0.50 },
          { text: `COND: ${String(paymentTypeName).toUpperCase()}`, align: "RIGHT", width: 0.50 }
        ])
        .tableCustom([
          { text: `DOC: ${documentTypeName}`, align: "LEFT", width: 0.50 },
          { text: `SUC: ${String(locationName).toUpperCase()}`, align: "RIGHT", width: 0.50 }
        ])
        .text(`FECHA: ${dayjs(docDatetime).format('YYYY-MM-DD hh:mm:ss')}`)
        .text(`CLIENTE: ${customerFullname}`);

      if (order_type === 'domicilio') {
        if (orderCustomerComplementaryName) printer.text(`DOMICILIO PARA: ${orderCustomerComplementaryName}`);
      }

      if (customerId !== 1) {
        printer.text(`DUI: ${customerDui || '-'}`)
        .text(`NIT: ${customerNit || '-'}`)
        .text(`NRC: ${customerNrc || '-'}`);
      }

      printer.feed(1) // LINE 9
        .align('CT')
        // .text('------------------------------------------------')
        // .tableCustom([
        //   { text: `DESCRIPCION`, align: "LEFT", width: 1 }
        // ])
        // .style('U')
        .tableCustom([
          // { text: `CANT.`, align: "LEFT", width: 0.15 },
          { text: `DESCRIPCION`, align: "LEFT", width: 0.55 },
          // { text: `PRES.`, align: "LEFT", width: 0.25 },
          { text: ``, align: "RIGHT", width: 0.25 },
          { text: `SUBTOTAL`, align: "RIGHT", width: 0.20 }
        ])
        .text('------------------------------------------------')
      // .feed(1)
      for (let i = 0; i < invoiceBodyData.length; i++) {
        const {
          saleDetailId,
          saleId,
          productId,
          productTypeId,
          productCode,
          productName,
          productMeasurementUnitId,
          categoryName,
          brandName,
          measurementUnitName,
          unitPrice,
          unitPriceNoTaxes,
          unitPriceIva,
          unitPriceFovial,
          unitPriceCotrans,
          unitPriceTourism,
          unitCost,
          unitCostNoTaxes,
          subTotalCost,
          totalCostTaxes,
          totalCost,
          quantity,
          subTotal,
          isVoided,
          isActive,
          taxesData,
          ivaTaxAmount,
          fovialTaxAmount,
          cotransTaxAmount,
          tourismTaxAmount,
          totalTaxes,
          taxableSubTotal,
          taxableSubTotalWithoutTaxes,
          noTaxableSubTotal
        } = invoiceBodyData[i];
        // printer.tableCustom([
        //   { text: `${invoiceBodyData[i].productName || ""}`, align: "LEFT", width: 1 }
        // ])
        printer.style('U').tableCustom([
          // { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.15 },
          { text: `${productName || ""}`, align: "LEFT", width: 0.99 },
          // { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
          // { text: `${Number(quantity).toFixed(4) || 0} x ${(+unitPrice - (+unitPriceFovial + +unitPriceCotrans + (isNoTaxableOperation ? +unitPriceIva : 0))).toFixed(4) || 0}`, align: "RIGHT", width: 0.25 },
          // { text: `${(isNoTaxableOperation === 1 ? (+noTaxableSubTotal - +ivaTaxAmount - +fovialTaxAmount - +cotransTaxAmount) : (+taxableSubTotal - ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount) - +fovialTaxAmount - +cotransTaxAmount)).toFixed(4) || 0}`, align: "RIGHT", width: 0.20 }
        ]);

        printer.style('U').tableCustom([
          // { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.15 },
          // { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
          { text: `${Number(quantity).toFixed(4) || 0} x $${(+unitPrice - (+unitPriceFovial + +unitPriceCotrans + +unitPriceTourism + (isNoTaxableOperation ? +unitPriceIva : 0))).toFixed(4) || 0}`, align: "LEFT", width: 0.50 },
          { text: `${(isNoTaxableOperation === 1 ? (+noTaxableSubTotal - +ivaTaxAmount - +fovialTaxAmount - +cotransTaxAmount - +tourismTaxAmount) : (+taxableSubTotal - ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount) - +fovialTaxAmount - +cotransTaxAmount - +tourismTaxAmount)).toFixed(4) || 0}`, align: "RIGHT", width: 0.50 }
        ]);

        if ((i + 1) < invoiceBodyData.length) printer.feed(1);
      } // LINE 15
      printer.style('NORMAL')
        // .feed(1)
        .text('------------------------------------------------')
        // .text('------------------------------------------')
      // Solo mostrar GRAVADO si el valor es mayor a 0
      const gravadoAmount = isNoTaxableOperation ? 0 : taxableSubTotal - ((+fovialTaxAmount + +cotransTaxAmount + +tourismTaxAmount + ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount)) || 0);
      if (gravadoAmount > 0) {
        printer.tableCustom([
          { text: `GRAVADO`, align: "RIGHT", width: 0.75 },
          { text: `${gravadoAmount.toFixed(2)}`, align: "RIGHT", width: 0.25 }
        ]);
      }
      
      // Solo mostrar EXENTO si el valor es mayor a 0
      const exentoAmount = isNoTaxableOperation ? taxableSubTotalWithoutTaxes : 0;
      if (exentoAmount > 0) {
        printer.tableCustom([
          { text: `EXENTO`, align: "RIGHT", width: 0.75 },
          { text: `${exentoAmount.toFixed(2)}`, align: "RIGHT", width: 0.25 }
        ]);
      }
      
      printer.tableCustom([
        { text: `SUMA TOTAL DE OPERACIONES`, align: "RIGHT", width: 0.75 },
        { text: `${(isNoTaxableOperation ? taxableSubTotalWithoutTaxes : taxableSubTotal - ((+fovialTaxAmount + +cotransTaxAmount + +tourismTaxAmount + ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount)))).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ]);
      if (!(documentTypeId === 1 || documentTypeId === 2)) {
        printer.tableCustom([
          { text: `IVA`, align: "RIGHT", width: 0.75 },
          // { text: ``, align: "LEFT", width: 0.25 },
          // { text: ``, align: "RIGHT", width: 0.25 },
          { text: `${Number(isNoTaxableOperation ? 0 : ivaTaxAmount).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
        ]);
      }
      printer.tableCustom([
        { text: `SUBTOTAL`, align: "RIGHT", width: 0.75 },
        { text: `${(isNoTaxableOperation ? taxableSubTotalWithoutTaxes : taxableSubTotal - ((+fovialTaxAmount + +cotransTaxAmount + +tourismTaxAmount))).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ]);
      
      // Solo mostrar IVA PERCIBIDO si el valor es mayor a 0
      if (+IVAperception > 0) {
        printer.tableCustom([
          { text: `IVA PERCIBIDO (1%)`, align: "RIGHT", width: 0.75 },
          { text: `${Number(IVAperception).toFixed(2)}`, align: "RIGHT", width: 0.25 }
        ]);
      }
      
      // Solo mostrar IVA RETENIDO si el valor es mayor a 0
      if (+IVAretention > 0) {
        printer.tableCustom([
          { text: `IVA RETENIDO (1%)`, align: "RIGHT", width: 0.75 },
          { text: `${Number(IVAretention).toFixed(2)}`, align: "RIGHT", width: 0.25 }
        ]);
      }
      if (+fovialTaxAmount !== null && +fovialTaxAmount > 0) {
        printer.tableCustom([
          { text: `FOVIAL ($0.20/gal)`, align: "RIGHT", width: 0.75 },
          // { text: ``, align: "LEFT", width: 0.25 },
          // { text: ``, align: "RIGHT", width: 0.25 },
          { text: `${Number(fovialTaxAmount).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
        ]);
      }
      if (+cotransTaxAmount !== null && +cotransTaxAmount > 0) {
        printer.tableCustom([
          { text: `COTRANS ($0.10/gal)`, align: "RIGHT", width: 0.75 },
          // { text: ``, align: "LEFT", width: 0.25 },
          // { text: ``, align: "RIGHT", width: 0.25 },
          { text: `${Number(cotransTaxAmount).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
        ]);
      }
      if (+tourismTaxAmount !== null && +tourismTaxAmount > 0) {
        printer.tableCustom([
          { text: `TURISMO (5%)`, align: "RIGHT", width: 0.75 },
          // { text: ``, align: "LEFT", width: 0.25 },
          // { text: ``, align: "RIGHT", width: 0.25 },
          { text: `${Number(tourismTaxAmount).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
        ]);
      }
      
      // Solo mostrar RETE. RENTA si el valor es mayor a 0
      const reteRentaAmount = Number(0); // Este valor parece estar hardcodeado en 0
      if (reteRentaAmount > 0) {
        printer.tableCustom([
          { text: `RETE. RENTA`, align: "RIGHT", width: 0.75 },
          { text: `${reteRentaAmount.toFixed(2)}`, align: "RIGHT", width: 0.25 }
        ]);
      }
      
      printer.tableCustom([
        { text: `MONTO TOTAL OPERACION`, align: "RIGHT", width: 0.75 },
        { text: `${Number(+total - (isNoTaxableOperation ? +ivaTaxAmount : 0) - +IVAretention + +IVAperception).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ]);      
      if (+tip !== null && +tip > 0) {
        printer.tableCustom([
          { text: `PROPINA`, align: "RIGHT", width: 0.75 },
          // { text: ``, align: "LEFT", width: 0.25 },
          // { text: ``, align: "RIGHT", width: 0.25 },
          { text: `${Number(tip).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
        ]);
      }
      
      // Solo mostrar OTROS MONTOS NO AFECTOS si el valor es mayor a 0
      const otrosMontosAmount = Number(0); // Este valor parece estar hardcodeado en 0
      if (otrosMontosAmount > 0) {
        printer.tableCustom([
          { text: `OTROS MONTOS NO AFECTOS`, align: "RIGHT", width: 0.75 },
          { text: `${otrosMontosAmount.toFixed(2)}`, align: "RIGHT", width: 0.25 }
        ]);
      }
      
      printer.tableCustom([
          { text: `TOTAL A PAGAR`, align: "RIGHT", width: 0.75 },
          { text: `${Number(+total + +(tip || 0) - (isNoTaxableOperation ? +ivaTaxAmount : 0) - +IVAretention + +IVAperception).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
        ])
        .feed(1);
      
      printer
        .tableCustom([
          { text: `($$$) RECIBIDO`, align: "RIGHT", width: 0.75 },
          { text: `${Number(cashReceived || 0).toFixed(2)}`, align: "RIGHT", width: 0.25 }
        ])
        .tableCustom([
          { text: `SU CAMBIO`, align: "RIGHT", width: 0.75 },
          { text: `${Number((cashReceived || 0) - (+total + +(tip || 0) - (isNoTaxableOperation ? +ivaTaxAmount : 0) - +IVAretention + +IVAperception)).toFixed(2)}`, align: "RIGHT", width: 0.25 }
        ]);
        // .text('------------------------------------------')
        // .tableCustom([
        //   { text: `TOTAL`, align: "LEFT", width: 0.30 },
        //   { text: ``, align: "LEFT", width: 0.25 },
        //   { text: ``, align: "RIGHT", width: 0.25 },
        //   { text: `${total || 0}`, align: "RIGHT", width: 0.20 }
        // ])
      printer.align('CT')
        .feed(1)
        .text(`CODIGO DE GENERACION:`)
        .text(`${generationCode}`)
        .text(`NUMERO DE CONTROL:`)
        .text(`${controlNumber}`)
        .text(`SELLO RECEPCION`)
        .text(`${receptionStamp}`)
        .feed(1)
        .tableCustom([
          { text: `ESTADO:`, align: "LEFT", width: 0.50 },
          { text: `${dteTransmitionStatusName}`, align: "RIGHT", width: 0.50 }
        ])
        .tableCustom([
          { text: `TIPO:`, align: "LEFT", width: 0.50 },
          { text: `${transmissionTypeName}`, align: "RIGHT", width: 0.50 }
        ])
        .tableCustom([
          { text: `MODELO TRANSMISION:`, align: "LEFT", width: 0.50 },
          { text: `${transmissionModelName}`, align: "RIGHT", width: 0.50 }
        ])
        .align('CT')
        // .text('')
        // .feed(2)
        .control('FF')
        // .qrcode(
        //   `https://admin.factura.gob.sv/consultaPublica?ambiente=01&codGen=${generationCode || ''}&fechaEmi=${dayjs(docDatetime).format('YYYY-MM-DD') || ''}`,
        //   undefined,
        //   "h",
        //   50
        // )
        // .text('*** ESTE COMPROBANTE NO TIENE EFECTO FISCAL ***')
        // .feed(2)
        // .cut()
        // .close((err) => {
        //   if (err) {
        //     res.json({ data: "Print error" });
        //   } else {
        //     res.json({ data: "Print success" });
        //   }
        // });
        .qrimage(
          `https://admin.factura.gob.sv/consultaPublica?ambiente=01&codGen=${generationCode || ''}&fechaEmi=${dayjs(docDatetime).format('YYYY-MM-DD') || ''}`,
          { type: 'png', mode: 'dhdw', size: 3 },
          function (err) {
            if (dteVoucherFooterMessage) {
              this.text(dteVoucherFooterMessage || '');
            }
            this.text('*** ESTE COMPROBANTE NO TIENE EFECTO FISCAL ***');
            this.feed(2);
            this.cut();
            this.cashdraw(2);
            // this.beep(2, 100);
            this.close((err) => {
              if (err) {
                res.json({ data: "Print error" });
              } else {
                res.json({ data: "Print success" });
              }
            });
          });
      // .cut()
      // .feed(2)
      // .cashdraw(2)
      // .close((err) => {
      //   if (err) {
      //     res.json({ data: "Print error" });
      //   } else {
      //     res.json({ data: "Print success" });
      //   }
      // });
    });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printExpenseVoucher = (req, res) => {
  try {
    const { useNetworkPrint } = req.query;
    const { expenseData, cashierPrinterIp, cashierPrinterPort } = req.body;

    if (!expenseData) throw "You must provide expense data to print";

    const {
      expenseId,
      expenseTypeName,
      paymentMethodName,
      accountingName,
      accountingNum,
      documentNumber,
      documentDatetime,
      concept,
      description,
      taxedAmount,
      noTaxedAmount,
      bonus,
      discounts,
      iva,
      fovial,
      cotrans,
      reteRenta,
      ivaRetention,
      ivaPerception,
      amount,
      createdByFullname,
      isVoided
    } = expenseData;

    console.log(expenseData);

    // --- CONFIGURACIÓN DE DISPOSITIVO ---
    let device;
    if (+useNetworkPrint === 1)
      device = new escpos.Network(cashierPrinterIp || "192.168.1.100", cashierPrinterPort || 9100);
    else device = new escpos.USB(vId, pId);

    const options = { encoding: "857", width: 48 };
    const printer = new escpos.Printer(device, options);

    device.open(() => {
      printer
        .font("A")
        .align("CT")
        .style("B")
        .text(`GASTO #${expenseId}`)
        .style("NORMAL")
        .text(`------------------------------`)
        .align("LT")
        .text(`Tipo de Gasto: ${expenseTypeName}`)
        .text(`Método de Pago: ${paymentMethodName}`)
        .text(`Cuenta Contable: ${accountingName}`)
        .text(`Número de Cuenta: ${accountingNum}`)
        .text(`Número de Documento: ${documentNumber}`)
        .text(`Fecha Documento: ${documentDatetime}`)
        .text(`------------------------------`)
        .text(`Concepto: ${concept}`)
        .text(`Descripción: ${description || '-'}`)
        .text(`------------------------------`);

      // --- DETALLE DE MONTOS ---
      const values = [
        { label: "Gravado", value: taxedAmount },
        { label: "Exento", value: noTaxedAmount },
        { label: "Bonos", value: bonus },
        { label: "Descuentos", value: discounts },
        { label: "IVA", value: iva },
        { label: "FOVIAL", value: fovial },
        { label: "COTRANS", value: cotrans },
        { label: "RETE RENTA", value: reteRenta },
        { label: "IVA Retenido", value: ivaRetention },
        { label: "IVA Percibido", value: ivaPerception },
      ];

      values.forEach(({ label, value }) => {
        if (+value > 0) {
          printer.tableCustom([
            { text: label, align: "LEFT", width: 0.7 },
            { text: Number(value).toFixed(2), align: "RIGHT", width: 0.3 },
          ]);
        }
      });

      printer
        .text(`------------------------------`)
        .style("B")
        .tableCustom([
          { text: "TOTAL", align: "LEFT", width: 0.7 },
          { text: `$${Number(amount).toFixed(2)}`, align: "RIGHT", width: 0.3 },
        ])
        .style("NORMAL")
        .feed(1)
        .text(`Creado por: ${createdByFullname}`)
        .text(`Anulado: ${isVoided ? "Sí" : "No"}`)
        .feed(2)
        .align("CT")
        .style("B")
        .feed(1)
        .text('____________________________')
        .text('Firma')
        .feed(1)
        .text("*** COMPROBANTE INTERNO ***")
        .feed(2)
        .cut()
        .cashdraw(2)
        .close((err) => {
          if (err) res.json({ data: "Print error" });
          else res.json({ data: "Print success" });
        });
    });
  } catch (err) {
    res.status(500).json({ status: 500, message: "Printer not found!", errorContent: err });
  }
};

controller.printShiftcutReportSalesAccumByPresentation = (req, res) => {
  try {
    const { useNetworkPrint } = req.query;
    const { headerData, bodyData, cashierPrinterIp, cashierPrinterPort } = req.body;

    if (!headerData || !bodyData) throw "You must provide data to print";

    const { locationName, cashierName, shiftcutNumber } = headerData;

    // --- CONFIGURACIÓN DE DISPOSITIVO ---
    let device;
    if (+useNetworkPrint === 1)
      device = new escpos.Network(cashierPrinterIp || "192.168.1.100", cashierPrinterPort || 9100);
    else device = new escpos.USB(vId, pId);

    const options = { encoding: "857", width: 48 };
    const printer = new escpos.Printer(device, options);

    device.open(() => {
      // --- ENCABEZADO ---
      printer
        .font("A")
        .align("CT")
        .style("B")
        .text("VENTAS POR PRODUCTO")
        .text(`CORTE #${shiftcutNumber}`)
        .style("NORMAL")
        .feed(1)
        .align("LT")
        .text(`Sucursal : ${locationName}`)
        .text(`Caja     : ${cashierName}`)
        .feed(1)
        .align("CT")
        .text(`----------------------------------------`)
        .align("LT")
        .style("B")
        .tableCustom([
          { text: "PRODUCTO", align: "LEFT", width: 0.50 },
          { text: "CANT.", align: "RIGHT", width: 0.20 },
          { text: "TOTAL", align: "RIGHT", width: 0.29 },
        ])
        .style("NORMAL")
        .align("CT")
        .text(`----------------------------------------`)
        .align("LT");

      // --- DETALLE ---
      let totalGeneral = 0;
      let totalUnidades = 0;

      let currentCategory = '';

      for (let i = 0; i < bodyData.length; i++) {
        const {
          productName,
          categoryName,
          presentationName,
          presentationsSold,
          totalAmount,
        } = bodyData[i];

        totalGeneral += +totalAmount;
        totalUnidades += +presentationsSold;

        if (currentCategory !== categoryName) {
          // IMPRIMIR CABECERA DE CATEGORIA
          printer
            .style("BI")
            .tableCustom([
              { text: categoryName, align: "LEFT", width: 0.70 },
              { text: "", align: "RIGHT", width: 0.30 },
            ]);
        }

        currentCategory = categoryName;

        printer.style("NORMAL").tableCustom([
          {
            text: `${productName} (${presentationName})`,
            align: "LEFT",
            width: 0.50,
          },
          {
            text: Number(presentationsSold).toFixed(2),
            align: "RIGHT",
            width: 0.20,
          },
          {
            text: `$${Number(totalAmount).toFixed(2)}`,
            align: "RIGHT",
            width: 0.29,
          },
        ]);
      }

      // --- TOTALES FINALES ---
      printer
        .text(`----------------------------------------`)
        .style("B")
        .tableCustom([
          { text: "TOTAL UNIDADES", align: "LEFT", width: 0.50 },
          { text: Number(totalUnidades).toFixed(2), align: "RIGHT", width: 0.49 },
        ])
        .tableCustom([
          { text: "TOTAL EFECTIVO", align: "LEFT", width: 0.50 },
          { text: `$${Number(totalGeneral).toFixed(2)}`, align: "RIGHT", width: 0.49 },
        ])
        .style("NORMAL")
        .feed(2)
        .align("CT")
        .text('____________________________')
        .text('Firma Cajero')
        .feed(1)
        .style("B")
        .text("*** REPORTE INTERNO ***")
        .style("NORMAL")
        .feed(2)
        .cut()
        .cashdraw(2)
        .close((err) => {
          if (err) res.json({ data: "Print error" });
          else res.json({ data: "Print success" });
        });
    });
  } catch (err) {
    res.status(500).json({ status: 500, message: "Printer not found!", errorContent: err });
  }
};


controller.printTransferVoucher = (req, res) => {
  try {
    const { useNetworkPrint } = req.query;
    const {
      invoiceHeaderData,
      invoiceBodyData,
      cashierPrinterIP,
      cashierPrinterPort
    } = req.body;

    if (!invoiceHeaderData || !Array.isArray(invoiceBodyData)) {
      return res
        .status(400)
        .json({ status: 400, message: 'You must provide header and body transfer data to print' });
    }

    // Header
    const {
      transferId,
      transferCompanyId,
      originLocationId,
      originLocationName,
      destinationLocationId,
      destinationLocationName,
      sentBy,
      sentByFullname,
      sentAt,
      receivedBy,
      receivedByFullname,
      receivedAt,
      userPINCodeFullName,
      status,
      transferStatusName
    } = invoiceHeaderData;

    // Cálculos simples de totales
    const sum = (arr, sel) =>
      (arr || []).reduce((acc, it) => acc + (Number(it?.[sel]) || 0), 0);
    const totalItems = (invoiceBodyData || []).length;
    const totalExpected = sum(invoiceBodyData, 'quantityExpected');
    const totalConfirmed = sum(invoiceBodyData, 'quantityConfirmed');

    // Dispositivo
    let device;

    if (+useNetworkPrint === 1) {
      // console.log("Using network printer");
      // console.log(cashierPrinterIP || '192.168.1.100', cashierPrinterPort || 9100);
      device = new escpos.Network(cashierPrinterIP || '192.168.1.100', cashierPrinterPort || 9100);
    } else {
      device = new escpos.USB(vId, pId);
    }

    const options = { encoding: '857', width: 48 };
    const printer = new escpos.Printer(device, options);

    const safe = (v, fallback = '-') => {
      if (v === null || v === undefined) return fallback;
      const s = String(v).trim();
      return s.length ? s : fallback;
    };

    const asDateTime = (v) =>
      v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-';

    device.open(function (error) {
      if (error) {
        return res.status(500).json({ status: 500, message: 'Printer open error', errorContent: error });
      }

      try {
        // ENCABEZADO
        printer
          .font('A')
          .align('CT')
          .style('B')
          .size(0, 0)
          .text('TRASLADO DE INVENTARIO')
          .style('NORMAL')
          .feed(1)
          .align('LT')
          .tableCustom([
            { text: `Transferencia: ${safe(transferId)}`, align: 'LEFT', width: 0.60 },
            { text: `Estado: ${safe(transferStatusName)}`, align: 'RIGHT', width: 0.40 }
          ])
          // .tableCustom([
          //   { text: `Empresa: ${safe(transferCompanyId)}`, align: 'LEFT', width: 1.0 }
          // ])
          .tableCustom([
            { text: `Origen: ${safe(originLocationName)}`, align: 'LEFT', width: 1.0 }
          ])
          .tableCustom([
            { text: `Destino: ${safe(destinationLocationName)}`, align: 'LEFT', width: 1.0 }
          ])
          .feed(1)
          .tableCustom([
            { text: `Enviado por: ${safe(sentByFullname || sentBy)}`, align: 'LEFT', width: 0.70 },
            { text: `${asDateTime(sentAt)}`, align: 'RIGHT', width: 0.30 }
          ])
          .tableCustom([
            { text: `Recibido por: ${safe(receivedByFullname || receivedBy)}`, align: 'LEFT', width: 0.70 },
            { text: `${asDateTime(receivedAt)}`, align: 'RIGHT', width: 0.30 }
          ])
          .feed(1)
          .align('CT')
          .text('-----------------------------------------------')
          .align('LT')
          .tableCustom([
            { text: 'DESCRIPCION', align: 'LEFT', width: 0.58 },
            { text: 'EXP', align: 'RIGHT', width: 0.14 },
            { text: 'CONF', align: 'RIGHT', width: 0.14 },
            { text: 'EST', align: 'RIGHT', width: 0.14 }
          ])
          .align('CT')
          .text('-----------------------------------------------')
          .align('LT');

        // DETALLE
        for (let i = 0; i < invoiceBodyData.length; i++) {
          const {
            transferDetailId,
            productId,
            quantityExpected,
            quantityConfirmed,
            transferDetailStatus,
            transferDetailStatusName,
            productName
          } = invoiceBodyData[i];

          // Línea principal del item
          printer.tableCustom([
            { text: safe(productName, '(Sin nombre)'), align: 'LEFT', width: 0.58 },
            { text: `${Number(quantityExpected || 0).toFixed(2)}`, align: 'RIGHT', width: 0.14 },
            { text: `${Number(quantityConfirmed || 0).toFixed(2)}`, align: 'RIGHT', width: 0.14 },
            { text: safe(transferDetailStatusName, '-'), align: 'RIGHT', width: 0.14 }
          ]);

          // Línea secundaria opcional con IDs (útil para control interno)
          printer.tableCustom([
            { text: `DetID:${safe(transferDetailId)} ProdID:${safe(productId)}`, align: 'LEFT', width: 1.0 }
          ]);

          if ((i + 1) < invoiceBodyData.length) printer.feed(1);
        }

        // RESUMEN / TOTALES
        printer
          .align('CT')
          .text('-----------------------------------------------')
          .align('LT')
          .tableCustom([
            { text: 'Total ítems', align: 'LEFT', width: 0.70 },
            { text: `${totalItems}`, align: 'RIGHT', width: 0.30 }
          ])
          .tableCustom([
            { text: 'Total esperado', align: 'LEFT', width: 0.70 },
            { text: `${Number(totalExpected).toFixed(2)}`, align: 'RIGHT', width: 0.30 }
          ])
          .tableCustom([
            { text: 'Total confirmado', align: 'LEFT', width: 0.70 },
            { text: `${Number(totalConfirmed).toFixed(2)}`, align: 'RIGHT', width: 0.30 }
          ])
          .feed(1)
          .tableCustom([
            { text: `Imp. por: ${safe(userPINCodeFullName)}`, align: 'LEFT', width: 1.0 }
          ])
          .feed(1)
          .align('CT')
          .text('--- CONTROL INTERNO ---');

        // QR con datos mínimos de la transferencia
        const qrPayload = JSON.stringify({
          type: 'transfer',
          id: transferId || '',
          status: transferStatusName || '',
          sentAt: sentAt ? dayjs(sentAt).format('YYYY-MM-DD HH:mm:ss') : ''
        });

        printer.qrimage(qrPayload, { type: 'png', mode: 'dhdw', size: 3 }, function (err) {
          // Cierre y respuesta
          this.feed(2);
          this.cut();
          this.close((closeErr) => {
            if (closeErr) {
              return res.status(500).json({ status: 500, message: 'Print error', errorContent: closeErr });
            }
            return res.json({ status: 200, message: 'Print success' });
          });
        });
      } catch (printErr) {
        try {
          printer.close(() => {
            return res.status(500).json({ status: 500, message: 'Print error', errorContent: printErr });
          });
        } catch (_) {
          return res.status(500).json({ status: 500, message: 'Print error', errorContent: printErr });
        }
      }
    });
  } catch (err) {
    return res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
};

controller.printOrderSaleVoucher = (req, res) => {
  try {
    const { useNetworkPrint } = req.query;

    let device;

    if (+useNetworkPrint === 1) {
      device = new escpos.Network('192.168.1.100', 9105);
    } else {
      device = new escpos.USB(vId, pId);
    }
    // const device  = new escpos.USB(vId, pId);
    // const device = new escpos.Network('127.0.0.1', 9105);
    const options = { encoding: "857", width: 48 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]
    const { invoiceHeaderData, invoiceBodyData } = req.body;

    if (invoiceHeaderData === undefined || invoiceBodyData === undefined) {
      throw "You must provide a header and body sale data to print";
    }

    const {
      id: currentSaleId,
      companyId,
      orderNumber,
      deliveryRouteId,
      deliveryRouteName,
      shiftcutId,
      cashierId,
      locationId,
      locationName,
      locationPhone,
      locationAddress,
      locationDepartmentName,
      locationCityName,
      locationDepartmentMhCode,
      locationCityMhCode,
      locationEmail,
      ownerNit,
      ownerNrc,
      ownerName,
      ownerActivityCode,
      ownerActivityDescription,
      ownerTradename,
      establishmentType,
      customerId,
      documentDatetime,
      documentTypeId,
      documentTypeName,
      paymentTypeId,
      paymentTypeName,
      status,
      statusName,
      statusColor,
      total,
      totalTaxes,
      taxableSubTotal,
      taxableSubTotalWithoutTaxes,
      noTaxableSubTotal,
      createdBy,
      createdByFullname,
      userPINCodeId,
      userPINCodeFullname,
      customerCode,
      customerFullname,
      customerAddress,
      customerDui,
      customerNit,
      customerNrc,
      customerBusinessLine,
      customerOccupation,
      customerDefPriceIndex,
      customerDepartmentName,
      customerCityName
    } = invoiceHeaderData;

    device.open(function (error) {
      printer
        .font('A')
        .align('CT')
        .style('NORMAL')
        .size(0, 0)
        .text(ownerTradename || '')
        .text(locationAddress || '')
        .text(locationPhone || '')
        // .text('*** TICKET DE CONTROL INTERNO ***')
        // .text(`NIT: ${'0000-000000-000-0'} - NRC: ${'00000-0'}`)
        .feed(1)
        .align('LT')
        .tableCustom([
          { text: `PEDIDO N: ${currentSaleId}`, align: "LEFT", width: 0.50 },
          { text: `SUC: ${String(locationName).toUpperCase()}`, align: "RIGHT", width: 0.50 }
          // { text: `COND: ${String(paymentTypeName).toUpperCase()}`, align: "RIGHT", width: 0.50 }
        ])
        // .tableCustom([
        //   // { text: `DOC: ${documentTypeName}`, align: "LEFT", width: 0.50 },
        //   // { text: `SUC: ${String(locationName).toUpperCase()}`, align: "RIGHT", width: 0.50 }
        // ])
        .text(`FECHA: ${dayjs(documentDatetime).format('YYYY-MM-DD hh:mm:ss')}`)
        .text(`CLIENTE: ${customerFullname}`)
        .text(`DIRECCION: ${customerAddress}`)
        .text(`VENDEDOR: ${userPINCodeFullname || '-'}`)
        .text(`RUTA: ${deliveryRouteName || '-'}`)
        .text(`CONDICION: ${paymentTypeName || '-'}`)

        // .text(`DUI: ${customerDui || '-'}`)
        // .text(`NIT: ${customerNit || '-'}`)
        // .text(`NRC: ${customerNrc || '-'}`)
        // .qrimage('https://github.com/song940/node-escpos', function(err){

        // })
        .feed(1) // LINE 9
        .align('CT')
        // .text('------------------------------------------------')
        // .tableCustom([
        //   { text: `DESCRIPCION`, align: "LEFT", width: 1 }
        // ])
        // .style('U')
        .tableCustom([
          // { text: `CANT.`, align: "LEFT", width: 0.15 },
          { text: `DESCRIPCION`, align: "LEFT", width: 0.55 },
          // { text: `PRES.`, align: "LEFT", width: 0.25 },
          { text: ``, align: "RIGHT", width: 0.25 },
          { text: `SUBTOTAL`, align: "RIGHT", width: 0.20 }
        ])
        .text('------------------------------------------------')
      // .feed(1)
      for (let i = 0; i < invoiceBodyData.length; i++) {
        const {
          orderSaleDetailId,
          orderSaleId,
          productId,
          productCode,
          productName,
          categoryName,
          brandName,
          quantityFactorName,
          quantityFactor,
          unitPrice,
          unitPriceNoTaxes,
          unitCost,
          unitCostNoTaxes,
          subTotalCost,
          totalCostTaxes,
          totalCost,
          quantity,
          subTotal,
          isVoided,
          isActive,
          taxesData,
          totalTaxes,
          taxableSubTotal,
          taxableSubTotalWithoutTaxes,
          noTaxableSubTotal
        } = invoiceBodyData[i];

        printer.style('U').tableCustom([
          { text: `${productName || ""}`, align: "LEFT", width: 0.99 },
        ]);

        printer.style('U').tableCustom([
          { text: `${Number(quantity).toFixed(4) || 0} x $${(+unitPrice).toFixed(4) || 0}`, align: "LEFT", width: 0.50 },
          { text: `${Number(taxableSubTotal).toFixed(4) || 0}`, align: "RIGHT", width: 0.50 }
        ]);

        if ((i + 1) < invoiceBodyData.length) printer.feed(1);
      } // LINE 15
      printer.style('NORMAL')
        // .feed(1)
        .text('------------------------------------------------')
      printer.tableCustom([
        { text: `SUBTOTAL`, align: "RIGHT", width: 0.75 },
        // { text: ``, align: "LEFT", width: 0.25 },
        // { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${Number(taxableSubTotal).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ])
      printer.tableCustom([
        { text: `TOTAL A PAGAR`, align: "RIGHT", width: 0.75 },
        { text: `${Number(+total).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ])
        .feed(3)
        .align('CT')
        .control('FF')
        .text('F. ____________________________')
        .feed(1)
        .text('*** GRACIAS POR PREFERIRNOS ***')
        .feed(2)
        .cut()
        .close((err) => {
          if (err) {
            res.json({ data: "Print error" });
          } else {
            res.json({ data: "Print success" });
          }
        });
    });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printDispatchOrderVoucher = (req, res) => {
  try {
    const { useNetworkPrint } = req.query;

    let device;

    if (+useNetworkPrint === 1) {
      device = new escpos.Network('192.168.1.100', 9105);
    } else {
      device = new escpos.USB(vId, pId);
    }

    const options = { encoding: "857", width: 48 /* default */ }
    const printer = new escpos.Printer(device, options);

    const { invoiceHeaderData, invoiceBodyData } = req.body;

    if (invoiceHeaderData === undefined || invoiceBodyData === undefined) {
      throw "You must provide a header and body sale data to print";
    }

    const {
      id: currentSaleId,
      companyId,
      orderNumber,
      deliveryRouteId,
      deliveryRouteName,
      shiftcutId,
      cashierId,
      locationId,
      locationName,
      locationPhone,
      locationAddress,
      locationDepartmentName,
      locationCityName,
      locationDepartmentMhCode,
      locationCityMhCode,
      locationEmail,
      ownerNit,
      ownerNrc,
      ownerName,
      ownerActivityCode,
      ownerActivityDescription,
      ownerTradename,
      establishmentType,
      customerId,
      documentDatetime,
      documentTypeId,
      documentTypeName,
      paymentTypeId,
      paymentTypeName,
      status,
      statusName,
      statusColor,
      total,
      totalTaxes,
      taxableSubTotal,
      taxableSubTotalWithoutTaxes,
      noTaxableSubTotal,
      createdBy,
      createdByFullname,
      userPINCodeId,
      userPINCodeFullname,
      customerCode,
      customerFullname,
      customerAddress,
      customerDui,
      customerNit,
      customerNrc,
      customerBusinessLine,
      customerOccupation,
      customerDefPriceIndex,
      customerDepartmentName,
      customerCityName
    } = invoiceHeaderData;

    device.open(function (error) {
      printer
        .font('A')
        .align('CT')
        .style('NORMAL')
        .size(0, 0)
        // .text('*** TICKET DE DESPACHO DE PRODUCTO ***')
        // .text(ownerTradename || '')
        .align('LT')
        .tableCustom([
          // { text: `DESPACHO N: ${currentSaleId}`, align: "LEFT", width: 0.99 },
        ])
        .text(`FECHA Y HORA: ${dayjs(documentDatetime).format('YYYY-MM-DD hh:mm:ss')}`)
        // .text(`CLIENTE: ${customerFullname}`)

        .feed(1) // LINE 9
        .align('CT')
        .tableCustom([
          { text: `CANT.`, align: "LEFT", width: 0.20 },
          { text: `DESCRIPCION`, align: "LEFT", width: 0.79 },
        ])
        .text('------------------------------------------------')
      // .feed(1)
      for (let i = 0; i < invoiceBodyData.length; i++) {
        const {
          orderSaleDetailId,
          orderSaleId,
          productId,
          productCode,
          productName,
          categoryName,
          brandName,
          quantityFactorName,
          quantityFactor,
          unitPrice,
          unitPriceNoTaxes,
          unitCost,
          unitCostNoTaxes,
          subTotalCost,
          totalCostTaxes,
          totalCost,
          quantity,
          subTotal,
          isVoided,
          isActive,
          taxesData,
          totalTaxes,
          taxableSubTotal,
          taxableSubTotalWithoutTaxes,
          noTaxableSubTotal
        } = invoiceBodyData[i];

        printer.style('U').tableCustom([
          { text: `${Number(quantity).toFixed(2) || 0}`, align: "LEFT", width: 0.20 },
          { text: `${productName || ""}`, align: "LEFT", width: 0.79 },
        ]);

        if ((i + 1) < invoiceBodyData.length) printer.feed(1);
      } // LINE 15
      printer.style('NORMAL')
        .align('CT')
        .control('FF')
        .feed(2)
        .cut()
        .close((err) => {
          if (err) {
            res.json({ data: "Print error" });
          } else {
            res.json({ data: "Print success" });
          }
        });
    });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printCF = (req, res) => {
  try {
    const device = new escpos.USB(matrix_vId, matrix_pId);
    const options = { encoding: "857", width: 56 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]
    const { invoiceHeaderData, invoiceBodyData } = req.body;

    if (invoiceHeaderData === undefined || invoiceBodyData === undefined) {
      throw "You must provide a header and body sale data to print";
    }

    const {
      customerFullname,
      documentDatetime,
      customerAddress,
      customerDui,
      customerNit,
      customerPhone,
      paymentTypeName,
      totalSale,
      totalToLetters
    } = invoiceHeaderData;

    let totalToLettersSplited = (totalToLetters || " ( ").split("(", 2);
    let totalToLettersPartOne = totalToLettersSplited[0];
    let totalToLettersPartTwo = `(${totalToLettersSplited[1]}`;

    device.open(function (error) {
      printer
        .font('A')
        .align('LT')
        .style('NORMAL')
        .size(0, 0)
        .marginLeft(3)
        .marginRight(4)
        .feed(9) // LINE 1 - 8
        .tableCustom(
          [
            { text: "", align: "LEFT", width: 0.75 },
            { text: `  ${documentDatetime || ''}`, align: "LEFT", width: 0.25 }
          ]
        ) // LINE 9 FECHA
        .feed(1) // LINE 9
        .text(`      ${customerFullname.substring(0, 49) || ''}`) // LINE 10 CLIENTE NAME
        .tableCustom(
          [
            { text: `         ${customerAddress.substring(0, 41) || ''}`, align: "LEFT", width: 1 }
          ]
        ) // LINE 11 ADDRESS
        .tableCustom(
          [
            { text: "", align: "LEFT", width: 0.75 },
            { text: `  ${paymentTypeName || ''}`, align: "LEFT", width: 0.25 }
          ]
        ) // LINE 12
        .feed(3) // LINE 13 - 14
        .marginLeft(5)
      for (let i = 0; i < invoiceBodyData.length; i++) {
        printer.tableCustom(
          [
            { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.06 },
            { text: `${invoiceBodyData[i].productName || ""}`.substring(0, 29), align: "LEFT", width: 0.57 },
            // { text: "", align: "LEFT", width: 0.11 },
            { text: `${invoiceBodyData[i].unitPrice || 0}`, align: "LEFT", width: 0.11 },
            { text: "", align: "LEFT", width: 0.13 },
            { text: `${invoiceBodyData[i].subTotal || 0}`, align: "LEFT", width: 0.15 }
          ]
        );
      } // LINE 15
      printer
        .feed(14 - (+invoiceBodyData.length)) // LINE 18 - 36
        .feed(7)
        .tableCustom(
          [
            { text: `  ${totalToLettersPartOne || ''}`, align: "LEFT", width: 0.50 },
            { text: "", align: "LEFT", width: 0.34 },
            { text: `${totalSale || 0}`, align: "LEFT", width: 0.15 }
          ]
        ) // LINE 38
        .tableCustom(
          [
            { text: `  ${totalToLettersPartTwo || ''}`, align: "LEFT", width: 0.50 },
            { text: "", align: "LEFT", width: 0.34 },
            { text: ``, align: "LEFT", width: 0.15 }
          ]
        ) // LINE 39
        .feed(4) // LINE 40 - 45
        .tableCustom(
          [
            { text: "", align: "LEFT", width: 0.88 },
            { text: "", align: "LEFT", width: 0.15 }
          ]
        ) // LINE 46 // noTaxableTotalSale
        .tableCustom(
          [
            { text: "", align: "LEFT", width: 0.88 },
            { text: `${totalSale || 0}`, align: "LEFT", width: 0.15 }
          ]
        ) // LINE 47 // TOTAL SALE
        .marginLeft(0)
        .marginRight(0)
        .control('FF')
        .close((err) => {
          if (err) {
            res.json({ data: "Print error" });
          } else {
            res.json({ data: "Print success" });
          }
        });
    });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printGuideLines = (req, res) => {
  try {
    // const device  = new escpos.USB(vId, pId);
    const device = new escpos.Network('127.0.0.1', 9105);
    const options = { encoding: "857", width: 56 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]

    device.open(function (error) {
      printer
        .font('A')
        .align('LT')
        .style('NORMAL')
        .size(0, 0)
        .marginLeft(0)
        .marginRight(0)
        .text('1 - Margin 0 - 0') // LINE 1
        .text('2') // LINE 2
        .text('3') // LINE 3
        .text('4') // LINE 4
        .text('5') // LINE 5
        .marginLeft(1)
        .marginRight(1)
        .text('6 - Margin 1 - 1') // LINE 6
        .text('7') // LINE 7
        .text('8') // LINE 8
        .text('9') // LINE 9
        .text('10') // LINE 10
        .marginLeft(2)
        .marginRight(2)
        .text('11 - Margin 2 - 2') // LINE 11
        .text('12') // LINE 12
        .text('13') // LINE 13
        .text('14') // LINE 14
        .text('15') // LINE 15
        .marginLeft(3)
        .marginRight(3)
        .text('16 - Margin 3 - 3') // LINE 16
        .text('17') // LINE 17
        .text('18') // LINE 18
        .text('19') // LINE 19
        .text('20') // LINE 20
        .marginLeft(0)
        .marginRight(0)
        .text('21') // LINE 21
        .text('22') // LINE 22
        .text('23') // LINE 23
        .text('24') // LINE 24
        .text('25') // LINE 25
        .text('26') // LINE 26
        .text('27') // LINE 27
        .text('28') // LINE 28
        .text('29') // LINE 29
        .text('30') // LINE 30
        .text('31') // LINE 31
        .text('32') // LINE 32
        .text('33') // LINE 33
        .text('34') // LINE 34
        .text('35') // LINE 35
        .text('36') // LINE 36
        .text('37') // LINE 37
        .text('38') // LINE 38
        .text('39') // LINE 39
        .text('40') // LINE 40
        .text('41') // LINE 41
        .text('42') // LINE 42
        .text('43') // LINE 43
        .text('44') // LINE 44
        .text('45') // LINE 45
        .text('46') // LINE 46
        .text('47') // LINE 47
        .text('48') // LINE 48
        .control('FF')
        .close((err) => {
          if (err) {
            res.json({ data: "Print error" });
          } else {
            res.json({ data: "Print success" });
          }
        });
    });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printCharLine = (req, res) => {
  try {
    // const device  = new escpos.USB(vId, pId);
    const device = new escpos.Network('127.0.0.1', 9105);
    const options = { encoding: "857", width: 56 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]

    device.open(function (error) {
      printer
        .font('A')
        .align('LT')
        .style('NORMAL')
        .size(0, 0)
        .marginLeft(0)
        .marginRight(0)
        .text('1234567890123456789012345678901234567890123456789012345678901234567890') // LINE 1
        .control('FF')
        .close((err) => {
          if (err) {
            res.json({ data: "Print error" });
          } else {
            res.json({ data: "Print success" });
          }
        });
    });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printSaleDetailsToNetworkPrinter = (req, res) => {
  try {
    const { printerIp, printerPort, detailsData, headData } = req.body;

    const {
      id,
      controlNumber,
      generationCode,
      dteType,
      receptionStamp,
      dteTransmitionStatus,
      dteTransmitionStatusName,
      transmissionType,
      transmissionTypeName,
      transmissionModel,
      transmissionModelName,
      currencyType,
      shiftcutId,
      isNoTaxableOperation,
      customerComplementaryName,
      cashierId,
      estCodeInternal,
      estCodeMH,
      posCodeInternal,
      posCodeMH,
      locationId,
      locationName,
      locationPhone,
      locationAddress,
      locationDepartmentName,
      locationCityName,
      locationDepartmentMhCode,
      locationCityMhCode,
      locationEmail,
      ownerNit,
      ownerNrc,
      ownerName,
      ownerActivityCode,
      ownerActivityDescription,
      ownerTradename,
      establishmentType,
      customerId,
      documentTypeId,
      documentTypeName,
      paymentTypeId,
      paymentTypeName,
      createdBy,
      createdByFullname,
      userPINCodeFullName,
      docDatetime,
      docDatetimeFormatted,
      docDate,
      docTime,
      docDatetimeLabel,
      docNumber,
      serie,
      paymentStatus,
      expirationDays,
      expirationInformation,
      expiresIn,
      expired,
      IVAretention,
      IVAperception,
      paymentStatusName,
      isVoided,
      voidedByFullname,
      total,
      ivaTaxAmount,
      fovialTaxAmount,
      cotransTaxAmount,
      totalTaxes,
      taxableSubTotal,
      taxableSubTotalWithoutTaxes,
      noTaxableSubTotal,
      totalInLetters,
      notes,
      saleTotalPaid,
      customerCode,
      customerFullname,
      customerAddress,
      customerDefPhoneNumber,
      customerEmail,
      customerDui,
      customerNit,
      customerNrc,
      customerBusinessLine,
      customerOccupation,
      customerDepartmentName,
      customerCityName,
      customerDepartmentMhCode,
      customerCityMhCode,
      customerEconomicActivityCode,
      customerEconomicActivityName
    } = headData;

    const networkDevice = new escpos.Network(printerIp, printerPort);

    const options = { encoding: "860", width: 48 /* default */ }
    const printer = new escpos.Printer(networkDevice, options);

    const remoteAddress = req.headers['x-real-ip'] || req.connection.remoteAddress;

    networkDevice.open(function (error) {
      if (error) {
        console.error('Error al abrir la conexión con la impresora:', error);
        return res.status(500).json({ status: 500, message: 'Error al conectar con la impresora', errorContent: error });
      }

      printer
        .font('A')
        .align('CT')
        .style('NORMAL')
        .size(0, 0)
        .feed(5)
        .text(`COCINA`)
        .text('-----------------------------------------')
        .align('LT')
        .text(`ORDEN N° ${id}`)
        .text(`Fecha: ${docDatetime}`)
        .text(`Cliente: ${customerFullname}`)
        .align('CT')
        .text('-----------------------------------------')
        .align('LT');
      for (let i = 0; i < detailsData.length; i++) {
        const {
          saleDetailId,
          saleId,
          productId,
          productTypeId,
          productCode,
          productName,
          productMeasurementUnitId,
          categoryName,
          brandName,
          measurementUnitName,
          unitPrice,
          unitPriceNoTaxes,
          unitPriceIva,
          unitPriceFovial,
          unitPriceCotrans,
          unitCost,
          unitCostNoTaxes,
          subTotalCost,
          totalCostTaxes,
          totalCost,
          quantity,
          subTotal,
          isVoided,
          isActive,
          taxesData,
          ivaTaxAmount,
          fovialTaxAmount,
          cotransTaxAmount,
          totalTaxes,
          taxableSubTotal,
          taxableSubTotalWithoutTaxes,
          noTaxableSubTotal
        } = detailsData[i];

        let isNoTaxableOperation = false;
        let documentTypeId = 2;
        // printer.tableCustom([
        //   { text: `${invoiceBodyData[i].productName || ""}`, align: "LEFT", width: 1 }
        // ])
        printer.style('U').tableCustom([
          // { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.15 },
          { text: `${Number(quantity).toFixed(4) || ""}`, align: "LEFT", width: 0.20 },
          { text: `${""}`, align: "LEFT", width: 0.04 },
          { text: `${productName || ""}`, align: "LEFT", width: 0.75 },
          // { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
          // { text: `${Number(quantity).toFixed(4) || 0} x ${(+unitPrice - (+unitPriceFovial + +unitPriceCotrans + (isNoTaxableOperation ? +unitPriceIva : 0))).toFixed(4) || 0}`, align: "RIGHT", width: 0.25 },
          // { text: `${(isNoTaxableOperation === 1 ? (+noTaxableSubTotal - +ivaTaxAmount - +fovialTaxAmount - +cotransTaxAmount) : (+taxableSubTotal - ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount) - +fovialTaxAmount - +cotransTaxAmount)).toFixed(4) || 0}`, align: "RIGHT", width: 0.20 }
        ]);

        // printer.style('U').tableCustom([
        //   // { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.15 },
        //   // { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
        //   { text: `${Number(quantity).toFixed(4) || 0} x $${(+unitPrice - (+unitPriceFovial + +unitPriceCotrans + (isNoTaxableOperation ? +unitPriceIva : 0))).toFixed(4) || 0}`, align: "LEFT", width: 0.50 },
        //   { text: `${(isNoTaxableOperation === 1 ? (+noTaxableSubTotal - +ivaTaxAmount - +fovialTaxAmount - +cotransTaxAmount) : (+taxableSubTotal - ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount) - +fovialTaxAmount - +cotransTaxAmount)).toFixed(4) || 0}`, align: "RIGHT", width: 0.50 }
        // ]);

        if ((i + 1) < detailsData.length) printer.feed(1);
      }
      printer.feed(4)
        .cut()
        .align('CT')
        .style('NORMAL')
        .size(0, 0)
        .feed(5)
        .text(`CLIENTE`)
        .text('-----------------------------------------')
        .align('LT')
        .text(`ORDEN N° ${id}`)
        .text(`Fecha: ${docDatetime}`)
        .text(`Cliente: ${customerFullname}`)
        .align('CT')
        .text('-----------------------------------------')
        .align('LT');
      for (let i = 0; i < detailsData.length; i++) {
        const {
          saleDetailId,
          saleId,
          productId,
          productTypeId,
          productCode,
          productName,
          productMeasurementUnitId,
          categoryName,
          brandName,
          measurementUnitName,
          unitPrice,
          unitPriceNoTaxes,
          unitPriceIva,
          unitPriceFovial,
          unitPriceCotrans,
          unitCost,
          unitCostNoTaxes,
          subTotalCost,
          totalCostTaxes,
          totalCost,
          quantity,
          subTotal,
          isVoided,
          isActive,
          taxesData,
          ivaTaxAmount,
          fovialTaxAmount,
          cotransTaxAmount,
          totalTaxes,
          taxableSubTotal,
          taxableSubTotalWithoutTaxes,
          noTaxableSubTotal
        } = detailsData[i];

        let isNoTaxableOperation = false;
        let documentTypeId = 2;
        // printer.tableCustom([
        //   { text: `${invoiceBodyData[i].productName || ""}`, align: "LEFT", width: 1 }
        // ])
        printer.style('U').tableCustom([
          // { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.15 },
          { text: `${Number(quantity).toFixed(4) || ""}`, align: "LEFT", width: 0.20 },
          { text: `${""}`, align: "LEFT", width: 0.04 },
          { text: `${productName || ""}`, align: "LEFT", width: 0.75 },
          // { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
          // { text: `${Number(quantity).toFixed(4) || 0} x ${(+unitPrice - (+unitPriceFovial + +unitPriceCotrans + (isNoTaxableOperation ? +unitPriceIva : 0))).toFixed(4) || 0}`, align: "RIGHT", width: 0.25 },
          // { text: `${(isNoTaxableOperation === 1 ? (+noTaxableSubTotal - +ivaTaxAmount - +fovialTaxAmount - +cotransTaxAmount) : (+taxableSubTotal - ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount) - +fovialTaxAmount - +cotransTaxAmount)).toFixed(4) || 0}`, align: "RIGHT", width: 0.20 }
        ]);

        // printer.style('U').tableCustom([
        //   // { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.15 },
        //   // { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
        //   { text: `${Number(quantity).toFixed(4) || 0} x $${(+unitPrice - (+unitPriceFovial + +unitPriceCotrans + (isNoTaxableOperation ? +unitPriceIva : 0))).toFixed(4) || 0}`, align: "LEFT", width: 0.50 },
        //   { text: `${(isNoTaxableOperation === 1 ? (+noTaxableSubTotal - +ivaTaxAmount - +fovialTaxAmount - +cotransTaxAmount) : (+taxableSubTotal - ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount) - +fovialTaxAmount - +cotransTaxAmount)).toFixed(4) || 0}`, align: "RIGHT", width: 0.50 }
        // ]);

        if ((i + 1) < detailsData.length) printer.feed(1);
      }
      printer.feed(4)
        .cut()
        .close((err) => {
          if (err) {
            res.status(500).json({ status: 500, message: 'Printer connection failed!', errorContent: err });
          } else {
            res.json({ data: "Printer connection success!" });
          }
        });
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printSettlementXTicket = (req, res) => {
  try {
    const { useNetworkPrint, isPreliminar } = req.query;
    const { settlementData, cashierPrinterIp, cashierPrinterPort } = req.body;

    let device;

    if (+useNetworkPrint === 1) {
      device = new escpos.Network(cashierPrinterIp || '192.168.1.100', cashierPrinterPort || 9105);
    } else {
      device = new escpos.USB(vId, pId);
    }
    // const device  = new escpos.USB(vId, pId);
    // const device = new escpos.Network('127.0.0.1', 9105);
    const options = { encoding: "857", width: 48 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]

    if (settlementData === undefined) {
      throw "You must provide a settlementData sale data to print";
    }

    const shiftcutData = settlementData[0];

    const {
      locationOwnerTradename,
      locationOwnerName,
      locationOwnerActivityCode,
      locationOwnerActivityDescription,
      locationOwnerNit,
      locationOwnerNrc,
      shiftcutDatetime,
      shiftcutDatetimeFormatted,
      openedByFullname,
      closedByFullname,
      cashierName,
      shiftcutNumber
    } = shiftcutData[0];

    const ticketsXData = settlementData[1];

    const {
      label: ticketLabel,
      numberOfTransactions: ticketNumberOfTransactions,
      initialDocNumber: ticketInitialDocNumber,
      finalDocNumber: ticketFinalDocNumber,
      taxableTotal: ticketTaxableTotal,
      noTaxableTotal: ticketNoTaxableTotal,
      noSubjectTotal: ticketNoSubjectTotal,
      total: ticketTotal
    } = ticketsXData[0];

    const cfXData = settlementData[2];

    const {
      label: cfLabel,
      numberOfTransactions: cfNumberOfTransactions,
      initialDocNumber: cfInitialDocNumber,
      finalDocNumber: cfFinalDocNumber,
      taxableTotal: cfTaxableTotal,
      noTaxableTotal: cfNoTaxableTotal,
      noSubjectTotal: cfNoSubjectTotal,
      total: cfTotal
    } = cfXData[0];

    const ccfXData = settlementData[3];

    const {
      label: ccfLabel,
      numberOfTransactions: ccfNumberOfTransactions,
      initialDocNumber: ccfInitialDocNumber,
      finalDocNumber: ccfFinalDocNumber,
      taxableTotal: ccfTaxableTotal,
      noTaxableTotal: ccfNoTaxableTotal,
      noSubjectTotal: ccfNoSubjectTotal,
      total: ccfTotal
    } = ccfXData[0];

    // let encoder = new ReceiptPrinterEncoder({
    //   language: 'esc-pos',
    //   columns: 42,
    //   feedBeforeCut: 0,
    //   newline: '\n'
    // });

    console.log(isPreliminar)

    device.open(function (error) {
      printer
        .font('A')
        .align('CT')
        .style('NORMAL')
        .size(0, 0)
        .text('')
        .text(`${locationOwnerName}`)
        .text(`${locationOwnerTradename}`)
        .text(`${locationOwnerActivityDescription}`)
        .tableCustom([{ text: "NIT", align: "LEFT", width: 0.25 }, { text: `${locationOwnerNit || ''}`, align: "LEFT", width: 0.75 }])
        .tableCustom([{ text: "NRC", align: "LEFT", width: 0.25 }, { text: `${locationOwnerNrc || ''}`, align: "LEFT", width: 0.75 }])
        .tableCustom([{ text: "Caja", align: "LEFT", width: 0.25 }, { text: `${cashierName || ''}`, align: "LEFT", width: 0.75 }])
        .tableCustom([{ text: "Turno", align: "LEFT", width: 0.25 }, { text: `${shiftcutNumber || ''}`, align: "LEFT", width: 0.75 }])
        .tableCustom([{ text: "Fecha", align: "LEFT", width: 0.25 }, { text: `${shiftcutDatetimeFormatted || ''}`, align: "LEFT", width: 0.75 }])
        .tableCustom([{ text: "Apertura", align: "LEFT", width: 0.25 }, { text: `${openedByFullname || ''}`, align: "LEFT", width: 0.75 }])
        .tableCustom([{ text: "Cierra", align: "LEFT", width: 0.25 }, { text: `${closedByFullname || ''}`, align: "LEFT", width: 0.75 }])
        .text('')
        .text('TICKET X')
        .text(isPreliminar == 1 ? '*** === > PRELIMINAR AL CORTE <=== ***' : '')
        .text('-----------------------------------------')
        .tableCustom([{ text: `${ticketLabel}`, align: "LEFT", width: 0.50 }, { text: ``, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta Gravada:`, align: "LEFT", width: 0.50 }, { text: `${Number(ticketTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta Exenta:`, align: "LEFT", width: 0.50 }, { text: `${Number(ticketNoTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta No Sujeta:`, align: "LEFT", width: 0.50 }, { text: `${Number(ticketNoSubjectTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Total:`, align: "LEFT", width: 0.50 }, { text: `${Number(ticketTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .text('-----------------------------------------')
        .tableCustom([{ text: `${cfLabel}`, align: "LEFT", width: 0.50 }, { text: ``, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta Gravada:`, align: "LEFT", width: 0.50 }, { text: `${Number(cfTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta Exenta:`, align: "LEFT", width: 0.50 }, { text: `${Number(cfNoTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta No Sujeta:`, align: "LEFT", width: 0.50 }, { text: `${Number(cfNoSubjectTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Total:`, align: "LEFT", width: 0.50 }, { text: `${Number(cfTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .text('-----------------------------------------')
        .tableCustom([{ text: `${ccfLabel}`, align: "LEFT", width: 0.50 }, { text: ``, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta Gravada:`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta Exenta:`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfNoTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta No Sujeta:`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfNoSubjectTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Total:`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .text('-----------------------------------------')
        .tableCustom([{ text: `TOTAL VENTAS`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .text('-----------------------------------------')
        .tableCustom([{ text: `TRANSACCIONES`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .text('-----------------------------------------')
        .tableCustom([{ text: `${ticketLabel}`, align: "LEFT", width: 0.50 }, { text: `${Number(ticketNumberOfTransactions || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Inicial`, align: "LEFT", width: 0.50 }, { text: `${Number(ticketInitialDocNumber || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Final`, align: "LEFT", width: 0.50 }, { text: `${Number(ticketFinalDocNumber || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .text('-----------------------------------------')
        .tableCustom([{ text: `${cfLabel}`, align: "LEFT", width: 0.50 }, { text: `${Number(cfNumberOfTransactions || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Inicial`, align: "LEFT", width: 0.50 }, { text: `${Number(cfInitialDocNumber || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Final`, align: "LEFT", width: 0.50 }, { text: `${Number(cfFinalDocNumber || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .text('-----------------------------------------')
        .tableCustom([{ text: `${ccfLabel}`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfNumberOfTransactions || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Inicial`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfInitialDocNumber || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Final`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfFinalDocNumber || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .text(isPreliminar == 1 ? '*** === > PRELIMINAR AL CORTE <=== ***' : '')
        .feed(1)
        .cut()
        .close((err) => {
          if (err) {
            res.json({ data: "Print error" });
          } else {
            res.json({ data: "Print success" });
          }
        });
    });

    // // let commands = encoder.initialize()
    // encoder.initialize()
    // // .raw([0x1B, 0x3D, 0x01])
    // .raw([0x1B, 0x63, 0x30, 0x03])
    // .line('')
    // .align('center')
    // .line(`${locationOwnerName}`)
    // .line(`${locationOwnerTradename}`)
    // .line(`${locationOwnerActivityDescription}`)
    // .line('')
    // .align('left')
    // .line(`${String('NIT:').padEnd(12)}${String(locationOwnerNit).padStart(26)}`)
    // .line(`${String('NRC:').padEnd(12)}${String(locationOwnerNrc).padStart(26)}`)
    // .line(`${String('Caja:').padEnd(12)}${String(cashierName).padStart(26)}`)
    // .line(`${String('Turno:').padEnd(12)}${String(shiftcutNumber).padStart(26)}`)
    // .line(`${String('Fecha:').padEnd(12)}${String(shiftcutDatetimeFormatted).padStart(26)}`)
    // .line(`${String('Apertura:').padEnd(12)}${String(openedByFullname).padStart(26)}`)
    // .line(`${String('Cierra:').padEnd(12)}${String(closedByFullname).padStart(26)}`)
    // .align('center')
    // .line('TICKET X')
    // .align('left')
    // .line('----------------------------------------')
    // .line(`${String(ticketLabel).padEnd(18)}${String('').padStart(20)}`)
    // .line(`${String('Venta Gravada:').padEnd(18)}${String(Number(ticketTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Venta Exenta:').padEnd(18)}${String(Number(ticketNoTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Venta No Sujeta:').padEnd(18)}${String(Number(ticketNoSubjectTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Total:').padEnd(18)}${String(Number(ticketTotal || 0).toFixed(2)).padStart(20)}`)
    // .line('----------------------------------------')
    // .line(`${String(cfLabel).padEnd(18)}${String('').padStart(20)}`)
    // .line(`${String('Venta Gravada:').padEnd(18)}${String(Number(cfTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Venta Exenta:').padEnd(18)}${String(Number(cfNoTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Venta No Sujeta:').padEnd(18)}${String(Number(cfNoSubjectTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Total:').padEnd(18)}${String(Number(cfTotal || 0).toFixed(2)).padStart(20)}`)
    // .line('----------------------------------------')
    // .line(`${String(ccfLabel).padEnd(18)}${String('').padStart(20)}`)
    // .line(`${String('Venta Gravada:').padEnd(18)}${String(Number(ccfTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Venta Exenta:').padEnd(18)}${String(Number(ccfNoTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Venta No Sujeta:').padEnd(18)}${String(Number(ccfNoSubjectTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Total:').padEnd(18)}${String(Number(ccfTotal || 0).toFixed(2)).padStart(20)}`)
    // .line('----------------------------------------')
    // .line(`${String('TOTAL VENTAS:').padEnd(18)}${String(Number((+ticketTotal || 0) + (+cfTotal || 0) + (+ccfTotal || 0)).toFixed(2)).padStart(20)}`)
    // .line('----------------------------------------')
    // .line(`${String('Transacciones:').padEnd(18)}${String(Number((ticketNumberOfTransactions || 0) + (cfNumberOfTransactions || 0) + (ccfNumberOfTransactions || 0)).toFixed(0)).padStart(20)}`)
    // .line('----------------------------------------')
    // .line(`${String(ticketLabel).padEnd(18)}${String(Number(ticketNumberOfTransactions).toFixed(0)).padStart(20)}`)
    // .line(`${String('Inicial').padEnd(18)}${String(Number(ticketInitialDocNumber).toFixed(0)).padStart(20)}`)
    // .line(`${String('Final').padEnd(18)}${String(Number(ticketFinalDocNumber).toFixed(0)).padStart(20)}`)
    // .line('----------------------------------------')
    // .line(`${String(cfLabel).padEnd(18)}${String(Number(cfNumberOfTransactions).toFixed(0)).padStart(20)}`)
    // .line(`${String('Inicial').padEnd(18)}${String(Number(cfInitialDocNumber).toFixed(0)).padStart(20)}`)
    // .line(`${String('Final').padEnd(18)}${String(Number(cfFinalDocNumber).toFixed(0)).padStart(20)}`)
    // .line('----------------------------------------')
    // .line(`${String(ccfLabel).padEnd(18)}${String(Number(ccfNumberOfTransactions).toFixed(0)).padStart(20)}`)
    // .line(`${String('Inicial').padEnd(18)}${String(Number(ccfInitialDocNumber).toFixed(0)).padStart(20)}`)
    // .line(`${String('Final').padEnd(18)}${String(Number(ccfFinalDocNumber).toFixed(0)).padStart(20)}`)
    // .line('')
    // .line('')
    // .line('')
    // .line('')
    // .line('')
    // .line('')
    // .raw(escposcommands.alternativeCut)
    // .line('')
    // .line('')
    // .line('');
    // // .encode();

    // let commands = encoder.encode();

    // const pcName = 'DESKTOP-SJEKD0F';
    // const printerName = 'Epson TM-U950 Receipt';

    // const printerPath = `\\\\${pcName}\\${printerName}`;

    // const tempFile = 'comandos_print.bin';
    // // const tempFile = 'temp_comandos.txt';
    // // const cutCommand = new Uint8Array([0x1B, 0x69]);
    // fs.writeFileSync(tempFile, Buffer.from(commands), 'binary');
    // // fs.writeFileSync(tempFile, `${commands}`, 'binary');

    // const command = `copy /b ${tempFile} "${printerPath}"`;

    // exec(command, (error, stdout, stderr) => {
    //   if (error) {
    //     console.log(`Error al imprimir ${error.message}`);
    //     return;
    //   }
    //   if (stderr) {
    //     console.log(`Error ${stderr}`);
    //     return;
    //   }
    //   console.log('Impresor completa');
    //   return;
    // });

    // res.json({ data: "Printer connection success!" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printSettlementZTicket = (req, res) => {
  try {
    const { useNetworkPrint } = req.query;
    const { settlementData, cashierPrinterIp, cashierPrinterPort } = req.body;

    let device;

    if (+useNetworkPrint === 1) {
      device = new escpos.Network(cashierPrinterIp || '192.168.1.100', cashierPrinterPort || 9105);
    } else {
      device = new escpos.USB(vId, pId);
    }
    // const device  = new escpos.USB(vId, pId);
    // const device = new escpos.Network('127.0.0.1', 9105);
    const options = { encoding: "857", width: 48 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]

    if (settlementData === undefined) {
      throw "You must provide a settlementData sale data to print";
    }

    const shiftcutData = settlementData[0];

    const {
      locationOwnerTradename,
      locationOwnerName,
      locationOwnerActivityCode,
      locationOwnerActivityDescription,
      locationOwnerNit,
      locationOwnerNrc,
      shiftcutDatetime,
      shiftcutDatetimeFormatted,
      openedByFullname,
      closedByFullname,
      cashierName,
      shiftcutNumber
    } = shiftcutData[0];

    const ticketsXData = settlementData[1];

    const {
      label: ticketLabel,
      numberOfTransactions: ticketNumberOfTransactions,
      initialDocNumber: ticketInitialDocNumber,
      finalDocNumber: ticketFinalDocNumber,
      taxableTotal: ticketTaxableTotal,
      noTaxableTotal: ticketNoTaxableTotal,
      noSubjectTotal: ticketNoSubjectTotal,
      total: ticketTotal
    } = ticketsXData[0];

    const cfXData = settlementData[2];

    const {
      label: cfLabel,
      numberOfTransactions: cfNumberOfTransactions,
      initialDocNumber: cfInitialDocNumber,
      finalDocNumber: cfFinalDocNumber,
      taxableTotal: cfTaxableTotal,
      noTaxableTotal: cfNoTaxableTotal,
      noSubjectTotal: cfNoSubjectTotal,
      total: cfTotal
    } = cfXData[0];

    const ccfXData = settlementData[3];

    const {
      label: ccfLabel,
      numberOfTransactions: ccfNumberOfTransactions,
      initialDocNumber: ccfInitialDocNumber,
      finalDocNumber: ccfFinalDocNumber,
      taxableTotal: ccfTaxableTotal,
      noTaxableTotal: ccfNoTaxableTotal,
      noSubjectTotal: ccfNoSubjectTotal,
      total: ccfTotal
    } = ccfXData[0];

    // let encoder = new ReceiptPrinterEncoder({
    //   language: 'esc-pos',
    //   columns: 42,
    //   feedBeforeCut: 0,
    //   newline: '\n'
    // });

    device.open(function (error) {
      printer
        .font('A')
        .align('CT')
        .style('NORMAL')
        .size(0, 0)
        .text('')
        .text(`${locationOwnerName}`)
        .text(`${locationOwnerTradename}`)
        .text(`${locationOwnerActivityDescription}`)
        .tableCustom([{ text: "NIT", align: "LEFT", width: 0.25 }, { text: `${locationOwnerNit || ''}`, align: "LEFT", width: 0.75 }])
        .tableCustom([{ text: "NRC", align: "LEFT", width: 0.25 }, { text: `${locationOwnerNrc || ''}`, align: "LEFT", width: 0.75 }])
        .tableCustom([{ text: "Caja", align: "LEFT", width: 0.25 }, { text: `${cashierName || ''}`, align: "LEFT", width: 0.75 }])
        .tableCustom([{ text: "Turno", align: "LEFT", width: 0.25 }, { text: `${shiftcutNumber || ''}`, align: "LEFT", width: 0.75 }])
        .tableCustom([{ text: "Fecha", align: "LEFT", width: 0.25 }, { text: `${shiftcutDatetimeFormatted || ''}`, align: "LEFT", width: 0.75 }])
        .tableCustom([{ text: "Apertura", align: "LEFT", width: 0.25 }, { text: `${openedByFullname || ''}`, align: "LEFT", width: 0.75 }])
        .tableCustom([{ text: "Cierra", align: "LEFT", width: 0.25 }, { text: `${closedByFullname || ''}`, align: "LEFT", width: 0.75 }])
        .text('')
        .text('TICKET Z')
        .text('')
        .text('-----------------------------------------')
        .tableCustom([{ text: `${ticketLabel}`, align: "LEFT", width: 0.50 }, { text: ``, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta Gravada:`, align: "LEFT", width: 0.50 }, { text: `${Number(ticketTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta Exenta:`, align: "LEFT", width: 0.50 }, { text: `${Number(ticketNoTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta No Sujeta:`, align: "LEFT", width: 0.50 }, { text: `${Number(ticketNoSubjectTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Total:`, align: "LEFT", width: 0.50 }, { text: `${Number(ticketTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .text('-----------------------------------------')
        .tableCustom([{ text: `${cfLabel}`, align: "LEFT", width: 0.50 }, { text: ``, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta Gravada:`, align: "LEFT", width: 0.50 }, { text: `${Number(cfTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta Exenta:`, align: "LEFT", width: 0.50 }, { text: `${Number(cfNoTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta No Sujeta:`, align: "LEFT", width: 0.50 }, { text: `${Number(cfNoSubjectTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Total:`, align: "LEFT", width: 0.50 }, { text: `${Number(cfTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .text('-----------------------------------------')
        .tableCustom([{ text: `${ccfLabel}`, align: "LEFT", width: 0.50 }, { text: ``, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta Gravada:`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta Exenta:`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfNoTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Venta No Sujeta:`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfNoSubjectTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Total:`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .text('-----------------------------------------')
        .tableCustom([{ text: `TOTAL VENTAS`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .text('-----------------------------------------')
        .tableCustom([{ text: `TRANSACCIONES`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfTaxableTotal || 0).toFixed(2)}`, align: "RIGHT", width: 0.50 }])
        .text('-----------------------------------------')
        .tableCustom([{ text: `${ticketLabel}`, align: "LEFT", width: 0.50 }, { text: `${Number(ticketNumberOfTransactions || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Inicial`, align: "LEFT", width: 0.50 }, { text: `${Number(ticketInitialDocNumber || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Final`, align: "LEFT", width: 0.50 }, { text: `${Number(ticketFinalDocNumber || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .text('-----------------------------------------')
        .tableCustom([{ text: `${cfLabel}`, align: "LEFT", width: 0.50 }, { text: `${Number(cfNumberOfTransactions || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Inicial`, align: "LEFT", width: 0.50 }, { text: `${Number(cfInitialDocNumber || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Final`, align: "LEFT", width: 0.50 }, { text: `${Number(cfFinalDocNumber || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .text('-----------------------------------------')
        .tableCustom([{ text: `${ccfLabel}`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfNumberOfTransactions || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Inicial`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfInitialDocNumber || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .tableCustom([{ text: `Final`, align: "LEFT", width: 0.50 }, { text: `${Number(ccfFinalDocNumber || 0).toFixed(0)}`, align: "RIGHT", width: 0.50 }])
        .feed(2)
        .cut()
        .close((err) => {
          if (err) {
            res.json({ data: "Print error" });
          } else {
            res.json({ data: "Print success" });
          }
        });
    });

    // // let commands = encoder.initialize()
    // encoder.initialize()
    // // .raw([0x1B, 0x3D, 0x01])
    // .raw([0x1B, 0x63, 0x30, 0x03])
    // .line('')
    // .align('center')
    // .line(`${locationOwnerName}`)
    // .line(`${locationOwnerTradename}`)
    // .line(`${locationOwnerActivityDescription}`)
    // .line('')
    // .align('left')
    // .line(`${String('NIT:').padEnd(12)}${String(locationOwnerNit).padStart(26)}`)
    // .line(`${String('NRC:').padEnd(12)}${String(locationOwnerNrc).padStart(26)}`)
    // .line(`${String('Caja:').padEnd(12)}${String(cashierName).padStart(26)}`)
    // .line(`${String('Turno:').padEnd(12)}${String(shiftcutNumber).padStart(26)}`)
    // .line(`${String('Fecha:').padEnd(12)}${String(shiftcutDatetimeFormatted).padStart(26)}`)
    // .line(`${String('Apertura:').padEnd(12)}${String(openedByFullname).padStart(26)}`)
    // .line(`${String('Cierra:').padEnd(12)}${String(closedByFullname).padStart(26)}`)
    // .align('center')
    // .line('TICKET X')
    // .align('left')
    // .line('----------------------------------------')
    // .line(`${String(ticketLabel).padEnd(18)}${String('').padStart(20)}`)
    // .line(`${String('Venta Gravada:').padEnd(18)}${String(Number(ticketTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Venta Exenta:').padEnd(18)}${String(Number(ticketNoTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Venta No Sujeta:').padEnd(18)}${String(Number(ticketNoSubjectTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Total:').padEnd(18)}${String(Number(ticketTotal || 0).toFixed(2)).padStart(20)}`)
    // .line('----------------------------------------')
    // .line(`${String(cfLabel).padEnd(18)}${String('').padStart(20)}`)
    // .line(`${String('Venta Gravada:').padEnd(18)}${String(Number(cfTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Venta Exenta:').padEnd(18)}${String(Number(cfNoTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Venta No Sujeta:').padEnd(18)}${String(Number(cfNoSubjectTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Total:').padEnd(18)}${String(Number(cfTotal || 0).toFixed(2)).padStart(20)}`)
    // .line('----------------------------------------')
    // .line(`${String(ccfLabel).padEnd(18)}${String('').padStart(20)}`)
    // .line(`${String('Venta Gravada:').padEnd(18)}${String(Number(ccfTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Venta Exenta:').padEnd(18)}${String(Number(ccfNoTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Venta No Sujeta:').padEnd(18)}${String(Number(ccfNoSubjectTotal || 0).toFixed(2)).padStart(20)}`)
    // .line(`${String('Total:').padEnd(18)}${String(Number(ccfTotal || 0).toFixed(2)).padStart(20)}`)
    // .line('----------------------------------------')
    // .line(`${String('TOTAL VENTAS:').padEnd(18)}${String(Number((+ticketTotal || 0) + (+cfTotal || 0) + (+ccfTotal || 0)).toFixed(2)).padStart(20)}`)
    // .line('----------------------------------------')
    // .line(`${String('Transacciones:').padEnd(18)}${String(Number((ticketNumberOfTransactions || 0) + (cfNumberOfTransactions || 0) + (ccfNumberOfTransactions || 0)).toFixed(0)).padStart(20)}`)
    // .line('----------------------------------------')
    // .line(`${String(ticketLabel).padEnd(18)}${String(Number(ticketNumberOfTransactions).toFixed(0)).padStart(20)}`)
    // .line(`${String('Inicial').padEnd(18)}${String(Number(ticketInitialDocNumber).toFixed(0)).padStart(20)}`)
    // .line(`${String('Final').padEnd(18)}${String(Number(ticketFinalDocNumber).toFixed(0)).padStart(20)}`)
    // .line('----------------------------------------')
    // .line(`${String(cfLabel).padEnd(18)}${String(Number(cfNumberOfTransactions).toFixed(0)).padStart(20)}`)
    // .line(`${String('Inicial').padEnd(18)}${String(Number(cfInitialDocNumber).toFixed(0)).padStart(20)}`)
    // .line(`${String('Final').padEnd(18)}${String(Number(cfFinalDocNumber).toFixed(0)).padStart(20)}`)
    // .line('----------------------------------------')
    // .line(`${String(ccfLabel).padEnd(18)}${String(Number(ccfNumberOfTransactions).toFixed(0)).padStart(20)}`)
    // .line(`${String('Inicial').padEnd(18)}${String(Number(ccfInitialDocNumber).toFixed(0)).padStart(20)}`)
    // .line(`${String('Final').padEnd(18)}${String(Number(ccfFinalDocNumber).toFixed(0)).padStart(20)}`)
    // .line('')
    // .line('')
    // .line('')
    // .line('')
    // .line('')
    // .line('')
    // .raw(escposcommands.alternativeCut)
    // .line('')
    // .line('')
    // .line('');
    // // .encode();

    // let commands = encoder.encode();

    // const pcName = 'DESKTOP-SJEKD0F';
    // const printerName = 'Epson TM-U950 Receipt';

    // const printerPath = `\\\\${pcName}\\${printerName}`;

    // const tempFile = 'comandos_print.bin';
    // // const tempFile = 'temp_comandos.txt';
    // // const cutCommand = new Uint8Array([0x1B, 0x69]);
    // fs.writeFileSync(tempFile, Buffer.from(commands), 'binary');
    // // fs.writeFileSync(tempFile, `${commands}`, 'binary');

    // const command = `copy /b ${tempFile} "${printerPath}"`;

    // exec(command, (error, stdout, stderr) => {
    //   if (error) {
    //     console.log(`Error al imprimir ${error.message}`);
    //     return;
    //   }
    //   if (stderr) {
    //     console.log(`Error ${stderr}`);
    //     return;
    //   }
    //   console.log('Impresor completa');
    //   return;
    // });

    // res.json({ data: "Printer connection success!" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

module.exports = { controller };
