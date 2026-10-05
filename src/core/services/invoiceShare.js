/**
 * Print / share for sales invoices (the original used window.print + a wa.me link).
 *  - printInvoice():     browser print dialog (also "Save as PDF") — ORIGINAL + COPY pages
 *  - shareInvoicePdf():  print dialog, then opens the customer's WhatsApp chat so the PDF can be attached
 */
import logoUrl from '@/assets/brand/logo.png';
import { calculateTotalReturns } from '@/core/billing';
import { db } from '@/core/db';
import { printHtml, sharePdfHtml } from '@/platform';
import { buildCombinedInvoiceHtml } from './invoiceHtml';
import { normalizeWhatsAppPhone, openWhatsApp } from './whatsapp';

let logoPromise = null;

/** Company logo as a data URI so it is embedded in printed documents (works offline and inside the print iframe). */
export function getLogoSrc() {
  if (!logoPromise) {
    logoPromise = (async () => {
      try {
        const blob = await (await fetch(logoUrl)).blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.warn('Could not load logo for invoice', error);
        return '';
      }
    })();
  }
  return logoPromise;
}

async function buildContext(invoice) {
  const totalReturns = await calculateTotalReturns(invoice.invoiceNo);
  const returns = await db.getReturnsByInvoice(invoice.invoiceNo);
  return {
    invoice,
    totalReturns,
    adjustedBalanceDue: invoice.balanceDue - totalReturns,
    returns,
    logoSrc: await getLogoSrc(),
  };
}

/** Opens the print dialog for the combined ORIGINAL + COPY invoice. */
export async function printInvoice(invoice) {
  const html = buildCombinedInvoiceHtml(await buildContext(invoice));
  await printHtml(html);
}

/**
 * "Share BILL": builds the invoice PDF and opens the device's share sheet with it ('shared'). Where the browser cannot
 * share files: print dialog (save as PDF) and the customer's WhatsApp chat to attach it ('fallback').
 */
export async function shareInvoicePdf(invoice) {
  const html = buildCombinedInvoiceHtml(await buildContext(invoice));
  if (
    (await sharePdfHtml(html, `Invoice-${invoice.invoiceNo}.pdf`, `Invoice #${invoice.invoiceNo}`)) ===
    'shared'
  )
    return 'shared';
  await printHtml(html);
  if (normalizeWhatsAppPhone(invoice.customerPhone)) await openWhatsApp(invoice.customerPhone);
  return 'fallback';
}
