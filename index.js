const XLSX = require('xlsx');
const fs = require('fs');
const { downloadArrayBuffer } = require('./feedDownloader');
const PRODUCT_DIMENSIONS = require('./productDimensions');

const FILE_URL = 'https://fiskars-gratis.com.ua/content/export/f21d2ef6d82a517fac09ea84c53cf5c9.xlsx';
const HOROSHOP_PROM_URLS = Object.freeze([
  'https://fiskars-gratis.com.ua/content/export/1e03430db27aa5834c2f6633af9e2c18.xml',
  'https://fiskars-gratis.com.ua/content/export/e649c9e648cfe80159ba1ece12455095.xml'
]);

const SHARED_PROM_GROUPS = Object.freeze({
  DEFAULT: { id: 1, name: 'Коренева група' },
  SETS: { id: 156333769, name: 'Набір' },
  KITCHEN: { id: 156336200, name: 'Кухня' }
});

const PERSONAL_ROOT_CATEGORY = Object.freeze({ id: 1, name: 'Коренева група' });
const PERSONAL_DISCOUNT_CATEGORY = Object.freeze({ id: 156333769, name: 'Акції' });
const HOROSHOP_PROMOTION_CATEGORY_ID = '1192';
const HOROSHOP_MISSING_CATEGORIES = Object.freeze([
  { id: '1120', parentId: '1175', name: 'Сокири Gerber' },
  { id: '1140', parentId: '1193', name: 'Щітки та скрібки для авто' },
  { id: '1144', parentId: '1072', name: 'Кухонні ножі Fiskars Functional Form' }
]);
const AUTO_ACCESSORY_PRODUCT_SKUS = new Set(['1078497', '1019354']);

