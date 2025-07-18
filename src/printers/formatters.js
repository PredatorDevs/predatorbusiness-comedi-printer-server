
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

async function kictchenPrinter(printer, { name, details, place, waiter }) {
    printer
        .font('A')
        .align('CT')
        .style('B')
        .size(1, 1)
        .text('TICKET DE COCINA')
        .size(0, 0)
        .text(`No. ${place.orderId}`)
        .text('-----------------------------------------')
        .style('NORMAL')
        .text(`Fecha: ${formatDate()}`)
        .text(`Hora: ${formatTime()}`)
        .text(`Mesero: ${waiter}`)
        .text(`${place.placetypename}: ${place.placeNumber}`)
        .feed(1)
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
        .text('COCINA')
        .style('NORMAL')
        .text('-----------------------------------------')
        .feed(2)
        .control('FF')
        .cut()
        .close();
}

async function printPreCuentaTicket(printer, { details, place, waiter }) {

    printer
        .align('CT')
        .style('B')
        .size(1, 1)
        .text('PRE-CUENTA')
        .size(0, 0)
        .text(`No. ${place.orderId}`)
        .style('NORMAL')
        .text(`Fecha: ${formatDate()}`)
        .text(`Hora: ${formatTime()}`)
        .text(`Mesero: ${waiter}`)
        .text(`${place.placetypename}: ${place.placeNumber}`)
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

    printer
        .text('-----------------------------------------')
        .style('B')
        .tableCustom([
            { text: '', align: 'LEFT', width: 0.4 },
            { text: 'TOTAL:', align: 'LEFT', width: 0.2 },
            { text: formatMoney(place.total), align: 'LEFT', width: 0.2 },
        ])
        .style('NORMAL')
        .feed(1)
        .text('-----------------------------------------')
        .align('CT')
        .style('NORMAL')
        .text('ESTE DOCUMENTO NO TIENE VALOR FISCAL')
        .text('ES SOLO UNA PRE-CUENTA DE CONSUMO')
        .feed(2)
        .control('FF')
        .cut()
        .close();
}

export default {
    kictchenPrinter,
    printPreCuentaTicket
}