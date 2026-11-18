// Shared FS-33 test data: a seeded gear state with private values planted in every field a leak could come from.
import { readFileSync } from 'node:fs';

/** Synthetic, structurally valid JPEG (same shape as the photo-store tests) with optional extra segments before SOF. */
export function tinyJpeg(w = 4, h = 3, extra = [], seed = 1) {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, ...extra,
    0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0,
    0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0x12, seed, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0xff, 0xd9,
  ]);
}

const seg = (marker, text) => { const b = [...Buffer.from(text, 'latin1')]; const len = b.length + 2; return [0xff, marker, len >> 8, len & 255, ...b]; };

/** EXIF with GPS (APP1), ICC-like APP2, IPTC (APP13) and a COM comment carrying a user name and a path. */
export const EXIF_GPS_TEXT = 'Exif\0\0GPSLatitude 51.501364 N GPSLongitude 0.141890 W Owner sheldon.davidson';
export const COMMENT_TEXT = 'Taken by sheldon at C:\\Users\\sheldon\\Pictures';
export function jpegWithMetadata(seed = 2) {
  return tinyJpeg(4, 3, [...seg(0xe1, EXIF_GPS_TEXT), ...seg(0xe2, 'ICC_PROFILE homeprinter'), ...seg(0xfe, COMMENT_TEXT)], seed);
}

export const CERT_FILE = readFileSync(new URL('./fixtures/certificate/valid-v1.deckchek-cert.json', import.meta.url), 'utf8');

/** Values that must never reach an exported file unless the user explicitly opted in. */
export const SEEDS = Object.freeze({
  serial: 'SN-SEEDED-7731-9902',
  nickname: 'Sheldon Basement Deck',
  notes: 'Bought from Jane Customerson, stored at 12 Hidden Lane',
  customer: 'Jane Customerson',
  serviceText: 'Fixed for customer Jane Customerson, invoice 4471',
  winPath: 'C:\\Users\\sheldon\\Pictures\\deck-front.jpg',
  posixPath: '/home/sheldon/Pictures/deck-side.jpg',
  username: 'sheldon',
  gps: 'GPSLatitude',
  exif: 'Exif',
  venue: 'Club Secretvenue',
  price: 'PRICE-1450-EUR',
});

export function seededState({ certificate = true } = {}) {
  return {
    manufacturers: [{ id: 'm1', name: 'Technics' }, { id: 'm2', name: 'Pioneer DJ' }],
    products: [{ id: 'p1', manufacturerId: 'm1', model: 'SL-1200MK4', category: 'turntable' }, { id: 'p2', manufacturerId: 'm2', model: 'PLX-CRSS12', category: 'turntable' }],
    assets: [
      { id: 'asset-1', productId: 'p1', nickname: SEEDS.nickname, serialNumber: SEEDS.serial, purchaseDate: '2023-05-14', condition: 'good', firmware: '1.10',
        notes: SEEDS.notes, publicNotes: `Factory serviced. Photos in ${SEEDS.winPath} and ${SEEDS.posixPath}.`, venueName: SEEDS.venue, price: SEEDS.price },
      { id: 'asset-2', productId: 'p2', nickname: 'Second deck', serialNumber: 'CRSS12-00042', purchaseDate: '2024-01', condition: 'like new', notes: '' },
    ],
    service: {
      'asset-1': [
        { eventType: 'replace_part', eventAt: '2025-02-01T10:00:00Z', description: SEEDS.serviceText, serviceProvider: SEEDS.customer },
        { eventType: 'clean', eventAt: '2024-11-03T09:00:00Z', description: '' },
      ],
    },
    photos: {
      'asset-1': [
        { photoId: 'ph1', sha256: 'x', altText: '', caption: SEEDS.winPath, bytes: jpegWithMetadata(3) },
        { photoId: 'ph2', sha256: 'y', altText: 'Tonearm close-up', caption: '', bytes: tinyJpeg(8, 6, [], 4) },
      ],
      'asset-2': [{ photoId: 'ph3', altText: `Side view ${SEEDS.posixPath}`, bytes: tinyJpeg(5, 5, [], 5) }],
    },
    certificates: certificate ? { 'asset-2': [{ id: 'cert-1', fileJson: CERT_FILE, pdfPath: SEEDS.winPath, jsonPath: SEEDS.posixPath, testerName: 'Alex Tester' }] } : {},
  };
}

/** Every exported file as one searchable string (text as is, base64 decoded as latin1 so binary metadata is visible). */
export function exportedText(files) {
  return files.map(f => (f.text != null ? f.text : Buffer.from(f.base64, 'base64').toString('latin1'))).join('\n');
}
