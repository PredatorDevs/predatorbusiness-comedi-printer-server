const escpos = require('escpos');

// install escpos-usb adapter module manually

escpos.USB = require('escpos-usb');
escpos.Network = require('escpos-network');

// Select the adapter based on your printer type
// const device  = new escpos.USB();

// const device  = new escpos.Serial('/dev/usb/lp0');

// encoding is optional


const controller = {};

controller.testPrincerConnection = (req, res) => {
  try {
    const device  = new escpos.USB();
    const options = { encoding: "GB18030", width: 56 /* default */ }
    const printer = new escpos.Printer(device, options);
  
    device.open(function(error){
      printer.close((err) => {
        if (err) {
          res.json({ data: "Printer not found!" });
        } else {
          res.json({ data: "Printer connection success!" });
        }
      });
    });
  } catch(err) {
    res.json({ errorData: "Printer not found!" });
  }
}

controller.authLogin = (req, res) => {
  // const device  = new escpos.Network('localhost', 9100);
  try {
    const device  = new escpos.USB();
    const options = { encoding: "GB18030", width: 56 /* default */ }
    const printer = new escpos.Printer(device, options);
  
    device.open(function(error){
      printer
      .font('A')
      .align('LT')
      .style('NORMAL')
      .size(0, 0)
      .marginLeft(3)
      .marginRight(3)
      .feed(7)
      .tableCustom(
        [
          { text: "GUSTAVO ALFREDO SANCHEZ", align: "LEFT", width: 0.75 },
          { text: "20-02-2023", align: "LEFT", width: 0.25 }
        ]
      )
      .tableCustom(
        [
          { text: "CDAD PACIFICA", align: "LEFT", width: 0.75 },
          { text: "SAN MIGUEL", align: "LEFT", width: 0.25 }
        ]
      )
      .tableCustom(
        [
          { text: "1217-280300-105-8", align: "LEFT", width: 0.33 },
          { text: "121475-3", align: "LEFT", width: 0.33 },
          { text: "VENTA ELECTRICOSSS", align: "LEFT", width: 0.33 }
        ]
      )
      .feed(4);
      for (let i = 0; i < 17; i++) {
        printer.tableCustom(
          [
            { text: "2505", align: "LEFT", width: 0.08 },
            { text: "QUESILLO DE JUGO", align: "LEFT", width: 0.46 },
            { text: "2.50", align: "LEFT", width: 0.11 },
            { text: "0.00", align: "LEFT", width: 0.11 },
            { text: "0.00", align: "LEFT", width: 0.11 },
            { text: "6262.50", align: "LEFT", width: 0.16 }
          ]
        );
      }
      // .marginRight(4)
      printer.feed(1)
      .tableCustom(
        [
          { text: "TREINTA Y CINCO (50/100) DOLARES", align: "LEFT", width: 0.54 },
          { text: "", align: "LEFT", width: 0.33 },
          { text: "6262.50", align: "LEFT", width: 0.16 }
        ]
      )
      .tableCustom(
        [
          { text: "", align: "LEFT", width: 0.87 },
          { text: "6.35", align: "LEFT", width: 0.16 }
        ]
      )
      .tableCustom(
        [
          { text: "", align: "LEFT", width: 0.87 },
          { text: "6262.50", align: "LEFT", width: 0.16 }
        ]
      )
      .feed(3)
      .tableCustom(
        [
          { text: "", align: "LEFT", width: 0.87 },
          { text: "6262.50", align: "LEFT", width: 0.16 }
        ]
      )
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
  } catch(err) {
    res.json({ errorData: err });
  }
}

module.exports = { controller };
