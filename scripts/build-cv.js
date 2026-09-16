const fs = require('fs');
const path = require('path');
const { mdToPdf } = require('md-to-pdf');

async function buildCv() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('Usage: npm run build-cv <path-to-markdown-file>');
    process.exit(1);
  }

  const parsedPath = path.parse(inputFile);
  const outputFile = path.join(parsedPath.dir, `${parsedPath.name}.pdf`);

  try {
    const pdf = await mdToPdf({ path: inputFile }, {
      pdf_options: {
        format: 'A4',
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
        printBackground: true
      },
      css: `
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11pt; color: #333; line-height: 1.4; }
        h1 { font-size: 24pt; margin-bottom: 5px; color: #000; }
        h2 { font-size: 14pt; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-top: 15px; margin-bottom: 10px; color: #444; text-transform: uppercase; letter-spacing: 1px; }
        h3 { font-size: 12pt; margin-bottom: 5px; margin-top: 10px; color: #000; }
        p, li { margin-bottom: 5px; }
        ul { padding-left: 20px; }
        a { color: #0366d6; text-decoration: none; }
        hr { display: none; }
      `
    });

    if (pdf) {
      fs.writeFileSync(outputFile, pdf.content);
      console.log(`✅ Successfully created PDF: ${outputFile}`);
    } else {
      console.error('Failed to generate PDF content.');
    }
  } catch (err) {
    console.error('Error generating PDF:', err);
    process.exit(1);
  }
}

buildCv();
