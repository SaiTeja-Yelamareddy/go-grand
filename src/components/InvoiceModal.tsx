import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Send, CheckCircle2 } from 'lucide-react';
import { formatNumericDateIST, type JobRecord } from '../utils/draftStorage';
import { generateBillNo, parsePriceNumber, numberToWordsRupees, sendWhatsAppBillViaBackend } from '../utils/invoiceUtils';

interface InvoiceModalProps {
  record: JobRecord;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ record, onClose }) => {
  const [sendingPdf, setSendingPdf] = React.useState(false);
  const [sentSuccess, setSentSuccess] = React.useState(false);

  const billNo = record.billNo || generateBillNo(record.id, record.createdAt);
  const dateStr = formatNumericDateIST(record.createdAt || new Date());

  const priceNum = parsePriceNumber(record.price);
  const discountNum = record.discount ? parsePriceNumber(record.discount) : 0;
  const grandTotal = Math.max(0, priceNum - discountNum);
  const amountInWords = numberToWordsRupees(grandTotal);

  let servicesList: string[] = [];
  if (Array.isArray(record.services) && record.services.length > 0) {
    servicesList = record.services;
  } else if (typeof record.services === 'string' && record.services.trim()) {
    servicesList = record.services.split(',').map((service) => service.trim()).filter(Boolean);
  } else if (record.service) {
    servicesList = record.service.split(',').map((service) => service.trim()).filter(Boolean);
  }
  const sectionName = servicesList[0] || '';
  const selectedServices = servicesList.slice(1).filter((service) => service.trim());

  const handlePrint = () => {
    window.print();
  };

  const handleSendWhatsAppPDF = async () => {
    setSendingPdf(true);
    setSentSuccess(false);
    try {
      await sendWhatsAppBillViaBackend(record);
      setSentSuccess(true);
      setTimeout(() => setSentSuccess(false), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setSendingPdf(false);
    }
  };

  return createPortal(
    <div className="printable-invoice-modal-root fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static print:block">
      {/* MODAL WRAPPER */}
      <div className="printable-invoice-card relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden my-auto print:shadow-none print:w-full print:max-w-none print:rounded-none">
        
        {/* MODAL ACTION HEADER (HIDDEN IN PRINT) */}
        <div className="sticky top-0 z-20 bg-[#111111] text-white px-4 py-3 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-[#F4C430]" />
            <h3 className="font-bold text-sm tracking-wide uppercase">
              {sentSuccess ? '✅ BILL SENT THROUGH LINKED WHATSAPP' : 'Official Tax Invoice (LaTeX Template)'}
            </h3>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleSendWhatsAppPDF}
              disabled={sendingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#20bd5a] disabled:opacity-50 text-white text-xs font-extrabold uppercase rounded-lg transition-colors cursor-pointer"
              title="Send PDF invoice directly to customer's WhatsApp"
            >
              <Send size={14} className={sendingPdf ? 'animate-bounce' : ''} />
              <span className="hidden sm:inline">
                {sendingPdf ? 'Sending PDF...' : sentSuccess ? 'BILL SENT VIA LINKED WHATSAPP ✓' : 'Send WhatsApp PDF'}
              </span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#111111] hover:bg-[#F3F3F3] text-xs font-extrabold uppercase rounded-lg transition-colors cursor-pointer"
              title="Print or Save as PDF"
            >
              <Printer size={14} />
              <span className="hidden sm:inline">Print / PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              aria-label="Close invoice"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* PRINTABLE LATEX-MATCHED DOCUMENT CONTENT */}
        <div className="p-6 sm:p-10 font-sans text-[#171717] bg-white print:p-6 select-text">
          
          {/* HEADER SECTION */}
          <div className="flex justify-between items-start">
            <div>
              <img
                src="/logo.png"
                alt="GO GRAND Car Wash & Detailing"
                className="h-12 sm:h-14 object-contain rounded-lg mb-1"
              />
              <p className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-[#171717] mb-1">
                CAR WASH & DETAILING
              </p>
              <p className="text-xs text-[#555555] leading-snug">
                Tirupati Highway, Murukambattu, Andhra Pradesh<br />
                Phone: 8008195435 &nbsp;|&nbsp; Email: kamalvamsi2001@gmail.com
              </p>
            </div>

            <div className="text-right">
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#171717]">
                INVOICE
              </h2>
              <div className="text-xs text-[#171717] font-semibold mt-1 space-y-0.5">
                <p><span className="font-bold">Bill No:</span> {billNo}</p>
                <p><span className="font-bold">Date:</span> {dateStr}</p>
              </div>
            </div>
          </div>

          {/* BRAND YELLOW ACCENT BAR */}
          <div className="w-full h-1 bg-[#F4C430] my-3" />

          {/* CUSTOMER & VEHICLE INFORMATION GRID */}
          <div className="mt-4">
            <h3 className="text-sm font-bold text-[#171717] mb-2 uppercase">
              Customer & Vehicle Information
            </h3>

            <div className="border border-[#D8D8D8] rounded-md overflow-hidden grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#D8D8D8]">
              
              {/* BILL TO */}
              <div>
                <div className="bg-[#F3F3F3] px-3 py-1.5 border-b border-[#D8D8D8] text-xs font-bold uppercase text-[#171717]">
                  BILL TO
                </div>
                <div className="p-3 text-xs space-y-1.5 text-[#171717]">
                  <p><span className="font-bold">Name:</span> {record.customerName}</p>
                  <p><span className="font-bold">Mobile:</span> {record.phoneNumber}</p>
                  <p><span className="font-bold">Email:</span> {record.email || 'customer@email.com'}</p>
                  <p><span className="font-bold">Address:</span> {record.location || record.address || 'Chittoor'}</p>
                </div>
              </div>

              {/* VEHICLE DETAILS */}
              <div>
                <div className="bg-[#F3F3F3] px-3 py-1.5 border-b border-[#D8D8D8] text-xs font-bold uppercase text-[#171717]">
                  VEHICLE DETAILS
                </div>
                <div className="p-3 text-xs space-y-1.5 text-[#171717]">
                  <p><span className="font-bold">Vehicle No:</span> <span className="font-extrabold uppercase">{record.vehicleNumber}</span></p>
                  <p><span className="font-bold">Model:</span> {record.vehicleName || 'Hyundai Venue'}</p>
                  <p><span className="font-bold">Service Date:</span> {dateStr}</p>
                  <p><span className="font-bold">Location:</span> GO GRAND</p>
                </div>
              </div>

            </div>
          </div>

          {/* SERVICE DETAILS TABLE */}
          <div className="mt-6">
            <h3 className="text-sm font-bold text-[#171717] mb-2 uppercase">
              Service Details
            </h3>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-[#171717] font-bold uppercase">
                  <th className="py-2 pr-2 text-left">DESCRIPTION</th>
                  <th className="py-2 px-2 text-center w-24">RATE</th>
                  <th className="py-2 px-2 text-center w-16">QTY</th>
                  <th className="py-2 pl-2 text-right w-28">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#E5E5E5]">
                  <td className="py-2.5 pr-2 font-bold uppercase">
                    <div>{sectionName}</div>
                    {selectedServices.length > 0 && (
                      <div className="mt-1 text-[10px] font-normal normal-case text-[#555555]">
                        {selectedServices.join(' • ')}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center">Rs. {priceNum.toFixed(2)}</td>
                  <td className="py-2.5 px-2 text-center">1</td>
                  <td className="py-2.5 pl-2 text-right font-bold">Rs. {priceNum.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            <div className="w-full border-b border-[#171717] mt-2" />
          </div>

          {/* TOTAL SECTION */}
          <div className="mt-4 flex justify-end">
            <div className="w-56 text-xs space-y-1.5">
              <div className="flex justify-between text-[#555555]">
                <span>Subtotal:</span>
                <span>Rs. {priceNum.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[#555555]">
                <span>Discount:</span>
                <span>Rs. {discountNum.toFixed(2)}</span>
              </div>
              <div className="w-full border-b border-[#D8D8D8] my-1" />
              <div className="flex justify-between font-black text-sm text-[#171717]">
                <span>GRAND TOTAL</span>
                <span>Rs. {grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* AMOUNT IN WORDS BOX */}
          <div className="mt-5 bg-[#F3F3F3] p-3 rounded border border-[#E5E5E5] text-xs">
            <p className="text-[#171717]">
              <span className="font-bold">Amount in Words:</span> {amountInWords}
            </p>
          </div>

          {/* THANK YOU SECTION */}
          <div className="mt-8 text-center space-y-1">
            <h4 className="text-sm font-bold text-[#171717]">
              Thank You for Choosing GO GRAND
            </h4>
            <p className="text-xs text-[#555555]">
              We appreciate your business and look forward to serving you again.
            </p>
            <p className="text-xs font-bold text-[#171717] uppercase tracking-wider pt-1">
              GO GRAND • CAR WASH & DETAILING
            </p>
          </div>

          {/* FOOTER NOTICE */}
          <div className="mt-6 pt-2 border-t border-[#D8D8D8] text-center text-[10px] text-[#777777]">
            This is a computer-generated invoice. No signature is required.
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
};
