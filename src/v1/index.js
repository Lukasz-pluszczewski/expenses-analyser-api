import { Router as router } from 'express';
import { name, version, author } from '../../package.json';
import log from 'all-log';
import _ from 'lodash';
import fs from 'fs';
import path from 'path';
import cheerio from 'cheerio';

const FOOD = 'FOOD';
const RESTAURANT = 'RESTAURANT';
const CAR = 'CAR';
const ENTERTAINMENT = 'ENTERTAINMENT';
const SPORT = 'SPORT';
const ELECTRONICS = 'ELECTRONICS';
const SEX = 'SEX';
const COSMETICS = 'COSMETICS';
const HEALTH = 'HEALTH';
const SERVICES = 'SERVICES';
const KIMCZERS = 'KIMCZERS';
const CLOTHES = 'CLOTHES';
const HOME = 'HOME';
const PAYU = RESTAURANT;
const PAYPRO = RESTAURANT;
const BLUEMEDIA = 'BLUEMEDIA';

const catalogue = {
  'zabka': FOOD,
  'CARREFOUR': FOOD,
  'GRZYBEK-PL': FOOD,
  'AUCHAN': FOOD,
  'FRESHMARKET': FOOD,
  'TESCO': FOOD,
  'Lidl': FOOD,
  'BIEDRONKA': FOOD,
  'McDonalds': RESTAURANT,
  'Pizza': RESTAURANT,
  'SZYNK NA WINKLU': RESTAURANT,
  'Czekoladziarnia': RESTAURANT,
  'RESTAURACJA': RESTAURANT,
  'Restaurant': RESTAURANT,
  'DOMINIUM': RESTAURANT,
  'pyszne': RESTAURANT,
  'Starbucks': RESTAURANT,
  'POCO LOCO': RESTAURANT,
  'PLAYSTATIONNETWORK': ENTERTAINMENT,
  'GOOGLE': ENTERTAINMENT,
  'HBOEUROPESRO': ENTERTAINMENT,
  'NETFLIX': ENTERTAINMENT,
  'Spotify': ENTERTAINMENT,
  'SOUNDIIZ': ENTERTAINMENT,
  'SUMUP': SPORT,
  'x-kom': ELECTRONICS,
  'Zoolo': KIMCZERS,
  'sex': SEX,
  'BEAUTY': COSMETICS,
  'ROSSMANN': COSMETICS,
  'sephora': COSMETICS,
  'DIVERSE': CLOTHES,
  'BERSHKA': CLOTHES,
  'ZALANDO': CLOTHES,
  'pachnidelko': COSMETICS,
  'hebe': COSMETICS,
  'notino': COSMETICS,
  'Feel_Unique': COSMETICS,
  'Super - Pharm': COSMETICS,
  'BARBER': SERVICES,
  'uber': SERVICES,
  'TRAFICAR': SERVICES,
  'InPost': SERVICES,
  'SHELL': CAR,
  'Stalexport': CAR,
  'ORLEN': CAR,
  'ALICJA BARANEK': HEALTH,
  'CENTRUM MED.': HEALTH,
  'Apteka': HEALTH,
  'MEDICINE': HEALTH,
  'PayU': PAYU,
  'PayPro': PAYPRO,
  'BLUEMEDIA': BLUEMEDIA,
  'IKEA': HOME,
  'Leroy': HOME,
};

export default () => {
  const api = router();

  api.get('/stats', (req, res) => {
    const month = req.query.month || null;
    fs.readFile(path.resolve(process.env.NODE_PATH, '../data/Historia_Operacji_2018-11-22_13-50-12.html'), 'utf-8', (err, html) => {
      if (err) throw err;

      const $ = cheerio.load(html);
      const mapped = [];

      const COLUMN_NAME = {
        0: 'transactionDate',
        1: 'bookingDate',
        2: 'details',
        3: 'amount',
        4: 'amountConverted',
      };
      const parseAmount = signedString => {
        let string = signedString;
        let negative = false;
        if (signedString.indexOf('-') !== -1) {
          string = signedString.replace(/- ?/, '');
          negative = true;
        }

        const [temp1, temp2] = string.split(',');
        const [decimal, currency] = temp2.split(' ');
        const price = `${temp1.replace(' ', '')}.${decimal}`;

        return {
          amount: parseFloat(`${negative ? '-' : ''}${price}`),
          currency,
        };
      };


      $('#TRAN_DATA tbody tr').each((i, row) => {
        const newRow = {
          cardTransaction: false,
          additionalData: [],
        };
        $(row).find('td').each((i, column) => {
          if (i === 3) {
            const parsedAmount = parseAmount($(column).text());
            newRow.amount = parsedAmount.amount;
            newRow.currency = parsedAmount.currency;
          } else if (i === 4) {
            const parsedAmount = parseAmount($(column).text());
            newRow.amountConverted = parsedAmount.amount;
            newRow.accountCurrency = parsedAmount.currency;
          } else if (i === 2) {
            $(column).find('div').each((j, detailLine) => {
              const text = $(detailLine).text();
              const spanText = $(detailLine).find('span').text();

              const name = text.replace(spanText, '').trim();
              const value = spanText.replace(': ', '').trim();

              if (name === 'Transakcja kartą debetową') {
                newRow.cardTransaction = true;
              } else if (name === 'Nadawca') {
                newRow.sender = value;
              } else if (name === 'Numer rachunku nadawcy') {
                newRow.senderAccountNumber = value;
              } else if (name === 'Odbiorca') {
                newRow.receiver = value;
              } else if (name === 'Opis transakcji') {
                newRow.description = value;
              } else if (name === 'Numer rachunku odbiorcy') {
                newRow.receiverAccountNumber = value;
              } else {
                newRow.additionalData.push({ name, value });
              }
            });
            newRow[COLUMN_NAME[i]] = $(column).html();
          } else {
            newRow[COLUMN_NAME[i]] = $(column).text();
          }
        });

        newRow.categories = getCategory(newRow);

        if (month) {
          if (newRow.transactionDate.indexOf(month) !== -1) {
            return mapped.push(newRow);
          }
          return true;
        }
        return mapped.push(newRow);
      });

      res.json(stats(mapped));
    });
  });

  return api;
};

function contains(text, keyword) {
  return text && text.toLowerCase().indexOf(keyword.toLowerCase()) !== -1;
}

function getCategory(transaction) {
  const categories = [];
  _.forEach(catalogue, (category, keyword) => {
    category = category.toLowerCase();
    if (contains(transaction.description, keyword) || contains(transaction.receiver, keyword)) {
      categories.push(category);
    }
  });
  return categories.length ? categories : ['other'];
}

function stats(list) {
  // calculating sums
  const sums = { in: 0, out: 0 };
  const categories = {};
  const categoriesList = {};
  list.forEach(el => {
    const amount = el.amountConverted;
    if (amount > 0) {
      sums.in += amount;
    } else {
      getCategory(el).forEach(category => {
        categories[category] = (categories[category] || 0) + el.amount;
        if (!categoriesList[category]) {
          categoriesList[category] = [];
        }
        categoriesList[category].push(el);
      });

      sums.out += amount;
    }
  });

  return { sums, categories, categorised: categoriesList, all: list };
}

/*
transactionDate
bookingDate
cardTransaction
sender
receiver
description
amount
currency
amountConverted
accountCurrency
senderAccountNumber
receiverAccountNumber
 */