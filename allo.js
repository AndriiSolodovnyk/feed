const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs');

const FILE_URL = 'https://fiskars-gratis.com.ua/content/export/f21d2ef6d82a517fac09ea84c53cf5c9.xlsx';
const SHOP_NAME = 'Fiskars Gratis';
const SHOP_URL = 'https://fiskars-gratis.com.ua/';

function getValue(row, key) {
  const value = row[key];
  return value === undefined || value === null ? '' : String(value).trim();
}

function parseNumber(value) {
  const parsed = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(value) {
  return `<![CDATA[${String(value).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function parseImages(...values) {
  return values
    .flatMap((value) => String(value || '').split(/[;\r\n]+/))
    .map((image) => image.trim())
    .filter(Boolean);
}

function normalizeCategoryPath(path) {
  const parts = String(path || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length ? parts : ['FISKARS'];
}

async function parseProducts() {
  const response = await axios.get(FILE_URL, {
    responseType: 'arraybuffer'
  });

  const workbook = XLSX.read(response.data, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  return rows.map((row) => {
    const sku = getValue(row, 'Артикул');
    const name = getValue(row, 'Название (UA)');
    const brand = getValue(row, 'Бренд');
    const price = Math.round(parseNumber(getValue(row, 'Цена')));
    const oldPrice = Math.round(parseNumber(getValue(row, 'Старая цена')));
    const stock = Math.max(0, Math.floor(parseNumber(getValue(row, 'Количество'))));
    const description = getValue(row, 'Описание товара (UA)') || getValue(row, 'Короткое описание (UA)') || name;
    const images = parseImages(getValue(row, 'Фото'), getValue(row, 'Галерея'));
    const categoryPath = normalizeCategoryPath(getValue(row, 'Раздел'));

    const params = [
      ['Артикул', sku],
      ['Бренд', brand],
      ['Состояние товара', getValue(row, 'Состояние товара')],
      ['Тип гарантии', getValue(row, 'Тип гарантии')],
      ['Гарантийный срок, мес.', getValue(row, 'Гарантийный срок, мес.')],
      ['Цвет', getValue(row, 'Цвет')],
      ['Штрихкод', getValue(row, 'Штрихкод')],
      ['Код УКТ ВЭД', getValue(row, 'Код УКТ ВЭД')],
      ['Код производителя товара (MPN)', getValue(row, 'Код производителя товара (MPN)')],
      ['Категория Хорошоп', categoryPath.join(' / ')]
    ].filter(([, value]) => value);

    return {
      sku,
      name,
      brand,
      price,
      oldPrice,
      stock,
      available: stock > 0,
      description,
      images,
      categoryPath,
      url: getValue(row, 'Ссылка'),
      barcode: getValue(row, 'Штрихкод'),
      vendorCode: getValue(row, 'Код производителя товара (MPN)') || sku,
      params
    };
  });
}

function buildCategoryTree(products) {
  const categories = [];
  const categoryByPath = new Map();

  function ensureCategory(pathParts) {
    let parentPath = '';
    let parentId = null;

    for (const name of pathParts) {
      const path = parentPath ? `${parentPath}/${name}` : name;

      if (!categoryByPath.has(path)) {
        const category = {
          id: categoryByPath.size + 1,
          parentId,
          name
        };

        categoryByPath.set(path, category);
        categories.push(category);
      }

      const category = categoryByPath.get(path);
      parentPath = path;
      parentId = category.id;
    }

    return parentId;
  }

  for (const product of products) {
    product.categoryId = ensureCategory(product.categoryPath);
  }

  return categories;
}

function buildAllo(products) {
  const readyProducts = products.filter((product) => (
    product.sku &&
    product.name &&
    product.brand &&
    product.price > 0 &&
    product.images.length > 0
  ));
  const skippedProducts = products.length - readyProducts.length;
  const categories = buildCategoryTree(readyProducts);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${new Date().toISOString()}">
  <shop>
    <name>${escapeXml(SHOP_NAME)}</name>
    <company>${escapeXml(SHOP_NAME)}</company>
    <url>${escapeXml(SHOP_URL)}</url>
    <currencies>
      <currency id="UAH" rate="1"/>
    </currencies>
    <categories>
${categories.map((category) => {
    const parentId = category.parentId ? ` parentId="${category.parentId}"` : '';
    return `      <category id="${category.id}"${parentId}>${escapeXml(category.name)}</category>`;
  }).join('\n')}
    </categories>
    <offers>`;

  for (const product of readyProducts) {
    const priceTags = product.oldPrice > product.price
      ? `        <price>${product.oldPrice}</price>
        <salePrice>${product.price}</salePrice>`
      : `        <price>${product.price}</price>`;
    const pictures = product.images
      .map((image) => `        <picture>${escapeXml(image)}</picture>`)
      .join('\n');
    const params = product.params
      .map(([name, value]) => `        <param name="${escapeXml(name)}">${escapeXml(value)}</param>`)
      .join('\n');

    xml += `
      <offer id="${escapeXml(product.sku)}" available="${product.available}">
${product.url ? `        <url>${escapeXml(product.url)}</url>\n` : ''}${priceTags}
        <currencyId>UAH</currencyId>
        <categoryId>${product.categoryId}</categoryId>
${pictures}
        <name>${escapeXml(product.name)}</name>
        <vendor>${escapeXml(product.brand)}</vendor>
        <vendorCode>${escapeXml(product.vendorCode)}</vendorCode>
${product.barcode ? `        <barcode>${escapeXml(product.barcode)}</barcode>\n` : ''}        <description>${cdata(product.description)}</description>
        <stock_quantity>${product.stock}</stock_quantity>
        <quantity>${product.stock}</quantity>
${params}
      </offer>`;
  }

  xml += `
    </offers>
  </shop>
</yml_catalog>`;

  fs.writeFileSync('allo.xml', xml);

  console.log(`Allo feed generated: ${readyProducts.length} products, ${categories.length} categories.`);
  if (skippedProducts > 0) {
    console.log(`Skipped ${skippedProducts} products without required Allo fields.`);
  }
}

async function run() {
  const products = await parseProducts();
  buildAllo(products);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
