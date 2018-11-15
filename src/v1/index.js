import { Router as router } from 'express';
import { name, version, author } from '../../package.json';
import log from 'all-log';
import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import xlsx from 'xlsx';
import cheerio from 'cheerio';
import parse from 'csv-parse/lib/sync';

export default () => {
  const api = router();

  api.get('/stats', (req, res) => {
    fs.readFile(path.resolve(process.env.NODE_PATH, '../data/Historia_Operacji_2018-11-15_18-16-00.csv'), 'binary', (err, rawData) => {
      if (err) throw err;

      let data = iconv.decode(rawData, 'cp1250');

      const [first, ...lines] = data.split('\r\n');
      log('length', lines.length, `${lines[1].replace(/;\n$/m, '\n')}`);
      data = lines.map(line => line.replace(/;$/, '')).join('\n');

      try {
        const records = parse(data, {
          columns: false,
          skip_empty_lines: true,
          skip_lines_with_error: true,
          delimiter: ';',
        });
        res.json(records);
      } catch (e) {
        res.status(500).json({message: e.message});
      }
    });
  });

  api.get('/statsxls', (req, res) => {
    const workbook = xlsx.readFile(path.resolve(process.env.NODE_PATH, '../data/test.xls'));

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const parsed = xlsx.utils.sheet_to_json(worksheet);

    /*
    "__EMPTY": "Nazwa nadawcy",
        "__EMPTY_1": "Nazwa odbiorcy",
        "__EMPTY_2": "Szczegóły transakcji",
        "__EMPTY_3": "Kwota operacji",
        "__EMPTY_4": "Waluta operacji",
        "__EMPTY_5": "Kwota w walucie rachunku",
        "__EMPTY_6": "Waluta rachunku",
        "__EMPTY_7": "Numer rachunku nadawcy",
        "__EMPTY_8": "Numer rachunku odbiorcy"
     */

    const [first, ...mapped] = parsed.map(el => {
      return {
        transactionDate: el['Kryteria transakcji : '],
        bookingDate: '',
        cardTransaction: null,
        sender: el['__EMPTY'],
        receiver: el['__EMPTY_1'],
        description: el['__EMPTY_2'],
        amount: el['__EMPTY_3'],
        currency: el['__EMPTY_4'],
        amountConverted: el['__EMPTY_5'],
        accountCurrency: el['__EMPTY_6'],
        senderAccountNumber: el['__EMPTY_7'],
        receiverAccountNumber: el['__EMPTY_8'],
      };
    });




    res.json(stats(mapped));
      // res.status(500).json({message: e.message});
  });

  api.get('/cheerio', (req, res) => {
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