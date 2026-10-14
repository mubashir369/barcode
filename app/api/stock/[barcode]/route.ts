import { getStockCollection } from "@/app/lib/mongodb";
import { NextResponse } from "next/server";


export async function GET(
  _req: Request,
  { params }: { params: Promise<{ barcode: string }> }
) {
  try {
    const { barcode: raw } = await params;
    const barcode = decodeURIComponent(raw).trim();

    if (!barcode) {
      return NextResponse.json({ error: "Barcode is required." }, { status: 400 });
    }

    const stocks = await getStockCollection();
    // Barcodes may be stored as strings or numbers; match either.
    const candidates: (string | number)[] = [barcode];
    if (/^\d+$/.test(barcode)) candidates.push(Number(barcode));

    const item = await stocks.findOne({ barcode: { $in: candidates } });

    if (!item) {
      return NextResponse.json(
        { error: `No stock found for barcode ${barcode}.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ ...item, _id: item._id.toString() });
  } catch (err) {
    console.error("Stock lookup failed:", err);
    return NextResponse.json(
      { error: "Server error while looking up stock. Try again." },
      { status: 500 }
    );
  }
}