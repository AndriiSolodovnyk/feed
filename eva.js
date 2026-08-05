const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs');

const FILE_URL = 'https://fiskars-gratis.com.ua/content/export/f21d2ef6d82a517fac09ea84c53cf5c9.xlsx';
const SHOP_NAME = 'Fiskars Gratis';
const SHOP_URL = 'https://fiskars-gratis.com.ua/';

function sanitizeText(value) {
  return String(value || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function getValue(row, key) {
  const value = row[key];
  return sanitizeText(value === undefined || value === null ? '' : value).trim();
}

function parseNumber(value) {
  const parsed = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeXml(value) {
  return sanitizeText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(value) {
  return `<![CDATA[${sanitizeText(value).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseImages(...values) {
  return values
    .flatMap((value) => String(value || '').split(/[;\r\n]+/))
    .map((image) => image.trim())
    .filter(Boolean)
    .slice(0, 15);
}

function normalizeCategoryPath(path) {
  const parts = String(path || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length ? parts : ['FISKARS'];
}

function categoryIdForPath(path) {
  let hash = 2166136261;

  for (let i = 0; i < path.length; i += 1) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return String(100000000 + (hash >>> 0) % 900000000);
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
    const warrantyMonths = Math.floor(parseNumber(getValue(row, 'Гарантийный срок, мес.')));

    const params = [
      ['Артикул', sku],
      ['Штрихкод', getValue(row, 'Штрихкод')],
      ['Бренд', brand],
      ['Стан товару', getValue(row, 'Состояние товара') || 'Новий'],
      ['Тип гарантії', getValue(row, 'Тип гарантии')],
      ['Гарантійний строк, міс.', warrantyMonths > 0 ? warrantyMonths : ''],
      ['Колір', getValue(row, 'Цвет')],
      ['Код УКТ ЗЕД', getValue(row, 'Код УКТ ВЭД')],
      ['Код виробника товару (MPN)', getValue(row, 'Код производителя товара (MPN)')],
      ['Категорія Хорошоп', categoryPath.join(' / ')]
    ].filter(([, value]) => value !== '');

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
      article: getValue(row, 'Артикул для отображения на сайте') || sku,
      params
    };
  });
}

function buildCategoryTree(products) {
  const categoryByPath = new Map();

  for (const product of products) {
    let parentPath = '';

    for (const name of product.categoryPath) {
      const path = parentPath ? `${parentPath}/${name}` : name;

      if (!categoryByPath.has(path)) {
        categoryByPath.set(path, {
          id: categoryIdForPath(path),
          parentId: parentPath ? categoryIdForPath(parentPath) : null,
          name,
          path,
          depth: path.split('/').length
        });
      }

      parentPath = path;
    }

    product.categoryId = categoryIdForPath(product.categoryPath.join('/'));
  }

  return Array.from(categoryByPath.values())
    .sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path, 'uk'));
}

function buildEva(products) {
  const readyProducts = products.filter((product) => (
    product.sku &&
    product.name &&
    product.brand &&
    product.price > 0 &&
    product.description.length >= 30 &&
    product.images.length > 0
  ));
  const skippedProducts = products.length - readyProducts.length;
  const categories = buildCategoryTree(readyProducts);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE yml_catalog SYSTEM "shops.dtd">
<yml_catalog date="${formatDate(new Date())}">
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
    const pictures = product.images
      .map((image) => `        <picture>${escapeXml(image)}</picture>`)
      .join('\n');
    const priceOld = product.oldPrice > product.price
      ? `        <price_old>${product.oldPrice}</price_old>\n`
      : '';
    const params = product.params
      .map(([name, value]) => `        <param name="${escapeXml(name)}">${escapeXml(value)}</param>`)
      .join('\n');

    xml += `
      <offer id="${escapeXml(product.sku)}" available="${product.available}">
${product.url ? `        <url>${escapeXml(product.url)}</url>\n` : ''}        <price>${product.price}</price>
${priceOld}        <stock_quantity>${product.stock}</stock_quantity>
        <currencyId>UAH</currencyId>
        <categoryId>${product.categoryId}</categoryId>
${pictures}
        <vendor>${escapeXml(product.brand)}</vendor>
        <article>${escapeXml(product.article)}</article>
        <name>${escapeXml(product.name)}</name>
        <name_ua>${escapeXml(product.name)}</name_ua>
        <description>${cdata(product.description)}</description>
        <description_ua>${cdata(product.description)}</description_ua>
${params}
      </offer>`;
  }

  xml += `
    </offers>
  </shop>
</yml_catalog>`;

  fs.writeFileSync('eva.xml', xml);

  console.log(`EVA feed generated: ${readyProducts.length} products, ${categories.length} categories.`);
  if (skippedProducts > 0) {
    console.log(`Skipped ${skippedProducts} products without required EVA fields.`);
  }
}

async function run() {
  const products = await parseProducts();
  buildEva(products);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