const SHARED_SET_PRODUCT_SKUS = new Set([
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

const PERSONAL_SET_PRODUCT_SKUS = new Set([
  ...SHARED_SET_PRODUCT_SKUS,
  '1014828101477',
  '1023492101482',
  '1052240107504',
  '1003466101960',
  '1066487105983'
]);

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

function getSharedPromGroup(product) {
  const sku = String(product.sku).trim();

  if (KITCHEN_PRODUCT_SKUS.has(sku)) return SHARED_PROM_GROUPS.KITCHEN;
  if (SHARED_SET_PRODUCT_SKUS.has(sku)) return SHARED_PROM_GROUPS.SETS;
  return SHARED_PROM_GROUPS.DEFAULT;
}

function decodeXml(value) {
  return String(value)
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function parseHoroshopPromCatalog(xml) {
  const categoriesBlock = xml.match(/<categories>([\s\S]*?)<\/categories>/)?.[1];
  if (!categoriesBlock) throw new Error('Horoshop Prom XML does not contain a categories block');

  const categories = [...categoriesBlock.matchAll(/<category\s+([^>]*)>([\s\S]*?)<\/category>/g)]
    .map((match) => {
      const attributes = match[1];
      const id = attributes.match(/\bid="(\d+)"/)?.[1];
      const parentId = attributes.match(/\bparentId="(\d+)"/)?.[1];

      return {
        id,
        parentId,
        name: decodeXml(match[2].trim())
      };
    })
    .filter((category) => category.id && category.name);

  if (categories.length === 0) throw new Error('Horoshop Prom XML contains no valid categories');

  return { categories };
}

function extractXmlElementText(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`));
  if (!match) return '';

  return decodeXml(match[1]
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .trim());
}

function parseHoroshopPromSource(xml) {
  const catalog = parseHoroshopPromCatalog(xml);
  const offersBlock = xml.match(/<offers>([\s\S]*?)<\/offers>/)?.[1];
  if (!offersBlock) throw new Error('Horoshop Prom XML does not contain an offers block');

  const offers = [...offersBlock.matchAll(/<offer\b[\s\S]*?<\/offer>/g)]
    .map((match) => {
      const offerXml = match[0];
      const sku = extractXmlElementText(offerXml, 'vendorCode');
      const name = extractXmlElementText(offerXml, 'name');
      const price = Number(extractXmlElementText(offerXml, 'price')) || 0;
      const oldPrice = Number(extractXmlElementText(offerXml, 'oldprice')) || 0;
      const categoryId = extractXmlElementText(offerXml, 'categoryId');

      return { sku, name, price, oldPrice, categoryId, offerXml };
    })
    .filter((offer) => offer.sku && offer.name && offer.price > 0);

  if (offers.length === 0) throw new Error('Horoshop Prom XML contains no valid offers');
  return { categories: catalog.categories, offers };
}

async function downloadPersonalPromSources() {
  const sourceXmlFiles = await Promise.all(HOROSHOP_PROM_URLS.map(async (url, index) => {
    const data = await downloadArrayBuffer(url, { label: `Horoshop Prom XML ${index + 1}` });
    return Buffer.from(data).toString('utf8');
  }));

  const categoryById = new Map();
  const offerBySku = new Map();

  for (const xml of sourceXmlFiles) {
    const source = parseHoroshopPromSource(xml);
    for (const category of source.categories) categoryById.set(String(category.id), category);
    for (const offer of source.offers) {
      if (!offerBySku.has(String(offer.sku))) offerBySku.set(String(offer.sku), offer);
    }
  }

  for (const category of HOROSHOP_MISSING_CATEGORIES) {
    if (!categoryById.has(category.id)) categoryById.set(category.id, category);
  }

  return {
    categories: [...categoryById.values()],
    offers: [...offerBySku.values()]
  };
}

function getPersonalPromParameters(product) {
  const sku = String(product.sku).trim();
  if (!AUTO_ACCESSORY_PRODUCT_SKUS.has(sku)) return [];

  return [
    { name: 'Код запчастини', value: sku },
    { name: 'Виробник', value: product.brand || 'Fiskars' }
  ];
}

function getPersonalSourceCategoryId(product) {
  const sku = String(product.sku).trim();
  const name = String(product.name || '').toLocaleLowerCase('uk');

  if (PERSONAL_SET_PRODUCT_SKUS.has(sku) || name.includes('+')) {
    return HOROSHOP_PROMOTION_CATEGORY_ID;
  }

  if (product.oldPrice > product.price || String(product.categoryId) === HOROSHOP_PROMOTION_CATEGORY_ID) {
    return String(PERSONAL_DISCOUNT_CATEGORY.id);
  }

  return String(product.categoryId || PERSONAL_ROOT_CATEGORY.id);
}

function formatDimension(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Number(number.toFixed(3))) : String(value);
}

function enrichHoroshopPromOffer(product) {
  const sku = String(product.sku).trim();
  const categoryId = getPersonalSourceCategoryId(product);
  let offerXml = product.offerXml;

  // Keep the existing personal-feed identity so the next import updates products instead of duplicating them.
  offerXml = offerXml.replace(/<offer\b([^>]*)>/, (fullMatch, attributes) => {
    const updatedAttributes = /\bid=(['"])[\s\S]*?\1/.test(attributes)
      ? attributes.replace(/\bid=(['"])[\s\S]*?\1/, `id="${escapeXml(sku)}"`)
      : ` id="${escapeXml(sku)}"${attributes}`;
    return `<offer${updatedAttributes}>`;
  });

  if (/<categoryId>[\s\S]*?<\/categoryId>/.test(offerXml)) {
    offerXml = offerXml.replace(
      /<categoryId>[\s\S]*?<\/categoryId>/,
      `<categoryId>${escapeXml(categoryId)}</categoryId>`
    );
  }

  const dimensions = PRODUCT_DIMENSIONS[sku];
  if (dimensions && !/<dimensions>/.test(offerXml)) {
    const dimensionsXml = `    <dimensions>
     <weight unit="kg">${formatDimension(dimensions.weight)}</weight>
     <width unit="cm">${formatDimension(dimensions.width)}</width>
     <height unit="cm">${formatDimension(dimensions.height)}</height>
     <length unit="cm">${formatDimension(dimensions.length)}</length>
    </dimensions>`;
    const vendorCodeOffset = offerXml.search(/^\s*<vendorCode>/m);

    offerXml = vendorCodeOffset >= 0
      ? `${offerXml.slice(0, vendorCodeOffset)}${dimensionsXml}\n${offerXml.slice(vendorCodeOffset)}`
      : offerXml.replace(/\s*<\/offer>\s*$/, `\n${dimensionsXml}\n   </offer>`);
  }

  for (const parameter of getPersonalPromParameters({
    ...product,
    brand: extractXmlElementText(offerXml, 'vendor')
  })) {
    const parameterPattern = new RegExp(`<param\\s+name=(['"])${parameter.name}\\1>`);
    if (parameterPattern.test(offerXml)) continue;

    offerXml = offerXml.replace(
      /\s*<\/offer>\s*$/,
      `\n    <param name="${escapeXml(parameter.name)}">${escapeXml(parameter.value)}</param>\n   </offer>`
    );
  }

  return offerXml;
}

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
    const oldPrice = Number(row['Старая цена']) || 0;
    const photos = row['Фото'];
    const quantity = Number(row['Количество']) || 0;
    const section = row['Раздел'] || '';
    const brand = row['Бренд'] || '';

    if (!sku || !name || price <= 0) continue;

    const images = photos
      ? String(photos).split(';').map((photo) => photo.trim()).filter(Boolean)
      : [];

    products.push({
      sku,
      name,
      price,
      oldPrice,
      stock: quantity,
      available: quantity > 0,
      images,
      description,
      section,
      brand
    });
  }

  return products;
}

function buildPromFeed(products, {
  filename,
  groups,
  resolveGroup,
  includeOldPrice = false,
  includeProductIdentifiers = false,
  resolveParameters = () => []
}) {
  const groupList = Array.isArray(groups) ? groups : Object.values(groups);
  const categoriesXml = groupList
    .map((group) => {
      const parentId = group.parentId ? ` parentId="${escapeXml(group.parentId)}"` : '';
      return `      <category id="${escapeXml(group.id)}"${parentId}>${escapeXml(group.name)}</category>`;
    })
    .join('\n');

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${new Date().toISOString()}">
  <shop>
    <categories>
${categoriesXml}
    </categories>
    <offers>`;

  for (let p of products) {
    const sku = String(p.sku).trim();
    const categoryId = resolveGroup(p).id;
    const pictures = p.images
      .map((image) => `        <picture>${image}</picture>`)
      .join('\n');
    const dimensions = PRODUCT_DIMENSIONS[sku];
    const dimensionsXml = dimensions
      ? `        <dimensions>
          <weight unit="kg">${dimensions.weight}</weight>
          <width unit="cm">${dimensions.width}</width>
          <height unit="cm">${dimensions.height}</height>
          <length unit="cm">${dimensions.length}</length>
        </dimensions>\n`
      : '';
    const oldPriceXml = includeOldPrice && p.oldPrice > p.price
      ? `        <oldprice>${p.oldPrice}</oldprice>\n`
      : '';
    const identifiersXml = includeProductIdentifiers
      ? `        <vendorCode>${escapeXml(sku)}</vendorCode>\n${p.brand ? `        <vendor>${escapeXml(p.brand)}</vendor>\n` : ''}`
      : '';
    const parametersXml = resolveParameters(p)
      .map((parameter) => `        <param name="${escapeXml(parameter.name)}">${escapeXml(parameter.value)}</param>`)
      .join('\n');

    xml += `
      <offer id="${p.sku}" available="${p.available}">
        <name><![CDATA[${p.name}]]></name>
${oldPriceXml}        <price>${p.price}</price>
        <categoryId>${categoryId}</categoryId>
        <currencyId>UAH</currencyId>
${pictures ? `${pictures}\n` : ''}${dimensionsXml}${identifiersXml}${parametersXml ? `${parametersXml}\n` : ''}        <description><![CDATA[${p.description || p.name}]]></description>
        <stock_quantity>${p.stock}</stock_quantity>
      </offer>`;
  }

  xml += `
    </offers>
  </shop>
</yml_catalog>`;

  fs.writeFileSync(filename, xml);
}

function buildRozetka(products) {
  buildPromFeed(products, {
    filename: 'rozetka.xml',
    groups: SHARED_PROM_GROUPS,
    resolveGroup: getSharedPromGroup
  });
}

function buildPersonalProm(source) {
  const categories = [
    PERSONAL_ROOT_CATEGORY,
    ...source.categories
      .filter((category) => String(category.id) !== String(PERSONAL_ROOT_CATEGORY.id))
      .map((category) => category.id === HOROSHOP_PROMOTION_CATEGORY_ID
        ? { ...category, name: '1+1' }
        : category),
    PERSONAL_DISCOUNT_CATEGORY
  ];
  const categoriesXml = categories
    .filter((category, index, all) => all.findIndex((item) => String(item.id) === String(category.id)) === index)
    .map((category) => {
      const parentId = category.parentId ? ` parentId="${escapeXml(category.parentId)}"` : '';
      return `   <category id="${escapeXml(category.id)}"${parentId}>${escapeXml(category.name)}</category>`;
    })
    .join('\n');
  const offersXml = source.offers.map(enrichHoroshopPromOffer).join('\n');
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE yml_catalog SYSTEM "shops.dtd">
<yml_catalog date="${generatedAt}">
 <shop>
  <currencies>
   <currency id="UAH" rate="1"/>
  </currencies>
  <categories>
${categoriesXml}
  </categories>
  <offers>
${offersXml}
  </offers>
 </shop>
</yml_catalog>`;

  fs.writeFileSync('prom-andrii.xml', xml);
}

async function run() {
  const [products, personalSource] = await Promise.all([
    parseProducts(),
    downloadPersonalPromSources()
  ]);
  buildRozetka(products);
  buildPersonalProm(personalSource);
}

run();
