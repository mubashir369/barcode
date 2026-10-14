export interface PrnValues {
  offerPrice: number;
  savedAmount: number;
  quantity?: number; // number of labels to print
}

const fmt = (n: number) => n.toFixed(2);

/**
 * Builds the thermal-printer PRN string. Lines are joined with CRLF,
 * which most label printers expect. Quantity goes into the Qxxxx command.
 */
export function generatePrn({ offerPrice, savedAmount, quantity = 1 }: PrnValues): string {
  const saved = fmt(savedAmount);
  const offer = fmt(offerPrice);
  const qty = String(Math.min(9999, Math.max(1, Math.floor(quantity)))).padStart(4, "0");

  return (
    [
      "<xpml><page quantity='0' pitch='30.0 mm'></xpml>n",
      "M0500",
      "KcLW0384;",
      "O0220",
      "d",
      "<xpml></page></xpml><xpml><page quantity='1' pitch='30.0 mm'></xpml>L",
      "D11",
      "ySPM",
      "A2",
      "1911A1000720010YEAR END SALE",
      `1911A0800260016YOU SAVED ${saved}`,
      `1911A1400450007SRS: ${offer}`,
      "1911A1000720170YEAR END SALE",
      `1911A0800260177YOU SAVED ${saved}`,
      `1911A1400450168SRS: ${offer}`,
      `Q${qty}`,
      "E",
      "<xpml></page></xpml><xpml><end/></xpml>",
    ].join("\r\n") + "\r\n"
  );
}

export function downloadPrn(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".prn") ? filename : `${filename}.prn`;
  a.click();
  URL.revokeObjectURL(url);
}