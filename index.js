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

const KITCHEN_GROUP_ID = 156336200;
const KITCHEN_PRODUCT_SKUS = new Set([
  '1059096',
  '1024458',
  '1075041',
  '1023739',
  '1066432',
  '1026570',
  '1052248',
  '1065628',
  '1065627',
  '1065629',
  '1075701',
  '1075700',
  '1075699',
  '1072310',
  '1072311',
  '1075457',
  '1075459',
  '1075520',
  '1075522',
  '1067628',
  '1067632',
  '1067629',
  '1026568',
  '1026569',
  '1026571',
  '1066946',
  '1066430',
  '1066952',
  '1064751',
  '1064752',
  '1075698',
  '1072316',
  '1075526',
  '1067639',
  '1023819',
  '1003033',
  '1003032',
  '1023739100077',
  '1000773105909',
  '1001317',
  '1065587',
  '1065567',
  '1065565',
  '1065599',
  '1065586',
  '1024273',
  '1070166',
  '1000776',
  '1001319',
  '1000773',
  '1075839',
  '1075834',
  '1015987',
  '1016122',
  '1016472',
  '1016480',
  '1065134',
  '1016474',
  '1079907',
  '1079908',
  '1079909',
  '1079960',
  '1079961',
  '1057552',
  '1057554',
  '1057542',
  '1057544',
  '1057534',
  '1065568',
  '1075696',
  '1023374',
  '1000778',
  '1014418',
  '1050713',
  '1066951',
  '1075524',
  '1067637',
  '1072314',
  '40033792',
  '40033803',
  '1000788',
  '1057551',
  '1066429',
  '1066431',
  '1066552',
  '1065250',
  '1066426',
  '1066427',
  '1066425',
  '1065596',
  '1065594',
  '1065591',
  '1065590',
  '1066428',
  '1065593',
  '1016471',
  '1050714',
  '1014413',
  '1014412',
  '1065595',
  '1079962',
  '1079964',
  '1079965',
  '1079966',
  '1079967',
  '1079968',
  '1014414',
  '1014434',
  '1054778'
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
    const sku = String(p.sku).trim();
    const categoryId = KITCHEN_PRODUCT_SKUS.has(sku)
      ? KITCHEN_GROUP_ID
      : SET_PRODUCT_SKUS.has(sku)
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
