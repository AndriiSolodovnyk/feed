const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs');

const FILE_URL = 'https://fiskars-gratis.com.ua/content/export/eb49a29eda1ed8152f24322544deb94c.xlsx';

async function parseProducts() {
  const response = await axios.get(FILE_URL, {
    responseType: 'arraybuffer'
  });

  const workbook = XLSX.read(response.data, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const products = [];

  for (const row of rows) {
    const sku = row['Артикул'];
    const name = row['Название(UA)'];
    const price = Number(row['Цена']) || 0;
    const photos = row['Фото'];
    const quantity = Number(row['Количество']) || 0;

    if (!sku || !name || price <= 0) continue;

    const firstImage = photos ? photos.split(';')[0].trim() : '';

    products.push({
      sku,
      name,
      price,
      stock: quantity,
      available: quantity > 0,
      image: firstImage
    });
  }

  return products;
}

function buildRozetka(products) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${new Date().toISOString()}">
  <shop>
    <offers>`;

  for (let p of products) {
    xml += `
      <offer id="${p.sku}" available="${p.available}">
        <name><![CDATA[${p.name}]]></name>
        <price>${p.price}</price>
        <currencyId>UAH</currencyId>
        <picture>${p.image}</picture>
        <stock_quantity>${p.stock}</stock_quantity>
      </offer>`;
  }

  xml += `
    </offers>
  </shop>
</yml_catalog>`;

  fs.writeFileSync('rozetka.xml', xml);
}

async function run() {
  const products = await parseProducts();
  buildRozetka(products);
}

run();
