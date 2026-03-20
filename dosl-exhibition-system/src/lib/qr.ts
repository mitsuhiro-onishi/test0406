import QRCode from "qrcode";

export async function generateQRCodeDataURL(
  ticketCode: string,
): Promise<string> {
  return QRCode.toDataURL(ticketCode, {
    width: 300,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
    errorCorrectionLevel: "M",
  });
}

export async function generateQRCodeSVG(ticketCode: string): Promise<string> {
  return QRCode.toString(ticketCode, {
    type: "svg",
    width: 300,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}
