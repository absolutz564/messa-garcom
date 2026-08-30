import QRCode from 'qrcode';
import sharp from 'sharp';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** Textos do cartaz de mesa (09-ux/copy.md). */
export const CARD_COPY = {
  headline: 'Faça seu pedido pelo celular',
  slogan: 'Messa · seu garçom virtual',
  hint: 'Aponte a câmera do celular para o código',
  hint2: 'Toque em “Iniciar atendimento” e faça seu pedido',
};

export interface CardInput {
  restaurantName: string;
  tableName: string;
  qrUrl: string;
  primaryColor: string;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Cartaz 1000×1400 px (proporção 5:7, ≈ 10×14 cm a 254 dpi). SVG com o QR embutido como PNG.
 * Fonte genérica (sans-serif) para renderizar igual em qualquer servidor.
 */
export async function cardSvg(input: CardInput): Promise<string> {
  const qrPng = await QRCode.toDataURL(input.qrUrl, { type: 'image/png', width: 640, margin: 1, errorCorrectionLevel: 'M' });
  const color = /^#[0-9a-fA-F]{6}$/.test(input.primaryColor) ? input.primaryColor : '#e11d48';
  const table = esc(input.tableName);
  const rest = esc(input.restaurantName);
  const tableSize = table.length > 12 ? 72 : table.length > 8 ? 92 : 120;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1400" viewBox="0 0 1000 1400" font-family="Helvetica, Arial, 'DejaVu Sans', sans-serif">
  <rect width="1000" height="1400" fill="#ffffff"/>
  <rect x="40" y="40" width="920" height="1320" rx="48" fill="none" stroke="${color}" stroke-width="10"/>
  <rect x="40" y="40" width="920" height="230" rx="48" fill="${color}"/>
  <rect x="40" y="200" width="920" height="70" fill="${color}"/>
  <text x="500" y="145" text-anchor="middle" font-size="60" font-weight="700" fill="#ffffff">${rest}</text>
  <text x="500" y="230" text-anchor="middle" font-size="40" fill="#ffffff" opacity="0.95">${esc(CARD_COPY.headline)}</text>
  <text x="500" y="${tableSize > 100 ? 420 : 410}" text-anchor="middle" font-size="${tableSize}" font-weight="700" fill="#111111">${table}</text>
  <image href="${qrPng}" x="180" y="470" width="640" height="640"/>
  <text x="500" y="1180" text-anchor="middle" font-size="36" fill="#333333">${esc(CARD_COPY.hint)}</text>
  <text x="500" y="1232" text-anchor="middle" font-size="30" fill="#666666">${esc(CARD_COPY.hint2)}</text>
  <text x="500" y="1320" text-anchor="middle" font-size="34" font-weight="700" fill="${color}">${esc(CARD_COPY.slogan)}</text>
</svg>`;
}

export async function cardPng(input: CardInput): Promise<Buffer> {
  const svg = await cardSvg(input);
  return sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
}

/**
 * PDF A4 com 2 cartazes por página (≈ 9,5×13,3 cm cada), um por mesa — para imprimir e recortar.
 * Textos com Helvetica embutida (suporta acentos WinAnsi).
 */
export async function cardsPdf(cards: CardInput[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Messa — QR Codes das mesas');
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const A4 = { w: 595.28, h: 841.89 };
  const card = { w: 270, h: 378 };
  const slots = [
    { x: (A4.w - card.w * 2 - 20) / 2, y: A4.h - 40 - card.h },
    { x: (A4.w - card.w * 2 - 20) / 2 + card.w + 20, y: A4.h - 40 - card.h },
    { x: (A4.w - card.w * 2 - 20) / 2, y: A4.h - 60 - card.h * 2 },
    { x: (A4.w - card.w * 2 - 20) / 2 + card.w + 20, y: A4.h - 60 - card.h * 2 },
  ];
  const hex = (h: string) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h) ?? ['', 'e1', '1d', '48'];
    return rgb(parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255);
  };
  const center = (page: import('pdf-lib').PDFPage, text: string, x: number, y: number, size: number, font: typeof bold, color = rgb(0.07, 0.07, 0.07), maxW = card.w - 24) => {
    let s = size;
    while (font.widthOfTextAtSize(text, s) > maxW && s > 8) s -= 1;
    page.drawText(text, { x: x + (card.w - font.widthOfTextAtSize(text, s)) / 2, y, size: s, font, color });
  };

  let page = pdf.addPage([A4.w, A4.h]);
  for (let i = 0; i < cards.length; i++) {
    const slot = slots[i % 4]!;
    if (i > 0 && i % 4 === 0) page = pdf.addPage([A4.w, A4.h]);
    const c = cards[i]!;
    const color = hex(c.primaryColor);
    page.drawRectangle({ x: slot.x, y: slot.y, width: card.w, height: card.h, borderColor: color, borderWidth: 2.5, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: slot.x, y: slot.y + card.h - 62, width: card.w, height: 62, color });
    center(page, c.restaurantName, slot.x, slot.y + card.h - 30, 15, bold, rgb(1, 1, 1));
    center(page, CARD_COPY.headline, slot.x, slot.y + card.h - 50, 10, regular, rgb(1, 1, 1));
    center(page, c.tableName, slot.x, slot.y + card.h - 100, 30, bold);
    const qr = await QRCode.toBuffer(c.qrUrl, { type: 'png', width: 600, margin: 1, errorCorrectionLevel: 'M' });
    const img = await pdf.embedPng(qr);
    const qrSize = 180;
    page.drawImage(img, { x: slot.x + (card.w - qrSize) / 2, y: slot.y + 75, width: qrSize, height: qrSize });
    center(page, CARD_COPY.hint, slot.x, slot.y + 55, 9, regular, rgb(0.2, 0.2, 0.2));
    center(page, CARD_COPY.hint2, slot.x, slot.y + 42, 8, regular, rgb(0.4, 0.4, 0.4));
    center(page, CARD_COPY.slogan, slot.x, slot.y + 18, 10, bold, color);
  }
  return pdf.save();
}
