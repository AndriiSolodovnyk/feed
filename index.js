const XLSX = require('xlsx');
const fs = require('fs');
const { downloadArrayBuffer } = require('./feedDownloader');

const FILE_URL = 'https://fiskars-gratis.com.ua/content/export/f21d2ef6d82a517fac09ea84c53cf5c9.xlsx';

const DEFAULT_GROUP_ID = 1;
const SET_GROUP_ID = 156333769;
const SET_PRODUCT_SKUS = new Set([
  '1052276',
  '1051085102691',
  '1001622106119',
  '1026931102693',
  '1023739100077',
  '1026916101477',
  '1000773105909',
  '1059836105536',
  '1001553105536',
  '1073084101477',
  '1015642105983',
  '1051085105983',
  '1028376105983',
  '1027528101477',
  '1027528102682',
  '1051085101477',
  '1024856105984',
  '1014773105108',
  '1070715105108',
  '1028376101477',
  '1026917102837',
  '1026917101477',
  '1015642101477',
  '1026931102691',
  '1026680102691',
  '1000660100346',
  '1070715101477',
  '1023492101477',
  '1003466102349',
  '1062940106119',
  '1063145105984',
  '1057760'
]);

async function parseProducts() {
  const data = await downloadArrayBuffer(FILE_URL, { label: 'Horoshop XLSX' });

  const workbook = XLSX.read(data, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const products = [];

  for (const row of rows) {
    const sku = row['Артикул'];
    const name = row['Название (UA)'];
    const description = row['Описание товара (UA)'] || row['Короткое описание (UA)'] || '';
    const price = Number(row['Цена']) || 0;
    const photos = row['Фото'];
    const quantity = Number(row['Количество']) || 0;

    if (!sku || !name || price <= 0) continue;

    const images = photos
      ? String(photos).split(';').map((photo) => photo.trim()).filter(Boolean)
      : [];

    products.push({
      sku,
      name,
      price,
      stock: quantity,
      available: quantity > 0,
      images,
      description
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
    const categoryId = SET_PRODUCT_SKUS.has(String(p.sku).trim())
      ? SET_GROUP_ID
      : DEFAULT_GROUP_ID;
    const pictures = p.images
      .map((image) => `        <picture>${image}</picture>`)
      .join('\n');

    xml += `
      <offer id="${p.sku}" available="${p.available}">
        <name><![CDATA[${p.name}]]></name>
        <price>${p.price}</price>
        <categoryId>${categoryId}</categoryId>
        <currencyId>UAH</currencyId>
${pictures ? `${pictures}\n` : ''}        <description><![CDATA[${p.description || p.name}]]></description>
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
