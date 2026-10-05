/**
 * Brightlight Solutions branding — the one place company details are defined.
 * Printed invoices, statements and WhatsApp messages read from here; empty contact fields are simply left out.
 */
export const COMPANY = {
  name: 'BRIGHTLIGHT SOLUTIONS',
  displayName: 'Brightlight Solutions',
  tagline: 'Technology That Moves Business Forward',
  /** short monogram printed in the invoice watermark */
  monogram: 'BL',
  address: 'Kamatchi Amman Kovil Street, Kumarananthapuram, Tiruppur, Tamil Nadu 641602, India',
  cell: '+91 78450 81278',
  email: 'contact@brightlightsolutions.in',
  website: 'www.brightlightsolutions.in',
  hours: '24 Hours',
  /** payment number printed under the amount in words (omitted when empty) */
  gpay: '',
  /** shown in the WhatsApp statement footer (omitted when empty) */
  whatsappLocation: 'Tiruppur, Tamil Nadu',
  whatsappPhones: '+91 78450 81278',
  /** software credit appended to invoices and WhatsApp messages */
  creditName: 'Brightlight Solutions',
  creditPhone: '+91 78450 81278',
};

/** Product name shown in the app chrome, PWA manifest and page titles. */
export const PRODUCT = {
  name: 'Brightlight Billing',
  suite: 'Billing & Invoice Management',
};

/** What the company builds — used on the login / dashboard hero. */
export const SERVICES = ['Billing & Finance', 'ERP', 'CRM', 'Mobile Applications', 'Web Software'];

export const CREDIT_LINE = `Powered by ${COMPANY.creditName} — ${COMPANY.tagline}`;
/** Country calling code prepended to 10-digit Indian numbers for wa.me links. */
export const COUNTRY_CODE = '91';
