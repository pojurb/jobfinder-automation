const { PDFParse } = require('pdf-parse');
const fs = require('fs');

const parser = new PDFParse({});
const buf = fs.readFileSync('D:/jobfinder-automation/CV Johannes Purba.pdf');
parser.load(buf).then(async () => {
  const numPages = parser.numPages || 10;
  let fullText = '';
  for (let i = 1; i <= numPages; i++) {
    try {
      const pageText = await parser.getPageText(i);
      fullText += pageText + '\n';
    } catch (e) { break; }
  }
  fs.writeFileSync('D:/jobfinder-automation/cv_text.txt', fullText);
  console.log('DONE. Pages processed:', numPages);
}).catch(err => {
  console.error('ERROR:', err.message);
});
