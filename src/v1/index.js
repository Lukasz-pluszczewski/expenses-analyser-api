import { Router as router } from 'express';
import { name, version, author } from '../../package.json';
import log from 'all-log';
import fs from 'fs';
import path from 'path';
import cheerio from 'cheerio';

export default () => {
  const api = router();

  api.get('/stats', (req, res) => {
    fs.readFile(path.resolve(process.env.NODE_PATH, '../data/test.html'), 'utf-8', (err, html) => {
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
          string = signedString.replace('- ', '');
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
        return mapped.push(newRow);
      });

      res.json(mapped);
    });
  });

  return api;
};


function stats(list) {
  // calculating sums
  const sums = {in: 0, out: 0};
  list.forEach(el => {
    if (el.amount > 0) {
      sums.in += el.amount;
    } else {
      sums.out += el.amount;
    }
  });

  return {sums};
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