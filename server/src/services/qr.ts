import QRCode from 'qrcode';

/** QR encodes only the unique ID — never Aadhaar/phone/medical data. */
export async function generateQrDataUrl(uniqueId: string): Promise<string> {
  return QRCode.toDataURL(uniqueId, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
  });
}
