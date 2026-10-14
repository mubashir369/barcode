export interface A4Line {
  text: string;
  fontSizePt: number;
  bold?: boolean;
  italic?: boolean;
  uppercase?: boolean;
  align?: "left" | "center" | "right";
  color?: string;
  marginTopMm?: number;
  show?: boolean;
}

export interface A4Settings {
  fontFamily: string;
  textColor: string;

  columns: number;
  rows: number;
  repeatByPrintQty: boolean;

  pageMarginMm: number;
  contentWidthNum?: number;
  contentHeightMm: number;

  cardWidthMm: number;
  cardHeightMm: number;

  cellPaddingMm: number;
  cellBorder: string;
  topOffsetMm: number;
  horizontalAlign: "left" | "center" | "right";

  lines: A4Line[];
}

export const A4_SETTINGS: A4Settings = {
  fontFamily: "Arial, Helvetica, sans-serif",
  textColor: "#000000",

  columns: 4,
  rows: 3,
  repeatByPrintQty: true,

  pageMarginMm: 0,
  contentWidthNum: 210,
  contentHeightMm: 297,

  cardWidthMm: 50,
  cardHeightMm: 95,

  cellPaddingMm: 2,
  cellBorder: "none",
  topOffsetMm: 50,
  horizontalAlign: "center",

  lines: [
    {
      text: "SRP: {offer}",
      fontSizePt: 14,
      bold: true,
      align: "center",
    },
    {
      text: "You saved {saved}",
      fontSizePt: 10,
      align: "center",
      marginTopMm: 2,
    },
    {
      text: "{itemName}",
      fontSizePt: 9,
      align: "center",
      marginTopMm: 2,
      show: true,
    },
    {
      text: "MRP: {mrp}",
      fontSizePt: 8,
      align: "center",
      marginTopMm: 1,
      show: true,
    },
    {
      text: "{barcode}",
      fontSizePt: 7,
      align: "center",
      marginTopMm: 1,
      color: "#555555",
      show: true,
    },
  ],
};

const money = (n: number) =>
  n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// One selected barcode + its offer price + print quantity
export interface BatchEntry {
  id: string;
  item: {
    barcode: string;
    itemName: string;
    brand: string;
    itemGroup: string;
    sellingPrice: number;
    purchasePrice?: number;
  };
  offerPrice: number;
  savedAmount: number;
  printQty: number;
}

interface Props {
  entries: BatchEntry[];
  settings?: A4Settings;
}

export default function A4Sheet({ entries, settings = A4_SETTINGS }: Props) {
  const s = settings;

  const fillWith = (values: Record<string, string>, text: string) =>
    text.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);

  // Flatten all entries into one list of stickers.
  // Each entry is repeated printQty times (or once if repeatByPrintQty is off).
  const stickers = entries.flatMap((e) => {
    const copies = s.repeatByPrintQty
      ? Math.max(0, Math.floor(Number(e.printQty) || 0))
      : 1;

    const values: Record<string, string> = {
      offer: money(e.offerPrice),
      saved: money(e.savedAmount),
      mrp: money(e.item.sellingPrice),
      itemName: e.item.itemName,
      brand: e.item.brand,
      group: e.item.itemGroup,
      barcode: e.item.barcode,
      qty: String(e.printQty),
    };

    return Array.from({ length: copies }, (_, i) => ({
      key: `${e.id}-${i}`,
      values,
    }));
  });

  // Number of stickers that fit on one A4 page.
  const perPage = Math.max(1, s.columns * s.rows);

  const totalCopies = stickers.length;

  // Avoid rendering an empty page when there is nothing to print.
  if (totalCopies === 0) {
    return null;
  }

  // Split the stickers into pages.
  const totalPages = Math.ceil(totalCopies / perPage);

  return (
    <>
      {Array.from({ length: totalPages }, (_, pageIndex) => {
        const pageStickers = stickers.slice(
          pageIndex * perPage,
          (pageIndex + 1) * perPage
        );

        return (
          <div
            key={pageIndex}
            className="hidden print:block"
            style={{
              fontFamily: s.fontFamily,
              color: s.textColor,
              width: `${s.contentWidthNum ?? 210}mm`,
              height: `${s.contentHeightMm}mm`,
              margin: `${s.pageMarginMm}mm auto`,
              boxSizing: "border-box",
              pageBreakAfter:
                pageIndex < totalPages - 1 ? "always" : "auto",
              breakAfter:
                pageIndex < totalPages - 1 ? "page" : "auto",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${s.columns}, ${s.cardWidthMm}mm)`,
                gridTemplateRows: `repeat(${s.rows}, ${s.cardHeightMm}mm)`,
                width: "100%",
                height: "100%",
              }}
            >
              {pageStickers.map((sticker) => (
                <div
                  key={sticker.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems:
                      s.horizontalAlign === "center"
                        ? "center"
                        : s.horizontalAlign === "right"
                          ? "flex-end"
                          : "flex-start",
                    padding: `${s.cellPaddingMm}mm`,
                    paddingTop: `${s.topOffsetMm}mm`,
                    border: s.cellBorder || undefined,
                    boxSizing: "border-box",
                    overflow: "hidden",
                    width: `${s.cardWidthMm}mm`,
                    height: `${s.cardHeightMm}mm`,
                  }}
                >
                  {s.lines
                    .filter((line) => line.show !== false)
                    .map((line, j) => (
                      <div
                        key={j}
                        style={{
                          fontSize: `${line.fontSizePt}pt`,
                          fontWeight: line.bold ? 700 : 400,
                          fontStyle: line.italic ? "italic" : "normal",
                          textTransform: line.uppercase
                            ? "uppercase"
                            : "none",
                          textAlign: line.align ?? s.horizontalAlign,
                          color: line.color ?? s.textColor,
                          marginTop: line.marginTopMm
                            ? `${line.marginTopMm}mm`
                            : 0,
                          lineHeight: 1.15,
                          width: "100%",
                        }}
                      >
                        {fillWith(sticker.values, line.text)}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}