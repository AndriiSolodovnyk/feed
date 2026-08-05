const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs');

const FILE_URL = 'https://fiskars-gratis.com.ua/content/export/f21d2ef6d82a517fac09ea84c53cf5c9.xlsx';
const FIRM_NAME = 'Fiskars Gratis';

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
    .filter(Boolean);
}

function normalizeCategoryPath(path) {
  const parts = String(path || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length ? parts : ['FISKARS'];
}

function normalizeStock(stock, sourceAvailability) {
  if (stock > 0) return 'В наявності';
  if (sourceAvailability) return sourceAvailability;
  return 'Немає в наявності';
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
    const stock = Math.max(0, Math.floor(parseNumber(getValue(row, 'Количество'))));
    const description = getValue(row, 'Описание товара (UA)') || getValue(row, 'Короткое описание (UA)') || name;
    const images = parseImages(getValue(row, 'Фото'), getValue(row, 'Галерея'));
    const categoryPath = normalizeCategoryPath(getValue(row, 'Раздел'));
    const warrantyMonths = Math.floor(parseNumber(getValue(row, 'Гарантийный срок, мес.')));

    const params = [
      ['Артикул', sku],
      ['Бренд', brand],
      ['Оригінальність', 'Оригінал'],
      ['Стан товару', getValue(row, 'Состояние товара') || 'Новий'],
      ['Тип гарантії', getValue(row, 'Тип гарантии')],
      ['Гарантійний строк, міс.', warrantyMonths > 0 ? warrantyMonths : ''],
      ['Колір', getValue(row, 'Цвет')],
      ['Штрихкод', getValue(row, 'Штрихкод')],
      ['Код УКТ ЗЕД', getValue(row, 'Код УКТ ВЭД')],
      ['Код виробника товару (MPN)', getValue(row, 'Код производителя товара (MPN)')],
      ['Категорія Хорошоп', categoryPath.join(' / ')]
    ].filter(([, value]) => value !== '');

    return {
      sku,
      name,
      brand,
      price,
      stock,
      stockText: normalizeStock(stock, getValue(row, 'Наличие')),
      description,
      images,
      categoryPath,
      url: getValue(row, 'Ссылка'),
      barcode: getValue(row, 'Штрихкод'),
      code: getValue(row, 'Код производителя товара (MPN)') || sku,
      warrantyMonths,
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

function buildCategoryXml(categories) {
  return categories.map((category) => {
    const parentId = category.parentId ? `
            <parentId>${category.parentId}</parentId>` : '';

    return `        <category>
            <id>${category.id}</id>${parentId}
            <name>${escapeXml(category.name)}</name>
        </category>`;
  }).join('\n');
}

function buildItemXml(product) {
  const images = product.images
    .map((image) => `            <image>${escapeXml(image)}</image>`)
    .join('\n');
  const params = product.params
    .map(([name, value]) => `            <param name="${escapeXml(name)}">${escapeXml(value)}</param>`)
    .join('\n');
  const barcode = product.barcode ? `            <barcode>${escapeXml(product.barcode)}</barcode>\n` : '';
  const url = product.url ? `            <url>${escapeXml(product.url)}</url>\n` : '';
  const guarantee = product.warrantyMonths > 0
    ? `            <guarantee type="manufacturer">${product.warrantyMonths}</guarantee>\n`
    : '';

  return `        <item>
            <id>${escapeXml(product.sku)}</id>
            <categoryId>${product.categoryId}</categoryId>
            <code>${escapeXml(product.code)}</code>
${barcode}            <vendor>${escapeXml(product.brand)}</vendor>
            <name>${escapeXml(product.name)}</name>
            <description>${cdata(product.description)}</description>
${url}${images}
            <priceRUAH>${product.price}</priceRUAH>
            <stock>${escapeXml(product.stockText)}</stock>
${guarantee}${params}
            <condition>0</condition>
        </item>`;
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

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<price>
    <date>${formatDate(new Date())}</date>
    <firmName>${escapeXml(FIRM_NAME)}</firmName>
    <categories>
${buildCategoryXml(categories)}
    </categories>
    <items>
${readyProducts.map(buildItemXml).join('\n')}
    </items>
</price>`;

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
