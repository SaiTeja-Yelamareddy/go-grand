import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logoPath = path.join(__dirname, 'logo.png');

export function generateBillNo(jobId, createdAt) {
  if (jobId && String(jobId).includes('GG-')) {
    return String(jobId);
  }
  const dateObj = createdAt ? new Date(createdAt) : new Date();
  const yearStr = dateObj.getFullYear().toString().slice(-2);
  const nextYearStr = (dateObj.getFullYear() + 1).toString().slice(-2);

  let numPart = '01';
  if (jobId) {
    const num = Math.abs(
      String(jobId).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    ) % 99 + 1;
    numPart = num < 10 ? `0${num}` : `${num}`;
  } else {
    const min = dateObj.getMinutes();
    numPart = min < 10 ? `0${min}` : `${min}`;
  }

  return `GG-${yearStr}-${nextYearStr}-${numPart}`;
}

export function numberToWordsRupees(amount) {
  if (isNaN(amount) || amount <= 0) return 'Rupees Zero Only';

  const single = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teen = [
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertLessThanThousand(n) {
    let str = '';

    if (n >= 100) {
      str += single[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }

    if (n >= 10 && n < 20) {
      str += teen[n - 10] + ' ';
    } else if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' ';
      if (n % 10 > 0) {
        str += single[n % 10] + ' ';
      }
    } else if (n > 0) {
      str += single[n] + ' ';
    }

    return str;
  }

  let num = Math.floor(amount);
  let words = '';

  if (num >= 10000000) {
    words += convertLessThanThousand(Math.floor(num / 10000000)) + 'Crore ';
    num %= 10000000;
  }

  if (num >= 100000) {
    words += convertLessThanThousand(Math.floor(num / 100000)) + 'Lakh ';
    num %= 100000;
  }

  if (num >= 1000) {
    words += convertLessThanThousand(Math.floor(num / 1000)) + 'Thousand ';
    num %= 1000;
  }

  if (num > 0) {
    words += convertLessThanThousand(num);
  }

  return `Rupees ${words.trim()} Only`;
}

export function parsePriceNumber(priceStr) {
  if (!priceStr) return 0;
  const clean = String(priceStr).replace(/[^0-9.]/g, '');
  return parseFloat(clean) || 0;
}

/**
 * Generates a PDF Tax Invoice buffer matching the exact UI layout.
 * @param {Object} job - Job record
 * @returns {Promise<Buffer>} PDF Buffer
 */
export function generateInvoicePDF(job) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const billNo = job.billNo || generateBillNo(job.id, job.createdAt);
      const dateStr = job.createdAt
        ? new Date(job.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

      const priceNum = parsePriceNumber(job.price);
      const discountNum = job.discount ? parsePriceNumber(job.discount) : 0;
      const grandTotal = Math.max(0, priceNum - discountNum);
      const amountInWords = numberToWordsRupees(grandTotal);

      let servicesText = 'FOAM WASH';
      let bulletPoints = [
        'Foam Wash',
        'Hydraulic Lift',
        'Dashboard Polishing',
        'Vacuum Clean',
        'Mat Clean',
        '2 Mat Papers',
      ];

      if (Array.isArray(job.services) && job.services.length > 0) {
        servicesText = job.services[0].toUpperCase();
        if (job.services.length > 1) {
          bulletPoints = job.services;
        }
      } else if (typeof job.services === 'string' && job.services.trim()) {
        servicesText = job.services.toUpperCase();
      } else if (job.service) {
        servicesText = String(job.service).toUpperCase();
      }

      const primaryColor = '#171717';
      const grayText = '#555555';
      const lightBg = '#F3F3F3';
      const borderColor = '#D8D8D8';
      const accentGold = '#F4C430';

      // 1. HEADER SECTION
      // Left: Company Logo & Info
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 40, 35, { fit: [135, 48] });
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor(primaryColor)
          .text('CAR WASH & DETAILING', 40, 88);

        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor(grayText)
          .text('Tirupati Highway, Murukambattu, Andhra Pradesh', 40, 101)
          .text('Phone: 8008195435   |   Email: kamalvamsi2001@gmail.com', 40, 112);
      } else {
        doc
          .fontSize(22)
          .font('Helvetica-Bold')
          .fillColor(primaryColor)
          .text('GO GRAND', 40, 40);

        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor(primaryColor)
          .text('CAR WASH & DETAILING', 40, 68);

        doc
          .fontSize(8.5)
          .font('Helvetica')
          .fillColor(grayText)
          .text('Tirupati Highway, Murukambattu, Andhra Pradesh', 40, 84)
          .text('Phone: 8008195435   |   Email: kamalvamsi2001@gmail.com', 40, 96);
      }

      // Right: Invoice Title & Bill Metadata
      doc
        .fontSize(22)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text('INVOICE', 350, 40, { align: 'right', width: 205.28 });

      doc
        .fontSize(8.5)
        .font('Helvetica')
        .fillColor(primaryColor)
        .text(`Bill No: `, 350, 68, { align: 'right', width: 205.28, continued: true })
        .font('Helvetica-Bold')
        .text(billNo);

      doc
        .font('Helvetica')
        .text(`Date: `, 350, 82, { align: 'right', width: 205.28, continued: true })
        .font('Helvetica-Bold')
        .text(dateStr);

      // 2. BRAND GOLD ACCENT BAR
      doc
        .rect(40, 114, 515.28, 3.5)
        .fill(accentGold);

      // 3. CUSTOMER & VEHICLE INFORMATION GRID
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text('CUSTOMER & VEHICLE INFORMATION', 40, 128);

      const gridY = 142;
      const gridW = 515.28;
      const gridH = 88;
      const colW = gridW / 2;

      // Outer border
      doc
        .rect(40, gridY, gridW, gridH)
        .strokeColor(borderColor)
        .lineWidth(1)
        .stroke();

      // Vertical divider
      doc
        .moveTo(40 + colW, gridY)
        .lineTo(40 + colW, gridY + gridH)
        .strokeColor(borderColor)
        .stroke();

      // BILL TO Header
      doc
        .rect(40, gridY, colW, 18)
        .fillAndStroke(lightBg, borderColor);
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text('BILL TO', 48, gridY + 5);

      // BILL TO Content
      let leftY = gridY + 24;
      doc.fontSize(8.5).fillColor(primaryColor);
      
      doc.font('Helvetica-Bold').text('Name: ', 48, leftY, { continued: true })
         .font('Helvetica').text(job.customerName || 'datta');
      
      leftY += 14;
      doc.font('Helvetica-Bold').text('Mobile: ', 48, leftY, { continued: true })
         .font('Helvetica').text(job.phoneNumber || '8121292501');

      leftY += 14;
      doc.font('Helvetica-Bold').text('Email: ', 48, leftY, { continued: true })
         .font('Helvetica').text(job.email || 'customer@email.com');

      leftY += 14;
      doc.font('Helvetica-Bold').text('Address: ', 48, leftY, { continued: true })
         .font('Helvetica').text(job.location || job.address || 'jrg');

      // VEHICLE DETAILS Header
      doc
        .rect(40 + colW, gridY, colW, 18)
        .fillAndStroke(lightBg, borderColor);
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text('VEHICLE DETAILS', 40 + colW + 8, gridY + 5);

      // VEHICLE DETAILS Content
      let rightY = gridY + 24;
      const rightX = 40 + colW + 8;

      doc.font('Helvetica-Bold').text('Vehicle No: ', rightX, rightY, { continued: true })
         .font('Helvetica-Bold').text((job.vehicleNumber || '1234').toUpperCase());

      rightY += 14;
      doc.font('Helvetica-Bold').text('Model: ', rightX, rightY, { continued: true })
         .font('Helvetica').text(job.vehicleName || 'Skoda Slavia');

      rightY += 14;
      doc.font('Helvetica-Bold').text('Service Date: ', rightX, rightY, { continued: true })
         .font('Helvetica').text(dateStr);

      rightY += 14;
      doc.font('Helvetica-Bold').text('Location: ', rightX, rightY, { continued: true })
         .font('Helvetica').text('GO GRAND');

      // 4. SERVICE DETAILS TABLE
      let tableY = 246;
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text('SERVICE DETAILS', 40, tableY);

      tableY += 16;

      // Header top line
      doc
        .moveTo(40, tableY)
        .lineTo(555.28, tableY)
        .lineWidth(1.5)
        .strokeColor(primaryColor)
        .stroke();

      // Header Labels
      tableY += 5;
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text('DESCRIPTION', 40, tableY)
        .text('RATE', 320, tableY, { width: 70, align: 'center' })
        .text('QTY', 400, tableY, { width: 40, align: 'center' })
        .text('AMOUNT', 460, tableY, { width: 95.28, align: 'right' });

      tableY += 14;

      // Header bottom line
      doc
        .moveTo(40, tableY)
        .lineTo(555.28, tableY)
        .lineWidth(1.5)
        .strokeColor(primaryColor)
        .stroke();

      // Service Row
      tableY += 8;
      doc
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text(servicesText, 40, tableY)
        .font('Helvetica')
        .text(`Rs. ${priceNum.toFixed(2)}`, 320, tableY, { width: 70, align: 'center' })
        .text('1', 400, tableY, { width: 40, align: 'center' })
        .font('Helvetica-Bold')
        .text(`Rs. ${priceNum.toFixed(2)}`, 460, tableY, { width: 95.28, align: 'right' });

      tableY += 16;
      // Sub-bullets text line
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(grayText)
        .text(bulletPoints.join('  •  '), 40, tableY);

      tableY += 16;
      // Bottom table line
      doc
        .moveTo(40, tableY)
        .lineTo(555.28, tableY)
        .lineWidth(1)
        .strokeColor(primaryColor)
        .stroke();

      // 5. TOTAL SECTION
      let totalY = tableY + 12;
      const totalBoxX = 350;
      const totalBoxW = 205.28;

      doc
        .fontSize(8.5)
        .font('Helvetica')
        .fillColor(grayText)
        .text('Subtotal:', totalBoxX, totalY)
        .text(`Rs. ${priceNum.toFixed(2)}`, totalBoxX, totalY, { align: 'right', width: totalBoxW });

      totalY += 14;
      doc
        .text('Discount:', totalBoxX, totalY)
        .text(`Rs. ${discountNum.toFixed(2)}`, totalBoxX, totalY, { align: 'right', width: totalBoxW });

      totalY += 14;
      doc
        .moveTo(totalBoxX, totalY)
        .lineTo(555.28, totalY)
        .lineWidth(0.5)
        .strokeColor(borderColor)
        .stroke();

      totalY += 6;
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text('GRAND TOTAL', totalBoxX, totalY)
        .text(`Rs. ${grandTotal.toFixed(2)}`, totalBoxX, totalY, { align: 'right', width: totalBoxW });

      // 6. AMOUNT IN WORDS BOX
      let wordsY = totalY + 24;
      doc
        .rect(40, wordsY, 515.28, 24)
        .fillAndStroke(lightBg, '#E5E5E5');

      doc
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text('Amount in Words: ', 48, wordsY + 7, { continued: true })
        .font('Helvetica')
        .text(amountInWords);

      // 7. THANK YOU & FOOTER SECTION
      let footerY = wordsY + 45;
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text('Thank You for Choosing GO GRAND', 40, footerY, { align: 'center', width: 515.28 });

      footerY += 14;
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(grayText)
        .text('We appreciate your business and look forward to serving you again.', 40, footerY, { align: 'center', width: 515.28 });

      footerY += 14;
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text('GO GRAND  •  CAR WASH & DETAILING', 40, footerY, { align: 'center', width: 515.28 });

      footerY += 24;
      doc
        .moveTo(40, footerY)
        .lineTo(555.28, footerY)
        .lineWidth(0.5)
        .strokeColor(borderColor)
        .stroke();

      footerY += 6;
      doc
        .fontSize(7)
        .font('Helvetica')
        .fillColor('#777777')
        .text('This is a computer-generated invoice. No signature is required.', 40, footerY, { align: 'center', width: 515.28 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
