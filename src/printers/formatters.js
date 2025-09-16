
function formatDate() {
    const now = new Date();
    const date = now.toLocaleDateString('es-SV', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const time = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    return `${date}`;
}

function formatTime() {
    const now = new Date();
    const date = now.toLocaleDateString('es-SV', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const time = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    return `${time}`;
}

function formatMoney(value) {
    return `$${parseFloat(value).toFixed(2)}`;
}

async function kictchenPrinter(printer, { name, details, place, waiter, status, customerName }) {
    printer
        .font('A')
        .align('CT')
        .style('B')
        .size(1, 1)
        .text(`TICKET DE ${name}`)
        .size(0, 0)
        .text(`No. ${place.orderId}`)
        .text('-----------------------------------------')
        .style('NORMAL')
        .text(`Fecha: ${formatDate()}`)
        .text(`Hora: ${formatTime()}`)
        .text(`Mesero: ${waiter}`)
        .text(`Cliente: ${customerName || ''}`)
        .text(`${place.placetypename}: ${place.placeNumber}`)
        .feed(1)
        .text(`${status}`)
        .text('-----------------------------------------')
        .align('CT')
        .style('B')
        .text('DETALLES')
        .style('NORMAL')
        .text('-----------------------------------------');

    printer.tableCustom([
        { text: "Cant", align: "LEFT", width: 0.10 },
        { text: "Producto", align: "LEFT", width: 0.90 },
    ]);

    for (const item of details) {
        const { quantity, comments, productName } = item;

        printer.tableCustom(
            [
                { text: String(parseInt(quantity)), align: "LEFT", width: 0.10 },
                { text: productName.slice(0, 26), align: "LEFT", width: 0.90 },
            ]
        );

        if (comments && comments.trim() !== '') {
            printer.tableCustom([
                { text: "", align: "LEFT", width: 0.1 },
                { text: `${comments.slice(0, 48)}`, align: "LEFT", width: 0.9 },
            ]);
        }
    }

    printer
        .text('-----------------------------------------')
        .style('B')
        .text(`${name}`)
        .style('NORMAL')
        .text('-----------------------------------------')
        .feed(2)
        .control('FF')
        .cut()
        .beep(2, 5)
        .close();
}

async function printPreCuentaTicket(printer, { details, place, waiter, status, customerName, tipAmount, customerAddress = '', customerPhone = '' }) {

    printer
        .align('CT')
        .style('B')
        .size(1, 0)
        .text('PRE-CUENTA')
        // .size(1, 0)
        // .text('PRE-CUENTA')
        // .size(0, 1)
        // .text('PRE-CUENTA')
        .size(0, 0)
        .text(`No. ${place.orderId}`)
        .style('NORMAL')
        .text(`Fecha: ${formatDate()}`)
        .text(`Hora: ${formatTime()}`)
        .text(customerName || place.customerName ? `Cliente: ${customerName || place.customerName || ''}` : '')
        // .text(`${place.placetypename}: ${place.placeNumber}`)
        .text(customerAddress || place.customerAddress ? `Direccion: ${customerAddress || place.customerAddress || ''}` : '')
        .text(customerPhone || place.customerPhone ? `Teléfono: ${customerPhone || place.customerPhone || ''}` : '')
        .feed(1)
        .size(1, 0)
        .text(`${status}`)
        .size(0, 0)
        .text('-----------------------------------------')
        .align('LT');

    printer.tableCustom([
        { text: 'Cant', align: 'LEFT', width: 0.1 },
        { text: 'Producto', align: 'LEFT', width: 0.5 },
        { text: 'Total', align: 'LEFT', width: 0.2 },
    ]);

    let total = 0;

    for (const item of details) {
        const quantity = parseInt(item.quantity);

        printer.tableCustom([
            { text: String(parseInt(quantity)), align: 'LEFT', width: 0.1 },
            { text: item.productName.slice(0, 28), align: 'LEFT', width: 0.5 },
            { text: formatMoney(item.subTotal), align: 'LEFT', width: 0.2 },
        ]);
    }

    console.log(place);

    printer
        .text('-----------------------------------------')
        .style('B')
        .tableCustom([
            { text: '', align: 'LEFT', width: 0.4 },
            { text: 'SUBTOTAL:', align: 'LEFT', width: 0.2 },
            { text: formatMoney(place.total), align: 'LEFT', width: 0.2 },
        ])
        .tableCustom([
            { text: '', align: 'LEFT', width: 0.4 },
            { text: 'PROPINA:', align: 'LEFT', width: 0.2 },
            { text: formatMoney(+tipAmount || 0), align: 'LEFT', width: 0.2 },
        ])
        .tableCustom([
            { text: '', align: 'LEFT', width: 0.4 },
            { text: 'TOTAL:', align: 'LEFT', width: 0.2 },
            { text: formatMoney(+place.total + (+tipAmount || 0)), align: 'LEFT', width: 0.2 },
        ])
        .style('NORMAL')
        .text('-----------------------------------------')
        .align('CT')
        .style('NORMAL')
        .text('ESTE DOCUMENTO NO TIENE EFECTO FISCAL')
        .text('ES SOLO UNA PRE-CUENTA DE CONSUMO')
        .feed(2)
        .control('FF')
        .cut()
        .beep(2, 5)
        .close();
}

export default {
    kictchenPrinter,
    printPreCuentaTicket
}